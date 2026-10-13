# Overview

What SmartShark is, how the backend is organized, and why the pieces are the way they are.

Read [database.md](./database.md) for the schema and [logic.md](./logic.md) for how requests flow.

## 1. What this is

SmartShark is a Virtual Shark Tank. Businesses pitch for investment. Investors browse, match, and make offers. Deals close inside the platform.

There are two dashboards but one backend. A business owner builds a profile, gets a readiness score, publishes pitches, and receives offers. An investor browses matched businesses, shortlists the ones worth following up, chats with founders, and makes offers. Both dashboards share the same auth, notifications, chat, and matching engine — the difference is which screens load by default after login.

Capabilities overlap more than you'd expect. A user can own a business and invest in others at the same time. That's not a bug — it's a design decision that came up early and shaped the whole permission model (see §6).

Status: everything through verification and offers is done. Readiness scoring exists as a rule-based scorer, not the ML model yet. AI pitch assistant is next.

## 2. Shape of the system

Three tiers: a React client, an Express API, and two databases.

```
client (React)
    │  HTTPS, JWT bearer tokens, httpOnly cookies
    ▼
Express API (single deployable process)
    │
    ├── Postgres (Neon)   ← relational data, transactions, joins
    └── MongoDB (Atlas)   ← verification documents, OCR output
```

The API is a modular monolith. One process, one deploy, internally split into five layers that only depend downward. It's not microservices, and it shouldn't be until there's a specific service with a wildly different scaling profile that justifies the extra operational cost.

## 3. Layers

Both the code and the data follow the same dependency stack — identity at the base, communication at the top, everything referencing downward.

| Layer | Code | Data |
|---|---|---|
| Identity | Auth service, auth middleware | `users`, `refresh_tokens` |
| Profiles | Business + investor profile services | `businesses`, `investor_profiles` |
| Discovery | Match, follow, profile-view services | `matches`, `follows`, `profile_views` |
| Communication | Conversation, message, notification services | `conversations`, `messages`, `notifications` |
| Domain | Pitch, offer, investment services | `pitches`, `offers`, `investments` |

Two things sit outside the stack. Analytics tables (`readiness_scores`, `profile_edit_history`) are append-only history and get written by services in any layer. Verification lives in Mongo and has its own pipeline that touches both databases.

The rule is simple: a layer references layers below it, never the reverse. A pitch (domain) points at a business (profiles) and a user (identity). Nothing in identity knows pitches exist.

## 4. Why two databases

Everything queried, joined, filtered, or updated transactionally lives in Postgres. Users, businesses, pitches, offers, investments, matches, conversations, notifications, events. That's the bulk of the system and it needs ACID, foreign keys, and indexes.

The exception is verification documents. When someone uploads an Udyam certificate, OCR extracts fields from it. When they upload a GST certificate, the shape of the extraction is completely different. Udyam gives you an enterprise name and a registration number. GST gives you a legal name, a GSTIN, a principal place of business, a date of liability, a business constitution. Shop Act is different again. There's no common schema. And there are no joins needed — you always fetch a verification by `businessId` or `userId`, and the relationship to Postgres is a single string field.

Forcing that into Postgres would mean either a very wide sparse table or a `jsonb` column that defeats the point of having a relational schema. Mongo handles it naturally. Schema varies per document type, no migrations when a new document type gets added, and the data shape stays readable.

The boundary between the two stores is one model: `Verification`. Linked back to Postgres by `userId` and `businessId` string fields, enforced in the service layer. No cross-database joins anywhere, no dual writes in a hot path.

## 5. The monolith decision

One Express app, one deploy, one process.

Microservices would add deployment orchestration, distributed tracing, and sagas in place of local transactions. The pain they solve — coordinating independent deploys across separate teams — doesn't exist at this scale. And a deal acceptance in this system spans five tables. Doing that as a distributed saga instead of a single Postgres transaction would be a large regression in both correctness and complexity.

When to split: when a specific part of the system has a genuinely different scaling or runtime profile. Matching is compute-heavy and could run in a worker. Chat could move to WebSockets and become stateful. Notifications could batch through a queue. Those are candidates. Everything else stays in the monolith.

### Internal structure

```
server/src/
├── config/         DB connections, env, Cloudinary, Redis, Swagger
├── models/         Drizzle tables + Mongoose schemas
├── routes/         URL → handler mapping
├── middleware/     auth, validation, uploads, errors
├── controllers/    HTTP boundary
├── services/       business logic
├── validators/     Zod schemas
├── events/         event type registry
├── utils/          pure helpers
└── app.js          Express setup
```

Dependencies point down. Routes call controllers. Controllers call services. Services call models. Middleware, validators, and utils get called from anywhere but depend on nothing themselves.

The two rules that matter most:

Controllers never import the database client. If you're querying in a controller, you're in the wrong file.
Services never import `req` or `res`. They take plain arguments and return plain data. This is what makes them testable without HTTP.

### Stateless by design

The API process holds no session state in memory. Every request can be served by any instance, no sticky sessions needed.

That works because auth is JWT-based — verified on every request from the token alone, no server-side session lookup. Refresh tokens live in Postgres, so any instance can revoke any session. The one exception is the in-memory rate limiter and the Redis cache; both are explicitly designed to move to a shared store when the platform runs on multiple instances, and neither is load-bearing for correctness.

## 6. Security

The auth layer is the security boundary. Once `requireAuth` runs, everything downstream trusts `req.user`. Services don't re-verify who you are, they verify what you own.

### Tokens

Access token is a 15-minute HS256 JWT signed with `JWT_SECRET`. It lives in client memory and travels in the `Authorization: Bearer` header. Short-lived because it's stateless — if stolen, the attacker has fifteen minutes and then it expires. Nothing can revoke it.

Refresh token is a 96-character opaque hex string. It lives in an httpOnly cookie (JavaScript can't read it) and is stored in Postgres as a SHA256 hash. Thirty-day lifetime. Revocable.

The refresh token is what makes logout real. Without it, a stolen JWT stays valid until expiry — you have no way to invalidate it. With it, logout revokes the token in the database and the next refresh fails.

### Rotation

Every `/refresh` call does three things: marks the old refresh token row as revoked, inserts a new one, and returns a new access token with a new cookie. The old token is dead the moment it's used.

That's also theft detection. If a stolen refresh token gets used, the legitimate user's next refresh fails because their token was already rotated by the attacker. The failure is a signal — the token was compromised, log the user out everywhere and require re-authentication.

### What each defense protects against

| Threat | Defense |
|---|---|
| Password leak | bcrypt with 12 salt rounds |
| Database leak | Passwords and refresh tokens are both hashed |
| XSS | Refresh token in httpOnly cookie, unreachable from JS |
| CSRF | `SameSite=Strict` on the refresh cookie |
| Token theft | 15-minute access TTL, refresh rotation |
| User enumeration | Same error message for wrong email and wrong password |
| Privilege escalation | Zod strips unknown body fields, admin role disallowed at signup |
| Banned user | `isActive` checked on every login and refresh |
| Profile tampering | Ownership asserted in services, not just middleware |

### Why there's no `requireRole`

An earlier version had role-based route guards. The multi-business refactor removed them entirely.

The reason is that roles don't capture what's actually being protected. A user can own a business and invest in others. On a route like "update this business", the role isn't what matters — what matters is whether this specific business belongs to this specific user. That's not a role, it's an ownership check.

So every business-scoped service call starts with `assertBusinessOwnership`. The check is small, it's reusable, and it works regardless of what else the user does on the platform. Role is still in the JWT because the frontend uses it to pick which sidebar to render, but no route or service gates on it.

## 7. Scaling

The system scales through infrastructure changes, not schema rewrites. Foreign keys and indexes are already in place. There's no denormalization debt to pay down.

Four rough stages:

Up to about 10k users, nothing changes — bigger server, paid database tiers, done.

10k to 500k, add more instances of the stateless API behind a load balancer. Schema doesn't change. The rate limiter and feed cache need to move to Redis at this point, but that's a library swap, not a design change.

500k to 5M, add read replicas for the read-heavy queries (feeds, match lists), enable Postgres partitioning on the high-volume tables (`events`, `feed_impressions`, `messages`), and lean harder on Redis.

5M+, extract the parts with genuinely different profiles. Matching can run in a worker instead of on the request path. Notifications can batch through a queue. Chat can become a WebSocket service. None of these need schema changes — the data model already supports it.

What breaks first, in order: Neon connection limits around 50k users, then match recompute runtime around 100k, then feed query latency around 500k, then notification write throughput around 1M. Each one has a straightforward fix that doesn't touch the schema.

## 8. Tech stack

Runtime is Node 22 with ESM. Framework is Express — minimal, mature, and there's no reason to reach for something heavier when the API is a thin layer over services.

ORM is Drizzle. It's SQL-first, which matters because a lot of the queries here have specific shapes — joins with `innerJoin`, upserts with `onConflictDoUpdate`, partial indexes. An ORM that hides SQL would get in the way. Drizzle gets out of the way.

Postgres is Neon, connected via the `pg` driver. Not Neon's HTTP driver — that's for serverless functions. This is a long-running Express process that wants persistent TCP connections and a connection pool.

Mongo is Atlas, connected via Mongoose. Mongoose gives schema validation on documents even though Mongo doesn't require it — worth it for the fields we do know about, and it doesn't constrain the OCR data.

Auth is bcrypt for passwords (12 rounds) and `jsonwebtoken` for access tokens. Symmetric HS256 is fine here because there's one issuer and one verifier. No key distribution problem.

Validation is Zod. It's type-safe, it strips unknown fields by default, and the error messages are useful enough to send back to clients.

Testing is Vitest with Supertest and PGlite. PGlite is Postgres compiled to WebAssembly — same SQL, in-memory, no Docker required in CI. Mongo tests use `mongodb-memory-server`, which gives real Mongoose behavior without an external service.

API docs are generated from `@openapi` JSDoc blocks in route files and served through Swagger UI at `/docs`. The spec and the routes can't drift because they live in the same file.

CI is GitHub Actions. Every push runs the full test suite.

## 9. Deployment shape

The API needs a host that supports a long-running Node process — Render, Fly.io, Railway, anything in that family. Not serverless. Neon's HTTP driver is serverless-only and the API specifically doesn't use it.

The databases are already hosted (Neon for Postgres, Atlas for Mongo). Media goes to Cloudinary. The frontend can go to Vercel or Netlify.

The only piece that needs a decision is where the API runs, and the answer is "anything that keeps a process alive". No special requirements.

## 10. Cross-references

| Question | Read |
|---|---|
| What tables exist? | [database.md §4](./database.md#4-tables) |
| How do tables relate? | [database.md §5](./database.md#5-relationships) |
| How do requests flow? | [logic.md §2](./logic.md#2-what-happens-when-a-request-arrives) |
| What does a controller do? | [logic.md §4](./logic.md#4-controllers) |
| What does a service do? | [logic.md §5](./logic.md#5-services) |
| How does auth work? | [logic.md §6](./logic.md#6-middleware) and [database.md §4](./database.md#4-tables) |
| End-to-end trace | [logic.md §11](./logic.md#11-end-to-end-creating-a-verification) |
| Testing | [logic.md §12](./logic.md#12-testing) |
| Migrations | [database.md §9](./database.md#9-migrations) |

## 11. Roadmap

Ordering matters. Each phase unblocks the next.

| Phase | Feature | Status |
|---|---|---|
| 1 | Auth | Done |
| 2 | Business + investor profiles | Done |
| 3 | Pitches | Done |
| 4 | Follows + conversations | Done |
| 5 | Matching (rule-based) | Done |
| 6 | Offers | Done |
| 7 | Verification pipeline (Mongo + Postgres, format validators) | Done |
| 8 | Readiness scoring | Rules-based, ML pending |
| 9 | Search + fuzzy business discovery | Done |
| 10 | Admin verification review queue | Backend done, UI pending |
| 11 | AI pitch assistant | Next |
| 12 | Trust Model Phase B (registry checks) | Future |

The order isn't arbitrary. Profiles gate everything — feeds, matching, and pitches all need completed profiles. Matching needs profiles and pitches to score against. Offers need pitches to bid on. Chat needs matches to start. There's no way to skip a step without rework.

## 12. Principles that shaped this

These are the rules that came up repeatedly and ended up baked into the code.

**Identity is stable, extensions are separate.** One users table, one row per human. Business data and investor data live in extension tables that reference `users.id`. Every foreign key in the system either points at `users.id` or at a row that eventually does.

**Layer dependencies point downward.** Routes to controllers to services to models. Controllers don't query. Services don't touch HTTP. When you're looking for a bug, the layer tells you what kind of bug it is.

**State is mutable, history is append-only.** Current values live in one row that gets updated. History lives in a table that only ever gets inserted into. Messages, events, readiness scores, profile edits, feed impressions — all append-only. Users, businesses, pitches, offers — all mutable. Never mix the two patterns.

**Denormalize only what's on a hot path.** Valuation on pitches, `businessId` on offers, sector on readiness scores, `lastMessageAt` on conversations. All computed on write so the read side doesn't have to. Everything else stays normalized because normalizing is free until it isn't.

**Enforce at the lowest layer that can express the rule.** Uniqueness, referential integrity, and check constraints in the database. Shape validation in Zod. Business rules in services. Controllers do nothing but route. Self-follows are a database check because SQL can express them cheaply and it catches application bugs.

**Stateless servers, stateful tokens.** JWTs prove identity. Refresh tokens live in Postgres. Servers hold no session state, so horizontal scaling costs nothing beyond adding instances.

**Test behavior, not implementation.** Endpoint tests hit real HTTP. Unit tests cover pure logic. Nothing tests internal function calls unless there's no other way to check the behavior. The test suite is meant to catch regressions, not document what the code does.

**Version everything that evolves.** Scores and matches have `modelVersion` so a change in scoring doesn't corrupt historical comparisons. Events have `schemaVersion`. Migrations are committed. Sessions rotate. Any query over historical data can be filtered by the version of the code that wrote it.

**Don't optimize before measuring.** The system scales through infrastructure, not rewrites. Redis gets added when feed latency hurts, not before. Services get extracted when the deploy gets slow, not because it seems like the right time.

**Docs explain decisions, not tutorials.** The database doc explains why the schema looks the way it does. The logic doc explains how a request flows. The code explains what each function does. The README explains how to run it. Each layer of documentation has a job, and none of them duplicate the others.

