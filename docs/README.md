SmartShark
<div align="center">
A Virtual Shark Tank. Businesses pitch for investment. Investors browse, match, and make offers.

Where OCR, format validation, and cross-document consistency decide who gets to be called verified.


https://img.shields.io/github/actions/workflow/status/aniruddha9674/smartshark/test.yml?style=for-the-badge&label=CI&logo=githubactions&logoColor=white
https://img.shields.io/badge/tests-619_passing-2ea44f?style=for-the-badge&logo=vitest&logoColor=white
https://img.shields.io/badge/endpoints-80%2B-4c8bf5?style=for-the-badge&logo=express&logoColor=white


https://img.shields.io/badge/Node_22-339933?style=flat-square&logo=nodedotjs&logoColor=white
https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white
https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white
https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white
https://img.shields.io/badge/Drizzle-C5F74F?style=flat-square&logo=drizzle&logoColor=black
https://img.shields.io/badge/Mongoose-880000?style=flat-square&logo=mongoose&logoColor=white
https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white
https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black
https://img.shields.io/badge/Gemini_Flash-8E75B2?style=flat-square&logo=googlegemini&logoColor=white
https://img.shields.io/badge/Cloudinary-3448C5?style=flat-square&logo=cloudinary&logoColor=white
https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white
https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white


Architecture · Docs · Status · What's built · Run locally · Key decisions

</div>
What this is
SmartShark is a backend-first investment marketplace. A business owner builds a profile, verifies their registration documents, publishes a pitch, and receives offers from matched investors. An investor browses a matched feed, shortlists businesses worth following up on, chats with founders, and negotiates deals.

Deals close atomically. Offer accepted, siblings rejected, pitch funded, investment created, conversation opened — all in one Postgres transaction. Either every step happens or none of them do.

The interesting part isn't the CRUD. It's the document verification pipeline. OCR extracts fields from Indian business registration certificates (Udyam, GST, Shop Act). Pure-function validators check each identifier against its real-world format rules — GSTIN's mod-36 checksum, Udyam state codes, PAN holder types. And a business's trust tier only upgrades to verified when two independent documents agree on the legal name. Cross-document consistency, not just document existence.

Architecture











One process. Two databases. Five internal layers. Controllers never touch the database. Services never touch HTTP. The API is stateless — horizontal scaling costs nothing beyond adding instances.

Full architecture: overview.md →

The verification pipeline
The part of the system that isn't CRUD.

Never writes to the business profile without user confirmation. The apply step is a separate, explicit action. OCR results sit in Mongo until the user decides what to keep.

Cross-document consistency is the whole point. If the Udyam certificate says Acme Pvt Ltd and the GST certificate says Acme Private Limited, the tier stays at basic — even though both documents verified successfully. Two documents that disagree aren't evidence of anything.

Full pipeline: database.md §7 →

Documentation
<div align="center">
Doc	What it covers
🗺️	overview.md	Architecture, security model, scaling plan, design principles
⚙️	logic.md	Request flow, routes, controllers, services, middleware, testing
🗄️	database.md	Schema, relationships, indexes, migrations, verification pipeline
</div>
New here? Read them in that order. Overview gives you the map. Logic shows how requests move through the code. Database explains what's stored and why.

Status
Phase	Feature	
1	Auth — JWT, refresh rotation, ownership-based authorization	✅
2	Business + investor profiles	✅
3	Pitches — full lifecycle (draft → live → closed → funded)	✅
4	Follows + conversations	✅
5	Matching — rule-based five-factor scorer	✅
6	Offers — counter threads, atomic acceptance	✅
7	Verification — OCR, format validators, cross-doc consistency	✅
8	Fuzzy business search — pg_trgm GIN index	✅
9	Readiness scoring	🟡 Rules-based · ML pending
10	Admin verification review queue	🟡 Backend done · UI pending
11	AI pitch assistant	⏳ Next
What's built
<table> <tr> <td width="50%" valign="top">
🗃️ Data layer
21 relational tables. Users, businesses, investor profiles, pitches, offers, investments, matches, conversations, messages, notifications, follows, profile views, readiness scores, profile edit history, events, feed impressions, plus the CSV import pipeline tables and the event registry's self-maintenance tables.

Polyglot persistence. Postgres for everything queried, joined, or updated transactionally. MongoDB for verification documents where the shape varies by document type. Linked by userId and businessId strings, enforced at the service layer. No cross-database joins, no dual writes in a hot path.

</td> <td width="50%" valign="top">
🔐 Auth & authorization
JWT access tokens (15-min TTL) plus rotated refresh tokens (30-day TTL, SHA256-hashed in Postgres, delivered as httpOnly cookies).

Ownership checks instead of roles. Every business-scoped service call starts with assertBusinessOwnership. There's no requireRole middleware — a user can own a business and invest at the same time, so roles don't capture what's actually being protected.

Theft detection via rotation. Reuse of an old refresh token breaks the legitimate session, which is the signal that a token was compromised.

</td> </tr> <tr> <td width="50%" valign="top">
💸 Transactional deal flow
Offer acceptance spans five tables. Offer status, sibling offer rejection, pitch funding, investment creation, conversation creation. All in one Postgres transaction. Either every step happens or none do.

Counter-offer threads via self-referencing parentOfferId. Alternation is enforced in the service — you can't counter an offer you initiated.

Lazy expiry. No cron job scanning for stale offers. Every read and action checks expiresAt and marks the row expired if it's past.

</td> <td width="50%" valign="top">
✅ Verification pipeline
Gemini Flash OCR with per-document field specs. responseMimeType: "application/json", temperature 0.1.

Deterministic format validators for GSTIN (mod-36 checksum), Udyam (state code whitelist), PAN (holder type), Shop Act. Each returns { valid, reason }, and every extracted field gets annotated with formatValid and formatReason.

Cross-document tier upgrade. A business reaches verified only when 2+ documents agree on the legal name. Disagreement is a signal, not a failure to hide.

</td> </tr> <tr> <td width="50%" valign="top">
🔎 Fuzzy business search
pg_trgm GIN index on the concatenation of companyName, sector, city, and description. similarity() and word_similarity() scoring with ILIKE fallback.

"incorbiss" finds Incorbiss. "incor" finds it. "software" finds every SaaS company. Typo tolerant.

Results include the caller's match ID when one exists, so the frontend routes directly to the scored view instead of the public browse view.

</td> <td width="50%" valign="top">
📊 Self-maintaining event registry
Every event type is whitelisted in src/events/registry.js. Unknown types don't throw — they get recorded to a rejected_events table with a counter and timestamps.

A weekly query over that table tells you which events the system is asking for:

sql
SELECT attempted_type, count
FROM rejected_events
WHERE count > 100
ORDER BY count DESC;
Each result is a candidate registry entry. New event types require a code change, not a migration.

</td> </tr> <tr> <td colspan="2" valign="top">
🧪 Testing
619 tests across 47 files. Unit tests for pure logic, integration tests for every endpoint, service tests for the business rules. Runs on Ubuntu in CI with PGlite (Postgres compiled to WebAssembly) and mongodb-memory-server — no Docker, no external services, no flakiness from network calls.

Every endpoint has a happy-path test plus the standard error-path tests: 401 without a token, 400 for bad input, 403 for wrong owner, 404 for missing resources, 409 for conflicts.

</td> </tr> </table>
Stack
<div align="center">
Layer	Choice
Runtime	Node 22 with native ESM
Framework	Express — minimal, mature
Postgres ORM	Drizzle — SQL-first, gets out of the way
Mongo ORM	Mongoose — schema validation on documents
Databases	Postgres on Neon · MongoDB on Atlas
Cache	Redis — feed cache, optional
Auth	JWT + bcrypt + rotated httpOnly refresh tokens
Validation	Zod — type-safe, strips unknown fields
Search	Postgres pg_trgm with a GIN index
OCR	Gemini Flash with per-document field specs
File storage	Cloudinary — streams buffers, no temp files on disk
Tests	Vitest + Supertest + PGlite + mongodb-memory-server
CI	GitHub Actions
</div>
Run locally
bash
git clone https://github.com/aniruddha9674/smartshark
cd smartshark/virtual-shark-tank/server

npm install
Create a .env file:

env
PORT=5000
POSTGRES_URI=postgresql://...
MONGO_URI=mongodb+srv://...
JWT_SECRET=<48-byte hex>
JWT_REFRESH_SECRET=<48-byte hex>
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
GEMINI_API_KEY=...
Generate a secret:

bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
Then:

bash
npm run migrate   # apply Postgres migrations
npm run dev       # start on http://localhost:5000
npm test          # run the full suite — no external services needed
<table> <tr> <td><b>Health check</b></td> <td><code>GET /health</code></td> </tr> <tr> <td><b>Interactive API docs</b></td> <td><code>GET /docs</code> — Swagger UI, generated from <code>@openapi</code> JSDoc</td> </tr> <tr> <td><b>Client</b></td> <td>Separate React app under <code>virtual-shark-tank/client</code></td> </tr> </table>
Key decisions
Quick reference for "why was this chosen?" Full reasoning is in the linked docs.

Decision	Why	Where
Postgres for core data	Joins, transactions, ACID — everything queried, filtered, sorted, or updated transactionally	overview §4
MongoDB for verification	OCR output shape varies per document type; no joins needed	database §7
Two tokens (access + refresh)	Revocable sessions with a short theft window	overview §6
Refresh rotation	Theft detection — reuse of an old token breaks the legitimate session	logic §5
pg driver, not Neon HTTP	HTTP driver is for serverless functions; this is a long-running server	database §2
Monolith, not microservices	A team of one doesn't need distributed sagas to accept an offer	overview §5
Ownership checks, not roles	A user can own a business and invest at the same time	overview §6
PGlite for tests	Postgres in WASM — no Docker, fast CI	logic §12
Lazy offer expiry	No cron job; check expiresAt on read and action	database §4
Rule-based matching first	Ship the scorer, swap in ML later; modelVersion records the change	logic §5
Lazy MongoDB connection	Tests import the app without connecting to Atlas	logic §13
Event registry over enum	New event types shouldn't require a database migration	logic §9
Soft 404 for hidden drafts	Non-owners get "not found", not "forbidden" — no existence leak	logic §10
Design principles
The rules that shaped every decision above. Full list: overview.md §12 →

Stable identity, role extensions. One users table. Role data lives in extension tables. Every foreign key points at users.id or at a row that references it.

Layer dependencies point down. Routes → controllers → services → models. Controllers don't query. Services don't touch HTTP.

State is mutable, history is append-only. Current values in one row, history in a table you only insert into. Never mix.

Denormalize only what's on a hot path. Valuation on pitches, businessId on offers, sector on readiness scores. Everything else stays normalized.

Enforce at the lowest layer that can express the rule. Uniqueness and integrity in the database, shape in Zod, business rules in services.

Stateless servers, stateful tokens. JWTs prove identity, refresh tokens live in Postgres. Horizontal scaling is free.

Test behavior, not implementation. Endpoint tests hit real HTTP. Unit tests cover pure logic.

Version everything that evolves. modelVersion on scores and matches, schemaVersion on events, migrations for schema, rotation for sessions.

Don't optimize before measuring. Redis gets added when feed latency hurts. Services get extracted when the deploy is slow. Not before.

Docs explain decisions, not tutorials. Each layer of documentation has a job. None of them duplicate the others.

Contributing
Solo project, but the docs are written for a reader.

<ol> <li><a href="./overview.md"><b>overview.md</b></a> — the map</li> <li><a href="./logic.md"><b>logic.md</b></a> — how the code is organized</li> <li><a href="./database.md"><b>database.md</b></a> — what's stored and why</li> </ol>
Before opening a PR: npm test must pass, CI must be green, and new endpoints need tests. There's no coverage threshold, but every endpoint has at least one happy-path test plus the standard error-path tests (401, 400, 403, 404, 409).

<div align="center">
Built by @aniruddha9674

⭐ Star the repo · 🐛 Report an issue · 📖 Read the docs

</div>
<div align="center"> <sub><i>Last updated: 2026-10-13</i></sub> </div>