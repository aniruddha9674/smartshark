
# Overview

Architecture of the SmartShark backend — what the system is, how it's layered, and why each choice was made.

**Read next:** [database.md](./database.md) for schema, [logic.md](./logic.md) for request flow.

---

## 1. What This Is

SmartShark is a Virtual Shark Tank platform — a marketplace where **businesses pitch for investment** and **investors browse, match, and make offers**.

Two dashboards, one backend:

| Dashboard | User role | What they do |
|---|---|---|
| **Business Owner** | `business` | Build a profile, get a readiness score, publish pitches, receive offers |
| **Investor** | `investor` | Browse matched businesses, shortlist, chat, make offers |

Both dashboards share auth, notifications, chat, and the matching engine.

**Status:** Auth complete. Profiles, pitches, offers, and matching in progress.

---

## 2. Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENT (React)                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS + JWT + cookies
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS API (monolith)                    │
│                                                              │
│   routes → middleware → controllers → services → models     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     ┌─────────────────┐         ┌─────────────────┐
     │    Postgres     │         │    MongoDB      │
     │    (Neon)       │         │    (Atlas)      │
     │                 │         │                 │
     │  14 tables      │         │  Verification   │
     │  All relational │         │  documents      │
     └─────────────────┘         └─────────────────┘
```

Three-tier system: client, API, data. The API is a **modular monolith** — one deployable unit, internally split into clear layers.

See [logic.md §2](./logic.md#2-request-lifecycle) for the full request pipeline.

---

## 3. The Five Layers

Both the codebase and the data model follow the same five-layer structure.

| # | Layer | Code | Data |
|---|---|---|---|
| 1 | **Identity** | Auth service, middleware | `users`, `refresh_tokens` |
| 2 | **Profiles** | Profile services | `business_profiles`, `investor_profiles` |
| 3 | **Discovery** | Matching, follow, view services | `matches`, `follows`, `profile_views` |
| 4 | **Domain** | Pitch, offer services | `pitches`, `offers` |
| 5 | **Communication** | Chat, notification services | `conversations`, `messages`, `notifications` |

Two cross-cutting concerns sit outside the layer stack:
- **Analytics** — `readiness_scores`, `profile_edit_history`
- **Verification** — MongoDB `Verification`

**The rule:** a layer only depends on layers below it. Layer 4 (`pitches`) references Layer 1 (`users`) and Layer 2 (`business_profiles`), never the reverse.

See [database.md §3 Table Catalog](./database.md#3-table-catalog) for the full layer breakdown.

---

## 4. Data Stores

Polyglot persistence — two databases, each doing what it's best at.

| Store | Holds | Why |
|---|---|---|
| **Postgres** | 14 relational tables — everything queried, joined, or transactionally updated | ACID, joins, indexes, transactions |
| **MongoDB** | Verification documents — uploaded files, OCR output, review state | Schema-less, shape varies per document type |

### Why not one database?

**Mongo for everything:**
- No joins → user enumeration, feed ranking, and profile completion all become multi-query disasters
- No cross-collection transactions → accepting an offer + closing a pitch + creating an investment can't be atomic
- The `matches` table alone joins 3 collections for one feed query

**Postgres for everything:**
- OCR data has no fixed schema — different document types yield different fields
- Would need a `jsonb` column that defeats the point of a relational schema
- Verification has no relationships to anything else — it's a document store by nature

**Polyglot split:** Each store handles what it's actually good at. The boundary is a single model (`Verification`), linked by `userId`. No cross-DB joins, no dual writes in hot paths.

See [database.md §2 Data Stores](./database.md#2-data-stores) and [§7 MongoDB](./database.md#7-mongodb).

---

## 5. Application Structure

**Modular monolith.** One Express app, one deploy, one process. Internally organized into clear layers.

### 5.1 Why monolith (not microservices)

| Concern | Monolith | Microservices |
|---|---|---|
| **Deployment** | One process | N processes + orchestration |
| **Transactions** | Native ACID | Distributed sagas |
| **Local dev** | `npm run dev` | Docker Compose + service mesh |
| **Latency** | In-process calls | Network hops |
| **Team size it fits** | 1–20 devs | 50+ devs |

At this scale, microservices would add overhead (deployment, tracing, distributed transactions) for **zero benefit**. The pain microservices solve — coordinating independent deploys across teams — doesn't exist yet.

**When to split:** when a specific service has a wildly different scaling profile (matching is compute-heavy, chat is WebSocket-heavy). Extract that one service. Keep the rest monolith.

### 5.2 Internal structure

```
server/src/
├── config/           ← DB connections, env validation
├── models/           ← schema definitions (postgres/ + mongo/)
├── routes/           ← URL → handler mapping
├── middleware/       ← cross-cutting (auth, validation, errors)
├── controllers/      ← HTTP layer
├── services/         ← business logic
├── validators/       ← request schemas
├── utils/            ← pure helpers
└── app.js            ← Express setup
```

**One rule:** dependencies point downward.
```
routes → controllers → services → models
              │
              └── middleware
              └── validators
              └── utils
```

Controllers never import `db`. Services never import `req`/`res`.

See [logic.md §1 Code Layers](./logic.md#1-code-layers).

### 5.3 Stateless design

The API server holds **no session state in memory**. Every request can be handled by any instance.

Why it works:
- Auth uses JWTs — verified per request, no server-side session store
- Refresh tokens live in Postgres — revocable from any instance
- No sticky sessions needed → horizontal scaling is trivial

See [§6 Security Model](#6-security-model) for the auth details.

---

## 6. Security Model

The auth layer is the security boundary. Everything else trusts `req.user` after middleware runs.

### 6.1 Tokens

| Token | Type | Lifetime | Stored | Transport |
|---|---|---|---|---|
| **Access** | JWT (HS256) | 15 min | Client memory | `Authorization: Bearer` |
| **Refresh** | Opaque 96-char hex | 30 days | Postgres (hashed) | httpOnly cookie |

### 6.2 Why two tokens

- **Access token** — short-lived, stateless. If stolen, expires in 15 minutes.
- **Refresh token** — long-lived, revocable. Stored hashed in DB, checked on every refresh.

The refresh token is what makes **logout real**. Without it, a stolen JWT would be valid until expiry.

### 6.3 Rotation

Every `/refresh` call:
1. Revokes the old refresh token in DB
2. Inserts a new one
3. Returns a new access token + new cookie

**Theft detection:** if a stolen token is reused, the legitimate user's next refresh fails. That failure signal means the token was compromised.

### 6.4 Defense summary

| Threat | Defense |
|---|---|
| Password leak | bcrypt with 12 rounds |
| DB leak | Passwords hashed, refresh tokens hashed |
| XSS | Refresh token in httpOnly cookie, not accessible to JS |
| CSRF | `SameSite=Strict` on the refresh cookie |
| Token theft | 15-min access TTL + rotation on refresh |
| User enumeration | Same error for "wrong email" and "wrong password" |
| Privilege escalation | Zod strips unknown body fields; role enum disallows self-signup as admin |
| Banned user | `isActive` checked on every login and refresh |

See [logic.md §6 Middleware](./logic.md#6-middleware) and [database.md §3.1 users](./database.md#31-users).

---

## 7. Scaling Plan

The system is designed to scale through infrastructure changes, not schema rewrites.

### 7.1 Four stages

| Stage | Users | What changes | Schema changes? |
|---|---|---|---|
| **1. Vertical** | 0 → 10k | Bigger server, paid DB tiers | None |
| **2. Horizontal** | 10k → 500k | N stateless API instances behind a load balancer | None |
| **3. Data** | 500k → 5M | Read replicas, Redis cache, table partitioning | None |
| **4. Service extraction** | 5M+ | Extract matching + notifications into separate services | None |

**Why no schema changes:** indexes and foreign keys are already in place. Normalization is correct. No denormalization debt to pay down.

### 7.2 What breaks first

| Users | Bottleneck | Fix |
|---|---|---|
| 10k | Nothing | Nothing |
| 50k | Neon connection limits | Enable pooler, reduce `max` in pool config |
| 100k | Matching job runtime | Pre-filter by sector, run in a worker |
| 500k | Feed query latency | Redis cache + read replica for `matches` |
| 1M | Notification writes | Batch insert, queue via BullMQ |
| 5M | Deploy time | Extract matching service |

None of these require touching the schema.

### 7.3 What's already scalable

- **Stateless API** — no in-memory sessions
- **UUID PKs** — sharding-ready
- **Composite indexes** on every hot query
- **Append-only tables** (`readiness_scores`, `profile_edit_history`, `messages`) — no lock contention
- **Upsert pattern** for `matches`, `profile_views` — one row per pair, safe under concurrency
- **Denormalized hot fields** (`valuation` on pitches, `sector` on readiness scores) — avoid joins on the hot path

See [database.md §5 Indexes](./database.md#5-indexes).

---

## 8. Tech Stack

### 8.1 Runtime + framework

| Layer | Choice | Why |
|---|---|---|
| **Runtime** | Node 22 (ESM) | Latest LTS, native ESM, top-level await |
| **Framework** | Express | Minimal, huge ecosystem, well-understood |
| **ORM** | Drizzle | SQL-first, TypeScript-native, lightweight |

### 8.2 Data

| Layer | Choice | Why |
|---|---|---|
| **Relational DB** | Postgres (Neon) | ACID, JSONB, best-in-class indexing |
| **Postgres driver** | `pg` (node-postgres) | Standard for long-running servers; connection pooling |
| **Document DB** | MongoDB (Atlas) | Schema-flexible for OCR data |
| **Mongo driver** | Mongoose | Schemas + validation on documents |

### 8.3 Auth + validation

| Layer | Choice | Why |
|---|---|---|
| **Password hashing** | bcrypt (12 rounds) | Battle-tested, intentionally slow |
| **Access tokens** | jsonwebtoken (HS256) | Standard, symmetric, no key distribution |
| **Request validation** | zod | Type-safe, strips unknown fields |
| **Cookies** | cookie-parser | Standard Express middleware |

### 8.4 Testing + CI

| Layer | Choice | Why |
|---|---|---|
| **Test runner** | Vitest | Fast, native ESM, Jest-compatible API |
| **HTTP assertions** | Supertest | Drives the app without opening a port |
| **Test Postgres** | PGlite | In-memory WASM Postgres — no Docker, no network |
| **CI** | GitHub Actions | Free for public repos, tight GitHub integration |

### 8.5 Deployment (planned)

| Layer | Candidate | Notes |
|---|---|---|
| **API host** | Render / Fly.io / Railway | Any supports a long-running Node process |
| **Database** | Neon + Atlas | Already in use |
| **Media storage** | Cloudinary or S3 | For pitch videos, decks, avatars |

**Not serverless.** Neon's HTTP driver is for serverless functions. This API is a long-running server → `pg` driver + persistent process.

---

## 9. Request Flow Summary

A single API call passes through:

```
1. Express router           (matches path + method)
2. Middleware chain         (validate, requireAuth, requireRole)
3. Controller               (parses req, calls service)
4. Service                  (business rules, DB queries)
5. Models                   (Drizzle / Mongoose)
6. Database                 (Postgres or MongoDB)
```

Full trace: [logic.md §10](./logic.md#10-end-to-end-example-post-apiauthregister) walks `POST /api/auth/register` through all 11 files it touches.

---

## 10. Cross-References

| Question | Read |
|---|---|
| What tables exist? | [database.md §3](./database.md#3-table-catalog) |
| How do tables relate? | [database.md §4](./database.md#4-relationships) |
| How do requests flow? | [logic.md §2](./logic.md#2-request-lifecycle) |
| What does a controller do? | [logic.md §4](./logic.md#4-controllers) |
| What does a service do? | [logic.md §5](./logic.md#5-services) |
| How does auth work? | [logic.md §6](./logic.md#6-middleware) + [database.md §3.1](./database.md#31-users) |
| End-to-end trace | [logic.md §10](./logic.md#10-end-to-end-example-post-apiauthregister) |
| Testing approach | [logic.md §11](./logic.md#11-testing) |
| Migration workflow | [database.md §8](./database.md#8-migration-workflow) |

---

## 11. Roadmap

Order matters — each step unblocks the next.

| Phase | Feature | Depends on | Status |
|---|---|---|---|
| 1 | Auth | — | ✅ Complete |
| 2 | Business + investor profiles | Auth | ⏳ Next |
| 3 | Pitches | Profiles | ⏳ |
| 4 | Matching (rule-based) | Profiles + pitches | ⏳ |
| 5 | Offers | Pitches | ⏳ |
| 6 | Conversations | Matches | ⏳ |
| 7 | Verification (Mongo ↔ Postgres) | Profiles | ⏳ |
| 8 | Readiness scoring (ML) | Profiles + history data | ⏳ |

**Why this order:**
- Profiles gate everything — feeds, matching, and pitches all need completed profiles
- Matching needs profiles + pitches to score against
- Offers need pitches to bid on
- Chat needs matches to initiate

No step can be skipped without rework. Each phase is designed to be independently shippable and testable.

---

## 12. Design Principles

The rules that shaped every decision above.

1. **Stable identity, role extensions.** One `users` table, one row per human. Role data lives in extension tables. Every FK points to `users.id`, never to a profile.

2. **Layer dependencies point down.** Routes → controllers → services → models. Controllers don't query. Services don't touch HTTP.

3. **Events vs state.** Append-only tables for history (`messages`, `readiness_scores`, `profile_edit_history`). Mutable rows for current state (`users`, `profiles`). Never mix.

4. **Denormalize for the hot path only.** `valuation` on pitches, `sector` on readiness_scores, `businessId` on offers — computed on write, queried without joins. Everything else stays normalized.

5. **Enforce at the lowest layer.** Constraints (unique, check, FK) live in the DB. Validation lives in zod. Business rules live in services. Controllers do nothing but route.

6. **Stateless servers, stateful tokens.** JWTs prove identity. Refresh tokens live in Postgres. Servers hold no session state → horizontal scaling is free.

7. **Test behavior, not implementation.** Endpoint tests hit real HTTP. Unit tests cover pure logic. Nothing tests internal calls.

8. **Version everything that evolves.** `modelVersion` on scores and matches. Migrations for schema. Refresh rotation for sessions.

9. **Don't optimize before measuring.** The system scales through infrastructure, not rewrites. Add Redis when feed latency hurts. Extract services when the monolith deploy is slow. Not before.

10. **Document decisions, not tutorials.** This doc explains *why*. Code comments explain *what*. README explains *how to run*.

---

*Last updated: 2026-09-15*
```

---

## How the three files fit together

```
README.md         ← what it is, how to run, quick links
    │
    ├── overview.md        ← architecture story (this file)
    │       │
    │       └── links down to detail
    │
    ├── database.md        ← schema deep dive
    │       └── §3 tables, §4 relationships, §5 indexes
    │
    └── logic.md           ← code deep dive
            └── §3 routes, §5 services, §10 end-to-end trace
```

**Reading paths:**

| Reader | Path |
|---|---|
| Recruiter / newcomer | README → overview → done |
| Backend dev onboarding | README → overview → logic → code |
| DB-minded dev | README → overview → database → code |
| Future you, 3 months later | Any file, via anchor link |

**Sections that get outdated fastest:** §11 Roadmap. Update it when you ship a phase.

**Sections that stay stable:** §5 Application Structure, §6 Security Model, §12 Design Principles. These reflect decisions you won't revisit.

