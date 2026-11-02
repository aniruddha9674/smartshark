# Database

How data is stored in SmartShark. Two databases, why each one, and what lives where.

Stack: Postgres on Neon, MongoDB on Atlas.
Postgres ORM: Drizzle. Mongo ORM: Mongoose.
Files: `server/src/models/postgres/`, `server/src/models/mongo/`.

## 1. Why two databases

The platform stores two very different kinds of data.

Most of what SmartShark does is relational. Users own businesses, businesses publish pitches, investors make offers on pitches, offers become investments. That's joins, it's transactions, it's ACID. Postgres is the obvious answer and it's where all of this lives.

The exception is uploaded verification documents. When a user uploads an Udyam certificate, an OCR service extracts fields from it, and the shape of that extraction depends entirely on which document was uploaded. Udyam gives you an enterprise name and a registration number. GST gives you a legal name, a GSTIN, a principal place of business. Shop Act gives you something else again. Forcing that into Postgres would mean either a wide sparse table or a jsonb column that defeats the point of having a relational schema in the first place.

There are no joins needed on verification data either. You always fetch it by `businessId` or `userId`, and the cross-database relationship is a single string field on each side. That's a document store use case, not a relational one.

So: Postgres for everything queried, joined, or updated transactionally. Mongo for verification documents. The two are linked by `userId` and `businessId` string fields, enforced at the service layer — there is no cross-database join anywhere and no dual-write in a hot path.

There's a second Mongo set of models for business and investor profile documents, plus a chat message model and a match explanation model. Only Verification is used today. The others were scaffolding for a design that got replaced by the Postgres side and haven't been removed. Treat this doc as describing Postgres plus the Verification collection.

## 2. Postgres

Driver is `pg` (node-postgres) with connection pooling. The pooled endpoint comes from `POSTGRES_URI`. The pool config forces IPv4 with `family: 4` — some ISPs route IPv6 badly and the connection hangs without it.

We use `pg` and not Neon's HTTP driver because the API is a long-running Express server. HTTP is for serverless functions. Persistent TCP is what you want here.

Neon's free tier suspends compute after 5 minutes idle. Long-running scripts that touch the DB after an idle gap need a warm-up retry loop (`SELECT 1` with a few retries before the main work). `ingest-mca.js` and `enrich-investable.js` both include this.

## 3. MongoDB

Driver is Mongoose. Connection string is `MONGO_URI`. The connection is opened lazily by `server.js` rather than at import time, so tests can boot the app without touching Atlas.

## 4. Tables

26 Postgres tables. Ordered by dependency: identity, profiles, discovery, communication, domain, analytics, events, ingestion support, enrichment.

### users

The root identity table. Every other foreign key in the system points here or to a row that eventually points here.

Columns you'll actually touch: `id` (uuid primary key), `name`, `email` (unique), `passwordHash` (bcrypt, twelve rounds, never returned by any endpoint), `role` (business, investor, or admin), `isVerified`, `isActive`, `isProfileComplete`, and a set of notification preferences that are all booleans defaulting to true. Plus `avatarUrl`, `language`, `theme`, and the usual timestamps.

The design decision worth calling out: there's only one user table. Both dashboards share it, both use the same login endpoint, and both get the same JWT shape. Role determines which dashboard loads by default, but it doesn't gate routes. A user can be an investor and own a business at the same time and the system handles it without special cases.

Settings live inline instead of in a separate table. Ten boolean-ish fields don't justify a join.

File: `user.model.js`.

### refresh_tokens

One row per issued refresh token. Enables logout and refresh rotation.

`userId` cascades from users. `tokenHash` is SHA256 of the raw token — we never store the raw value, so a database leak doesn't hand over usable sessions. `expiresAt` is thirty days out. `revoked` flips to true when the user logs out or when the token gets rotated. `userAgent` is captured for a future "active sessions" UI.

The key property is that it's one row per issue, not one row per user. That lets the same account have an active session on a laptop and a phone without either kicking the other out.

File: `refreshToken.model.js`.

### businesses

**The central table. Grew from ~20 columns to 72 across four logical groups. This is the most important schema change since the last doc.**

`ownerId` references users and cascades on delete. **It is now NULLABLE.** MCA-imported businesses have `ownerId = NULL` until a user claims them through `POST /api/businesses/:id/claim`. This is the multi-business + claim-business model.

**Group 1 — MCA source columns (added for ingestion):**

| Column | Type | Notes |
|---|---|---|
| `cin` | varchar(21) | unique index, nullable for user-created businesses |
| `companyRoc` | varchar(100) | ROC Bangalore, etc. |
| `companyCategory` | varchar(100) | Company limited by shares |
| `companySubCategory` | varchar(100) | Non-government company |
| `companyClass` | varchar(50) | Private / Public |
| `companyStatus` | varchar(50) | Active / Strike Off / Amalgamated / etc. |
| `listingStatus` | varchar(50) | Listed / Unlisted |
| `authorizedCapital` | numeric | in rupees |
| `paidUpCapital` | numeric | in rupees |
| `incorporationDate` | date | |
| `registeredAddress` | text | |
| `country` | varchar(100) | |
| `nicCode` | varchar(10) | industrial classification code |
| `industrialClassification` | varchar(255) | human-readable sector from MCA |
| `state` | varchar(100) | |
| `pincode` | varchar(10) | |
| `dataSource` | varchar(30) | `user` or `mca` |

**Group 2 — profile enrichment (owner-provided or curated):**

`tagline` (300), `businessModel` (100), `targetMarket` (200), `differentiation` (text), `keyProducts` (jsonb array), `notableClients` (jsonb array), `competitors` (jsonb array), `employeeCount` (int), `employeeCountSource` (varchar 30).

**Group 3 — funding and traction:**

`fundingInstrument` (enum: equity, debt, revenue_share, hybrid), `useOfFunds` (jsonb array of `{category, pct, description}`), `plannedMilestones` (jsonb array of `{months, milestone}`), `priorFunding` (jsonb array), `existingLoans` (jsonb array).

`revenueRange` (varchar 50), `revenueSource` (varchar 30), `revenueTrendBracket` (enum: declining, flat, growing_20, growing_50, growing_100), `customerCount` (int), `repeatCustomerPct` (numeric), `monthlyOrderVolume` (int).

**Group 4 — provenance, compliance, caching:**

| Column | Purpose |
|---|---|
| `badges` | jsonb array — `well_known`, `listed`, `mnc_subsidiary`, `large_enterprise` |
| `curatedNote` | editorial commentary for flagship profiles |
| `fieldProvenance` | jsonb per-field trust: `{field: {source, tier, updated}}` |
| `profileCompletenessPct` | integer 0-100 |
| `currentReadinessScore` | integer 0-100, cached from readiness_scores |
| `investorBrief` | jsonb, cached LLM summary |
| `investorBriefGeneratedAt` | timestamp |
| `logoCheckedAt` | timestamp, for idempotent logo enrichment re-runs |
| `licenses` | jsonb array of `{name, status}` |
| `selfDeclaredRisks` | text |
| `litigationNotes` | text |
| `linkedinUrl`, `twitterUrl`, `pitchVideoUrl` | varchar(500) |

**Verification fields (unchanged):** `udyamNumber`, `gstNumber`, `shopActLicense`, `verificationTier` (unverified/basic/verified).

**Indexes:**
- `businesses_cin_unique` (unique, where cin is not null)
- `businesses_owner_idx` on ownerId
- `businesses_state_idx`, `businesses_nic_idx`, `businesses_status_idx`, `businesses_data_source_idx`
- `businesses_badges_gin_idx` GIN on badges jsonb
- `business_search_trgm_idx` — GIN trigram on concatenation of companyName, sector, city, description (for fuzzy search)

File: `businessProfile.model.js`. The file name is legacy — the table is `businesses`.

### investor_profiles

Investor-specific fields. Strictly one per user.

`userId` is unique and cascades. The columns are `panNumber`, `firmName`, `investmentFocus` (comma-separated sector list), `preferredGeography`, `minTicketSize`, `maxTicketSize`, `isIdentityVerified`.

`investmentFocus` and `preferredGeography` are varchar rather than a join table. That's a deliberate simplification — the sectors are a small fixed list, the geographies are cities, and joins on a comma-separated string aren't needed anywhere in the matching scorer.

File: `investorProfile.model.js`.

### follows

Polymorphic follow. An investor can follow a business, a business can follow an investor. Both directions live in the same table.

`followerId` and `followingId` both reference users and both cascade. Unique index on the pair, reverse index on `followingId`, check constraint stopping self-follows.

File: `following.model.js`.

### notifications

Per-user notification inbox. Cross-cutting.

`userId` cascades. `actorId` uses `set null`. `type` is an enum. `title`, `body`, `metadata` (jsonb). Indexes on `(userId, createdAt)` and `(userId, isRead)`.

The notification service respects the user's `notify*` preferences before inserting. It also swallows its own errors — a failed notification never fails the parent operation.

File: `notification.model.js`.

### conversations

One row per chat thread. One thread per user pair, forever.

Participants are stored as an ordered pair. `participantAId` is always the lower UUID, `participantBId` the higher, with a check constraint enforcing it. `(X, Y)` and `(Y, X)` collapse into the same row. `lastMessageAt` is denormalized for fast chat-list sorting.

File: `conversation.model.js`.

### messages

Chat messages. Append-only.

`conversationId` cascades. `senderId` references users. `body` is text. `isRead` and `readAt` track read state.

Indexes on `(conversationId, createdAt)` for thread load and `(conversationId, isRead)` for unread counts.

Rate limit: 500 messages per user per day, enforced in the service layer.

File: `messages.model.js`.

### profile_views

Tracks who viewed whom. Upsert — one row per viewer/viewed pair.

`viewCount` increments on repeat views. Check constraint prevents self-views.

File: `profileViews.model.js`.

### readiness_scores

Business readiness score history. Append-only — every recompute is a new row.

`businessId` cascades. `score` is 0 to 100. `modelVersion` marks which scoring engine produced the row. `shapBreakdown` is jsonb — currently holds the feature checklist (name is legacy from a planned SHAP integration). `suggestions` is jsonb array of improvement strings. `sector` and `stage` are denormalized for benchmark queries.

**Currently populated by `readiness.service.js` (rules-v1)**, not ML. Every call to `recomputeReadiness` inserts a new row.

File: `readinessScore.model.js`.

### matches

Algorithmic pairing of a business and an investor. One row per pair, upserted.

`businessId` and `investorId` cascade. `matchScore` is 0-100. `matchReasons` is jsonb per-factor breakdown. `modelVersion` marks the scorer. `status` is an enum (pending, viewed, shortlisted, passed, connected).

Rule-based scorer: five factors with fixed weights — sector (30), ticket size (25), geography (20), verification tier (15), readiness (10).

Unique index on `(businessId, investorId)`. Indexes on `(investorId, matchScore)` and `(businessId, matchScore)` for both feed directions.

File: `match.model.js`.

### profile_edit_history

Audit trail of business profile changes. Append-only.

One row per changed field, not per save. `editedById` uses `set null` for system-initiated edits. All values stored as text.

Writes happen inside the same Postgres transaction as the businesses update.

File: `profileEditHistory.model.js`.

### pitches

A business's formal ask for investment. Temporal.

`businessId` cascades. Content fields plus `sectorSpecificFields` (jsonb). Money fields: `askAmount`, `equityOffered`, `valuation` (denormalized as `askAmount / (equityOffered / 100)`). Media as URLs only. `status` moves through draft, live, closed, funded, withdrawn.

Two check constraints on equity range and positive ask. Only one live pitch per business at a time (enforced in service).

File: `pitch.model.js`.

### offers

An investor's bid on a pitch. Self-referencing for counter threads.

`initiatedById` records who created *this particular row*. `parentOfferId` uses `set null`. `status` is pending, accepted, rejected, countered, withdrawn, or expired.

Expiry uses lazy evaluation — every read checks `expiresAt` and marks expired if past. No cron.

File: `offer.model.js`.

### investments

A closed deal. Append-only.

Created inside the same Postgres transaction as offer acceptance. `offerId` is unique per investment.

File: `investment.model.js`.

### events

Append-only activity log. Cross-entity, cross-database.

`userId` uses `set null`. `eventType` validated against `src/events/registry.js`. `entityId` is `varchar(255)` — NOT a foreign key, holds both UUIDs and Mongo ObjectIds. `metadata` is jsonb. `schemaVersion` bumps when shape changes.

`eventService.log()` is fire-and-forget and never called inside a `db.transaction()`.

Three indexes: `(userId, createdAt)`, `(entityType, entityId, createdAt)`, `(eventType, createdAt)`.

File: `event.model.js`.

### feed_impressions

Append-only log of which pitches appeared where in a feed. Position-bias training signal.

`surface` is feed, search, or shortlist. `position` is zero-indexed rank. `score` is the model score at impression time. `modelVersion` marks the scorer.

Batch insert via `logBatch()`, not per-impression.

File: `feedImpression.model.js`.

### rejected_events

Every attempt to log an unregistered event type lands here. One row per distinct attempted type, with a counter.

This table is how the event registry stays honest. Query `SELECT attempted_type, count FROM rejected_events WHERE count > 100 ORDER BY count DESC` weekly for prioritized list of missing registry entries.

File: `rejectedEvent.model.js`.

### business_media

Product photos, premises, pitch video — the visual gallery on the investor profile.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `businessId` | uuid FK | cascade |
| `url` | varchar(1000) | Cloudinary URL |
| `publicId` | varchar(255) | for deletion |
| `mediaType` | varchar(30) | product / premises / pitch_video / team |
| `caption` | varchar(300) | nullable |
| `displayOrder` | integer | default 0 |
| `uploadedBy` | uuid FK → users.id | set null |
| `createdAt` | timestamp | |

Indexes: `(businessId, displayOrder)` for ordering, `(mediaType)` for filtering.

### business_directors

Directors from MCA21, extracted per-business.

`businessId` cascades. `din` (8 chars), `name`, `appointedAt`, `isActive`, `source` (default mca), `fetchedAt`. Unique constraint on `(businessId, din)` so re-fetching is idempotent.

### business_charges

Secured loans registered against the business (MCA charge filings).

`businessId` cascades. `chargeId`, `holderName`, `amount`, `creationDate`, `status`, `source`, `fetchedAt`.

### business_evidence_claims

Revenue and other financial claims, with verification status. Turns "the owner says ₹5 Cr revenue" into "the owner says ₹5 Cr, and here's what we could independently confirm."

`claimType` (revenue / employee_count / customer_count), `claimedValue`, `claimedPeriod`, `evidenceTier` (claimed / document_backed / gst_corroborated / multi_source_confirmed), `corroboratingSources` (jsonb), `discrepancyPct`, `lastCheckedAt`.

**Status:** schema exists, no service writes to it yet. Table for Phase 2 of the trust model.

### raw_mca_records

Append-only store of the exact CSV row from `data.gov.in`, before transformation.

`cin`, `contentHash` (SHA256 of canonical fields), `payload` (jsonb of full row), `stateFile`, `ingestedAt`. Unique constraint on `(cin, contentHash)` for idempotency.

Every re-run of the ingest script inserts zero new raw rows (unless the source file changed, in which case the hash differs and a new row is inserted, preserving history).

### import_batches / raw_import_businesses / harmonization_errors

Legacy CSV import pipeline. Still present but superseded by the `data.gov.in` MCA bulk ingestion path.

- `import_batches` — one row per CSV import
- `raw_import_businesses` — raw parsed rows before transformation
- `harmonization_errors` — rows that couldn't be harmonized

## 5. Relationships

Cascade is the default for owned data — refresh tokens, businesses, pitches, offers, investments, messages, matches, readiness scores, profile edits, follows, notifications, impressions, business_media, business_directors, business_charges, business_evidence_claims.

`set null` is for references that should survive. Notification actors, profile edit editors, event users, rejected event samples, offer parents.

`events.entityId` is not a foreign key at all — varchar holding either a UUID or Mongo ObjectId.

The multi-business relationship on `businesses.ownerId` is N:1 and now nullable (claimable).

## 6. Enums

Postgres enums via Drizzle `pgEnum`. Adding a value requires a migration.

- `role`: business, investor, admin. On users.
- `verification_tier`: unverified, basic, verified. On businesses.
- `notification_type`: new_match, new_message, follow, profile_update, score_change, verification_update, saved_business_activity, system. On notifications.
- `match_status`: pending, viewed, shortlisted, passed, connected. On matches.
- `pitch_status`: draft, live, closed, funded, withdrawn. On pitches.
- `offer_status`: pending, accepted, rejected, countered, withdrawn, expired. On offers.
- `investment_status`: active, exited, written_off. On investments.
- **`funding_instrument`: equity, debt, revenue_share, hybrid.** On businesses.
- **`revenue_trend`: declining, flat, growing_20, growing_50, growing_100.** On businesses.

`events.eventType` is deliberately not an enum — validated in the registry, rejected types go to `rejected_events`.

## 7. The verification pipeline

A user uploads Udyam, GST, or Shop Act. The file goes to Cloudinary. The verification service creates a Mongo doc with status `pending` and calls the extraction service.

Extraction fetches the image, base64-encodes, sends to Gemini with per-document-type prompt. Config: `responseMimeType: "application/json"`, `temperature: 0.1`. Response is a map of field name to `{ value, confidence }`.

Format validation annotates each field with `formatValid` and `formatReason`:
- GSTIN: 15-char format, state code 1-37, mod-36 checksum
- Udyam: `UDYAM-XX-00-0000000` format, state code whitelist
- PAN: format, 4th char holder type
- Shop Act: length, character class

Document status: `rejected` if wrong document type, `verified` if confidence ≥ 0.7, `needs_review` otherwise.

Nothing writes to the business profile yet. That's a separate user action called apply.

On apply: merge OCR fields with user-confirmed overrides, compare each against current value, write changes inside Postgres transaction (businesses + profile_edit_history), update Mongo with `appliedFields`, recompute tier.

**Tier computation (the paper's core contribution):**
- No verifications → unverified
- 1+ verified docs with at least one distinct name → basic
- 2+ verified docs where all extracted legal names collapse to a single unique value (lowercase + trim) → verified

Two documents that verified successfully but disagree on legal name keep the tier at `basic`. Cross-document consistency is the signal.

Events fire at every stage, always after the transaction.

## 8. Indexes

Rather than listing every one, here's what's indexed and why.

- **Auth:** `users.email` unique
- **Investor feed:** `matches.(investorId, matchScore)` + `pitches.(status, publishedAt)`
- **Business feed:** `matches.(businessId, matchScore)` + `offers.(businessId, status)`
- **Chat:** `messages.(conversationId, createdAt)`, `(conversationId, isRead)`, both conversation participant columns
- **History:** `profile_views.(viewerId, lastViewedAt)`, `profile_edit_history.(businessId, changedAt)`
- **Notifications:** `(userId, createdAt)`, `(userId, isRead)`
- **Benchmark:** `readiness_scores.(sector, computedAt)`
- **Events:** `(userId, createdAt)`, `(entityType, entityId, createdAt)`, `(eventType, createdAt)`
- **Impressions:** `(userId, createdAt)`, `(pitchId, createdAt)`
- **Search:** `business_search_trgm_idx` GIN trigram on businesses
- **Badges:** `businesses_badges_gin_idx` GIN on badges jsonb for `@>` queries
- **Feed rank inputs:** `businesses_state_idx`, `businesses_nic_idx`, `businesses_status_idx`, `businesses_data_source_idx`

No index on `events.entityId` alone — always queried as part of `(entityType, entityId)`.

## 9. Migrations

Migrations live in `server/drizzle/`, generated by Drizzle Kit.

**Current state: fragile.** The 0010 and 0011 SQL files were applied via a manual `pool.query()` loop (`scripts/apply-migration-0010.js` pattern), not `drizzle-kit migrate`, because Drizzle's SQL splitter doesn't handle the `DO $$ ... $$` blocks used to guard `CREATE TYPE IF NOT EXISTS`.

The schema is correct in Postgres. The `__drizzle_migrations` table may not reflect every applied file. **Future `npm run generate` runs should be audited before `npm run migrate`.**

Safest workflow for new migrations:
1. Generate: `npm run generate`
2. Open the SQL file
3. Verify it contains only `CREATE TABLE` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
4. If it contains `DO $$` blocks, apply manually via the pool.query loop pattern
5. Otherwise `npm run migrate`

Tests read every `.sql` file in `drizzle/` in sorted order into a fresh PGlite instance. PGlite doesn't ship `pg_trgm` in all versions — the harness loads it explicitly and skips the trigram index migration if unavailable. In production, `pg_trgm` was enabled once on Neon.

## 10. Rate limits

Not database constraints. Enforced in the service layer.

- `send_message`: 500 per day per user
- `new_conversation`: 50 per day per user
- `gemini_extract`: 14 per minute, global (stays under Gemini free tier of 15 RPM)

In-memory map with daily reset, sliding window for Gemini. Cleared on server restart.

Migration path to Redis when multi-instance. Interface (`enforceLimit`, `checkLimit`) stays the same.

## 11. Data ingestion pipeline

The pipeline that populates the 206,048 MCA businesses.

**Sources:** `data.gov.in` publishes per-state company master data (CSV, 16 columns). Goa was 15,897 rows; Karnataka was 263,365 rows. Ingestion is per-state and idempotent.

**Two tables:** `raw_mca_records` (append-only JSONB of exact CSV row) and `businesses` (canonical, upserted by CIN).

**Idempotency:** every row gets SHA256 hash of canonical fields (CIN, name, status, capital, address, listing status, NIC). Unique constraint on `(cin, contentHash)`.

**Filtering at ingest:**
- LLPs excluded (LLPIN format doesn't match CIN regex) — 51,169 rows
- Foreign F-codes excluded — 589 rows
- Malformed CINs excluded — 12 rows

**Throughput measured:** row-by-row inserts ran at 12 rows/sec (22 min for 15,897 rows). Batched 250-row multi-INSERT runs at 269 rows/sec (59s for same file) — **22× speedup**.

**Scripts:** `scripts/ingest-mca.js`, `scripts/recompute-matches.js`.

## 12. Enrichment pipeline

Three enrichment phases, run manually (not scheduled).

### 12.1 Template descriptions

For every MCA business without an owner-written description, generate a deterministic template:

> "{company_name} is a {class} company operating in the {sector} sector, based in {city}, {state}. Incorporated in {year}. Authorized capital: {capital}. Financial details and traction metrics have not been provided by the business owner."

Written in batches of 200 rows per UPDATE. Ran on 13,266 investable businesses in ~45 seconds. Field provenance tagged `generated`.

### 12.2 Wikidata bulk match

Fetch all Indian business entities from Wikidata via SPARQL (four inception-year ranges + one no-inception batch), yielding 2,509 candidates. Match locally against MCA names after normalization (strip legal suffixes, lowercase, remove punctuation). Require year-of-incorporation agreement (±5 years) to prevent false positives.

**Measured outcome:** 29 name matches, **15 pass the year check** (100% precision on manual inspection), 6 rejected by year mismatch (the false positives), 8 skipped for missing date on one side.

**Why bulk-fetch:** per-company SPARQL would be ~13,540 round trips at 1 req/sec ≈ 3.8 hours. Bulk fetch is 5 queries in ~2 minutes. Match happens locally in ~10 seconds.

### 12.3 Logo enrichment

For businesses with `websiteUrl`, extract logo using this priority order:
1. JSON-LD `Organization.logo` from homepage
2. `<link rel="apple-touch-icon">`
3. Largest `<link rel="icon">` by `sizes` attribute
4. `og:image`
5. Google favicon service (`google.com/s2/favicons?domain=X&sz=128`) as last resort

Concurrency 15 via `p-limit`, 8s hard timeout, `logoCheckedAt` prevents re-fetching.

**Measured distribution** across 2,870 logos: 502 (17.5%) full brand resolution from site structured data, 448 (15.6%) from Google favicon, 1,690 (58.9%) from DeBounce, 230 (8.0%) unverified.

**Script:** `scripts/enrich-investable.js` with phases `descriptions`, `wikidata`, `logos`, `directors`.

### 12.4 Domain discovery — negative result

Seven free domain-discovery APIs tested. All failed:
- Serper (paid): 403 Forbidden
- DuckDuckGo HTML: rate-limited at 2 queries
- Tavily (keyless): all returned `tracxn.com`
- Clearout/Clearbit: 15% accuracy
- Raw Wikidata: 0% due to strict P856 property match
- Pipeworx raw: initials-guessing (`ANI Technologies → atp.com`)
- Pipeworx + verification gate: 78.9% precision, 60% recall on 25-company sample

**Free domain discovery is not viable at scale.** Paid provider or manual curation is required.

## 13. Readiness scoring

`readiness_scores` populated by a deterministic feature-checklist scorer, not ML.

**Features (sum to 100 points):**
- Profile basics (35): company name 5, sector 5, city 5, description 10, tagline 5, business model 5
- Team (5): employee count
- Funding (15): funding ask 5, funding instrument 5, use of funds breakdown 5
- Traction (20): revenue range 10, customer count 5, revenue trend 5
- Verification (15): verified document 10, basic document 5
- Digital presence (10): website 5, logo 5

**Service:** `src/services/readiness.service.js`. Persists each computation to `readiness_scores` with `modelVersion = "rules-v1"`. The `shapBreakdown` field holds the feature checklist (name is legacy from a planned SHAP integration).

**Routes:**
- `GET /api/businesses/:id/readiness`
- `POST /api/businesses/:id/readiness/recompute`

**Auto-recompute:** fires fire-and-forget after any business profile update.

## 14. Investor brief (LLM-generated)

A one-page summary generated from stored structured fields. Cached in `businesses.investorBrief` (jsonb) for 7 days.

**Model:** `gemini-3.8-flash` with `responseMimeType: "application/json"`, temperature 0.2. **Gemini 2.5 Flash was retired 2026-10-20** — any reference to it in older docs is stale. Model name must be `gemini-3.8-flash`.

**Prompt strategy:**
- Explicit "only use facts in the data, never invent" instruction
- Inject `whatsMissing` list so the model knows what *not* to write about
- Strict JSON schema in the prompt (headline, what_they_do, traction, the_ask, risks)
- Deterministic `whatsMissing` array appended after the LLM response

**Known gaps (must fix before submission):**
- No Zod schema validation on the LLM output. A malformed response could yield `undefined` fields in the UI.
- No `withRetry` wrapper. Gemini 503 "high demand" errors surface as failures.

**Routes:**
- `GET /api/businesses/:id/brief`
- `GET /api/businesses/:id/brief?regenerate=true`

**Error handling:** 503 UNAVAILABLE from Gemini is transient (5-minute window typical). Retry or fall back to `gemini-3.5-flash`.

## 15. Feed ranking

The investor feed is sorted by a weighted scalar combining fame, match, and completeness — **not by match score alone**. Deliberate change: well-known businesses surface first regardless of match, while still reordering within a tier by relevance.

**Formula:**
rank = fame_base

match_score × 10

profile_completeness_pct × 5

fame_base =
100,000 if badges contains "well_known"
50,000 if listing_status = "Listed"
10,000 if authorized_capital ≥ 10,000 Cr
5,000 if authorized_capital ≥ 1,000 Cr
2,000 if authorized_capital ≥ 100 Cr
0 otherwise

text

**Why this ordering:** every tier gap (min 2,000) exceeds the maximum possible match+completeness bonus (1,500). A 100%-match mid-size business cannot outrank a 0%-match famous business.

**Implementation:** raw SQL in `getInvestorFeed` because `badges` and `curatedNote` aren't in the Drizzle model. Cache key prefixed `feed:v2:` to invalidate pre-ranking caches.

**Recompute scope:** `recomputeForInvestor` includes MCA businesses (not just `isProfileComplete = true`):
```sql
is_profile_complete = true
OR (
  data_source = 'mca'
  AND company_status = 'Active'
  AND (
    badges @> '["well_known"]'::jsonb
    OR listing_status = 'Listed'
    OR authorized_capital >= 10000000
  )
)
Yields ~13,540 scored pairs per investor (vs ~5 previously).

16. Current data state
As of 2026-11-03:

Metric	Value
MCA businesses ingested	206,048
Active	140,977
Investable (₹1Cr+ / listed / well-known)	~13,540
Template descriptions written	13,266
Wikidata-verified websites	15
Curated flagship profiles (seeded)	10
Logos enriched	2,870
Test files	47
Tests	619
HTTP endpoints	80+
Relational tables	26
Mongo collections	5 (1 used)
17. Things that shaped the schema
Identity is stable, extensions are separate. One users table, one row per human. Business and investor data live in extension tables. Every FK points at users.id or a row that eventually does.

Ownership is checked in the service layer, not with roles. A user can own businesses and invest at the same time. Every business-scoped service starts with an ownership assertion. No requireRole middleware anywhere.

State is mutable, history is append-only. Current values in one row. History in tables that only get inserts. Readiness scores, events, feed impressions, messages, profile edits, raw_mca_records all follow this pattern.

Denormalization is used for the hot path only. Valuations, businessId on offers, sector on readiness scores, lastMessageAt on conversations.

Constraints enforced where cheapest. Uniqueness and referential integrity in Postgres, shape validation in Zod, business rules in services.

Everything that evolves is versioned. modelVersion on scores and matches. schemaVersion on events. Migrations committed. Sessions rotate.

Provenance is first-class. fieldProvenance jsonb tracks per-field trust level (verified / document_backed / self_declared / scraped / generated). The provenance principle is applied uniformly: to the brief, to the badges, to the completeness score.