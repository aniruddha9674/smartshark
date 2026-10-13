Quick check for #2 before I write:

```powershell
cd C:\Users\Admin\Documents\SmartShark\virtual-shark-tank\server
Select-String -Path src\services\*.js,src\controllers\*.js -Pattern "MatchExplanation|matchExplanation"
```

If it prints nothing, the model is dead code parked for a future feature. I'll note it that way in the doc rather than pretending it's live.

Here's the rewritten file. Save as `docs/database.md` (or wherever the old one lives). Plain voice, no callout formatting, no "Why the design:" labels.

---

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

## 3. MongoDB

Driver is Mongoose. Connection string is `MONGO_URI`. The connection is opened lazily by `server.js` rather than at import time, so tests can boot the app without touching Atlas.

## 4. Tables

Ordered by dependency. Identity first, then profiles, then the discovery layer, then deals, then supporting tables.

### users

The root identity table. Every other foreign key in the system points here or to a row that eventually points here.

Columns you'll actually touch: `id` (uuid primary key), `name`, `email` (unique), `passwordHash` (bcrypt, twelve rounds, never returned by any endpoint), `role` (business, investor, or admin), `isVerified`, `isActive`, `isProfileComplete`, and a set of notification preferences (`notifyNewMatch`, `notifyNewMessage`, `notifyFollow`, `notifyProfileUpdate`, `notifyScoreChange`, `notifyVerification`) that are all booleans defaulting to true. Plus `avatarUrl`, `language`, `theme`, and the usual timestamps.

The design decision worth calling out: there's only one user table. Both dashboards share it, both use the same login endpoint, and both get the same JWT shape. Role determines which dashboard loads by default, but it doesn't gate routes — see the ownership pattern below. A user can be an investor and own a business at the same time and the system handles it without special cases.

Settings live inline instead of in a separate table. Ten boolean-ish fields don't justify a join.

File: `user.model.js`.

### refresh_tokens

One row per issued refresh token. Enables logout and refresh rotation.

`userId` cascades from users. `tokenHash` is SHA256 of the raw token — we never store the raw value, so a database leak doesn't hand over usable sessions. `expiresAt` is thirty days out. `revoked` flips to true when the user logs out or when the token gets rotated. `userAgent` is captured for a future "active sessions" UI.

The key property is that it's one row per issue, not one row per user. That lets the same account have an active session on a laptop and a phone without either kicking the other out.

File: `refreshToken.model.js`.

### businesses

A business owned by a user. There's no one-per-user constraint — a user can own as many as they want.

`ownerId` references users and cascades on delete. It is deliberately not unique. The core profile fields are `companyName`, `sector`, `city`, `description`, `fundingAsk`, `yearsOperating`, and `websiteUrl`. There's a second group of columns that track verification state: `udyamNumber`, `gstNumber`, `shopActLicense`, and `verificationTier` (unverified, basic, or verified). The tier is computed from Mongo verification documents and mirrored here so feed queries and match scoring don't have to touch Mongo.

The import pipeline added a third group: `isExternal`, `sourceBatchId`, `sourceRowId`, `enrichmentStatus`, `enrichedAt`, `logoUrl`, `coverImageUrl`. These track whether the row came from a CSV import rather than a real signup, and where it came from. `sourceBatchId` and `sourceRowId` reference the import tables.

Indexes are on `ownerId` (for "my businesses"), `sector` (for feed filtering), `verificationTier`, `isExternal`, `enrichmentStatus`, `sourceBatchId`, plus a GIN trigram index on the concatenation of `companyName`, `sector`, `city`, and `description` for fuzzy search.

That trigram index is worth explaining. Business search is backed by Postgres `pg_trgm` — the `similarity()` and `word_similarity()` functions score how close a query string is to the concatenated fields, and the GIN index makes the candidate lookup fast without a sequential scan. It also means typos still match. `incorbiss` finds `Incorbiss`, `incor` finds it, `software` finds every SaaS company. Full text search with `tsvector` would also work but trigram is simpler to reason about and handles partial words better.

File: `businessProfile.model.js`. (The file name is legacy — the table is `businesses`.)

### investor_profiles

Investor-specific fields. Strictly one per user.

`userId` is unique and cascades. The columns are `panNumber`, `firmName`, `investmentFocus` (a comma-separated sector list), `preferredGeography`, `minTicketSize`, `maxTicketSize`, `isIdentityVerified`.

`investmentFocus` and `preferredGeography` are varchar rather than a join table. That's a deliberate simplification — the sectors are a small fixed list, the geographies are cities, and joins on a comma-separated string aren't needed anywhere in the matching scorer. If the platform ever grows to thousands of distinct sectors this becomes wrong. It won't.

File: `investorProfile.model.js`.

### follows

Polymorphic follow. An investor can follow a business, a business can follow an investor. Both directions live in the same table.

`followerId` and `followingId` both reference users and both cascade. There's a unique index on the pair so you can't follow twice, a reverse index on `followingId` so "who follows me" doesn't scan, and a check constraint that stops self-follows at the database level. That last one has saved us from an application bug at least once.

File: `following.model.js`.

### notifications

Per-user notification inbox. Cross-cutting — every other service eventually writes here.

`userId` is the recipient and cascades. `actorId` is who triggered it and uses `set null` so deleting a user doesn't wipe the notification history. `type` is an enum (new_match, new_message, follow, profile_update, score_change, verification_update, saved_business_activity, system). `title` is pre-rendered. `body` is optional. `metadata` is jsonb holding whatever the specific type needs — match IDs, pitch IDs, whatever.

Two indexes matter: `(userId, createdAt)` for the main feed query, `(userId, isRead)` for the unread badge. Both are used on every page load.

The notification service respects the user's `notify*` preferences before inserting. It also swallows its own errors — a failed notification never fails the parent operation.

File: `notification.model.js`.

### conversations

One row per chat thread. One thread per user pair, forever.

The clever bit is that participants are stored as an ordered pair. `participantAId` is always the lower UUID, `participantBId` the higher, and there's a check constraint enforcing it. That means (X, Y) and (Y, X) collapse into the same row without any normalization logic in the service. A unique index on the pair plus the ordering makes double-creation impossible.

`lastMessageAt` is denormalized so the chat list can sort by activity without joining messages.

File: `conversation.model.js`.

### messages

Chat messages. Append-only — you never update a row, you only insert.

`conversationId` cascades from conversations. `senderId` references users. `body` is the text. `isRead` and `readAt` track per-message read state.

Two indexes: `(conversationId, createdAt)` for loading a thread, `(conversationId, isRead)` for unread counts.

Rate limit is 500 messages per user per day, enforced in the service layer, not the database.

File: `messages.model.js`.

### profile_views

Tracks who viewed whom. One row per viewer/viewed pair, upserted.

`viewerId` and `viewedId` both reference users. `viewCount` increments on repeat views. `lastViewedAt` updates. Check constraint prevents self-views.

This is an upsert rather than append-only. If it were append-only, a hundred people refreshing each other's profiles would balloon the table with no analytical value. The upsert keeps it small while still supporting "recently viewed" queries via the `(viewerId, lastViewedAt)` index.

File: `profileViews.model.js`.

### readiness_scores

Business readiness score history. Append-only — every recompute is a new row.

`businessId` cascades. `score` is 0 to 100. `modelVersion` marks which scoring engine produced the row. `shapBreakdown` is jsonb holding per-feature contributions in the shape `[{ feature, value, contribution }]`. `suggestions` is jsonb holding an array of improvement strings. `sector` and `stage` are denormalized so the sector benchmark query doesn't need to join businesses.

Because it's append-only, the trend chart is free — just fetch rows ordered by `computedAt`.

The `modelVersion` field matters more than it looks. When the scoring model changes, old rows stay marked with the old version. You can compare rules-v1 against ml-v2 without ambiguity.

File: `readinessScore.model.js`.

### matches

Algorithmic pairing of a business and an investor. One row per pair, upserted.

`businessId` and `investorId` reference their respective tables and cascade. `matchScore` is 0 to 100. `matchReasons` is jsonb holding the per-factor breakdown — the shape is `[{ factor, weight, score, matched, detail }]` and it's what the UI uses to render the "why this matched" section. `modelVersion` marks the scorer. `status` is an enum (pending, viewed, shortlisted, passed, connected).

The scorer is rule-based. Five factors with fixed weights: sector (30), ticket size (25), geography (20), verification tier (15), readiness (10). The weights were chosen by hand and haven't been tuned against data yet. When we have enough behavioral signal to train a ranker, the scorer gets swapped out and `modelVersion` records the change.

Unique index on `(businessId, investorId)` so recompute is an upsert. Indexes on `(investorId, matchScore)` and `(businessId, matchScore)` for the two feed directions.

File: `match.model.js`.

### profile_edit_history

Audit trail of business profile changes. Append-only.

`businessId` cascades. `editedById` uses `set null` for system-initiated edits like tier bumps. `fieldName`, `oldValue`, `newValue`, and `fieldType` describe one field change per row.

This is one row per changed field, not one row per save. If a user updates three fields and hits save, that's three rows. The History tab reads them in reverse chronological order and doesn't have to parse a diff blob.

All values are stored as text. Audit tables shouldn't care about types — the point is to reconstruct what changed, not to query against it.

Writes happen inside the same Postgres transaction as the businesses update, so the audit and the state change are atomic.

File: `profileEditHistory.model.js`.

### pitches

A business's formal ask for investment. Temporal — a business can publish many over time.

`businessId` cascades. The content fields are `title`, `tagline`, `shortPitch`, `longSummary`, and `sectorSpecificFields` (jsonb, for whatever extras a given sector wants). Money fields are `askAmount`, `equityOffered`, and `valuation`. `valuation` is denormalized: it's `askAmount / (equityOffered / 100)` computed on write.

Media is stored as URLs only — `videoUrl`, `pitchDeckUrl`, `coverImageUrl`. Files live in Cloudinary. The database never holds binaries.

`status` moves through draft, live, closed, funded, withdrawn. `publishedAt` and `closedAt` record the transitions.

Two check constraints: equity must be between 0 and 100 exclusive, ask amount must be positive.

Only one live pitch per business at a time. That's enforced in the service, not the database — a partial unique index would work but the check is cheap enough at publish time.

File: `pitch.model.js`.

### offers

An investor's bid on a pitch. Self-referencing, so counter-offer threads are just chains of rows.

`pitchId` cascades. `investorId` and `businessId` identify the two parties. `initiatedById` records who created *this particular row* — which is how counter-offers work: either party can create a new row pointing back at the previous one via `parentOfferId`. That field uses `set null` so deleting a parent doesn't break the chain.

Money fields: `amount`, `equityRequested`, `valuation` (denormalized). `conditions` is jsonb for custom terms. `message` is an optional note.

`status` is pending, accepted, rejected, countered, withdrawn, or expired. Once a row hits a terminal status it's never updated again.

Expiry uses lazy evaluation. There's no cron job scanning for expired offers. Every read or action checks `expiresAt` and marks the row expired if it's past. This is a small thing but it means the system doesn't need a scheduler, and the state is always correct when observed.

Indexes: `(pitchId, status, createdAt)` for listing offers on a pitch, `(investorId, createdAt)` for "my offers", `(businessId, status)` for "offers received", plus `parentOfferId` for walking threads.

File: `offer.model.js`.

### investments

A closed deal. Created when a business accepts an offer. Append-only.

`pitchId`, `offerId`, `investorId`, and `businessId` all reference their respective tables and cascade. `amount` is the funds committed, `equityTaken` is the percentage given up, `valuation` is denormalized at close. `status` is active, exited, or written_off. `investedAt` is when the offer was accepted.

The important property is that this row is created inside the same Postgres transaction as the offer acceptance. Either the offer becomes accepted, siblings get rejected, the pitch gets funded, the investment row exists, and the conversation opens — or none of those things happen. There's no intermediate state where an offer looks accepted but the investment is missing.

The `offerId` is unique per investment. One offer maps to exactly one investment.

File: `investment.model.js`.

### events

Append-only activity log. Captures everything a user does, including actions against Mongo entities.

`userId` uses `set null` — events must survive user deletion. `eventType` is a varchar validated against a registry in `src/events/registry.js`. `entityType` says what kind of thing the event is about. `entityId` is deliberately `varchar(255)` and deliberately not a foreign key, because it holds both Postgres UUIDs and Mongo ObjectIds. `metadata` is jsonb whose shape is documented per event type in the registry. `schemaVersion` bumps when the metadata shape changes for a given type.

The registry is the interesting part. An insert only succeeds if the event type is registered. Unknown types don't throw — they get recorded to `rejected_events` and the caller moves on. That means adding a new event type requires a code change to the registry, not a migration, and the `rejected_events` table tells you which types the system is asking for.

Writing an event is fire-and-forget. `eventService.log()` swallows its own errors, and it's never called inside a `db.transaction()`. The second rule exists because PGlite — which tests use — deadlocks on nested connections. So events always write after the transaction commits.

Registered types cover pitches, offers, follows, messages, auth, and verification. Full list in the registry.

Indexes: `(userId, createdAt)`, `(entityType, entityId, createdAt)`, `(eventType, createdAt)`. Each one backs a specific query — "my events", "events on this entity", "all events of this type".

File: `event.model.js`.

### feed_impressions

Append-only log of which pitches appeared where in a feed. This is the position-bias training signal.

`userId` and `pitchId` both cascade. `surface` is feed, search, or shortlist. `position` is the zero-indexed rank. `score` is the model score at impression time. `modelVersion` marks the scorer.

Kept separate from `events` because impressions are high volume — every feed render logs one row per pitch shown — and they're only queried for ML training, never for user-facing reads. Inserts go through `logBatch()` rather than one at a time.

The combination of position, score, and model version is what makes the table useful. It lets you answer questions like "at what rank do users actually click?" and "did the last model change move clicks up or down?".

File: `feedImpression.model.js`.

### rejected_events

Every attempt to log an unregistered event type lands here. One row per distinct attempted type.

`attemptedType` is unique. `count` increments on each repeat. `sampleUserId` uses `set null`. `firstSeenAt` and `lastSeenAt` track the window.

This table is how the event registry stays honest. If `verification_approved` gets attempted two hundred times this week, that's the system saying it wants a registry entry. If something gets attempted once, it's probably a typo in a service call. A weekly query like this one gives you a prioritized list of missing registry entries:

```sql
SELECT attempted_type, count
FROM rejected_events
WHERE count > 100
ORDER BY count DESC;
```

File: `rejectedEvent.model.js`.

### import_batches

Tracks each CSV import as one row.

The columns are what you'd expect: `id`, `filename`, `rowCount`, `status`, and timestamps. Rows in `businesses` that came from an import link back here via `sourceBatchId`.

### raw_import_businesses

The raw parsed rows from an import, before transformation.

Every column from the source CSV is preserved as jsonb under `rawData`, plus `batchId` and `rowIndex` so you can trace a harmonized business back to the exact source row. `status` tracks whether a row has been processed yet.

Keeping raw rows around costs nothing and means an import can be re-run against the same source without re-uploading. It's also how you debug a bad transform — you can diff the raw row against the harmonized business.

### harmonization_errors

Rows from an import that couldn't be harmonized into a business.

`batchId`, `rowIndex`, `errorMessage`, plus the raw data that failed. Anything here is a signal that the column matcher or the transform inferrer needs work.

## 5. Relationships

Foreign keys and what happens when the parent gets deleted.

Cascade is the default for owned data — refresh tokens, businesses, pitches, offers, investments, messages, matches, readiness scores, profile edits, follows, notifications, impressions. Delete a user, everything they own goes with them.

`set null` is for references that should survive. Notification actors, profile edit editors, event users, rejected event samples, offer parents. These represent history, and history shouldn't disappear because someone deactivated their account.

One special case. `events.entityId` is not a foreign key at all. It's a varchar holding either a UUID or a Mongo ObjectId, and there's no referential integrity to enforce because the two databases can't have one.

The multi-business relationship on `businesses.ownerId` is N:1 even though it started 1:1. That was a refactor about six weeks into the project. The old `business_profiles` table had a unique constraint; the new one doesn't. Every foreign key that used to point at a "business profile" now points at `businesses.id`.

## 6. Enums

Postgres enums, all defined through Drizzle's `pgEnum`. Adding a value requires a migration — that's a cost, so the values are chosen to be stable.

`role`: business, investor, admin. On users.
`verification_tier`: unverified, basic, verified. On businesses.
`notification_type`: new_match, new_message, follow, profile_update, score_change, verification_update, saved_business_activity, system. On notifications.
`match_status`: pending, viewed, shortlisted, passed, connected. On matches.
`pitch_status`: draft, live, closed, funded, withdrawn. On pitches.
`offer_status`: pending, accepted, rejected, countered, withdrawn, expired. On offers.
`investment_status`: active, exited, written_off. On investments.

`events.eventType` is deliberately not an enum. New event types shouldn't require a migration — they're validated in the registry and rejected types go to `rejected_events`.

## 7. The verification pipeline

This is the part of the system that doesn't work like the rest of it, so it gets its own section.

A user uploads a document — Udyam, GST, or Shop Act. The file goes to Cloudinary and a Cloudinary URL comes back. Then the verification service creates a Mongo document with status `pending` and calls the extraction service.

Extraction fetches the image, base64-encodes it, and sends it to Gemini with a prompt specific to the document type. Gemini is configured with `responseMimeType: "application/json"` and a temperature of 0.1, so the response is strict JSON rather than prose with JSON in it. The response is a map of field name to `{ value, confidence }`.

Before that response gets stored, it goes through format validation. Each field with a known validator gets annotated with `formatValid` and `formatReason`.

GSTIN validation checks the fifteen-character format, the state code (must be 1 to 37), and the checksum. The checksum is a mod-36 calculation over alternating position weights — the exact algorithm is in `formatValidator.service.js`.

Udyam validation checks the format `UDYAM-XX-00-0000000` and that the state code is one of the real Indian state codes.

PAN validation checks the format and that the fourth character is a valid holder type.

Shop Act is looser — length and character class, no checksum.

After annotation, the Mongo document gets a status. If Gemini says the wrong document was uploaded, status is `rejected`. If overall confidence is at least 0.7, status is `verified`. Otherwise `needs_review`.

Nothing writes to the business profile yet. That's a separate user action called apply.

When the user clicks apply, the service reads the OCR fields, merges them with any values the user has explicitly confirmed in the UI, and compares each against the current value on the business row.

If the business field is empty, the new value gets written. If it's non-empty and differs, the value goes into a conflicts array and the existing value stays. The user sees the conflict and decides. If it's non-empty and the same, nothing happens.

That write happens inside a Postgres transaction. The businesses row updates and one row per changed field goes into `profile_edit_history`. Both succeed or neither does.

After the transaction, the Mongo verification gets `status = "verified"` and an `appliedFields` array listing what the user confirmed.

Then the service recomputes the verification tier. It reads every verification for the business, extracts the company name from each based on the document type's field mapping (Udyam's `enterprise_name`, GST's `legal_name`, Shop Act's `establishment_name`), normalizes each to lowercase and trims, and counts unique values.

No verifications gives unverified. One or more verified documents with at least one distinct name gives basic. Two or more verified documents where all names collapse to a single unique value gives verified.

That last rule is the whole point. A business can upload both an Udyam and a GST certificate, and if the two documents disagree on the company name, the tier stays at basic. The system doesn't trust a document in isolation — it trusts agreement across documents. That's the cross-document consistency signal, and it's the paper's core contribution.

If the tier changed, the businesses row updates and a `verification_tier_changed` event fires. Like all events, outside the transaction.

Events fire at every stage: started, extracted, applied, tier changed, failed. None of them are inside a transaction, and none of them can fail the parent operation.

## 8. Indexes

Rather than listing every one, here's what's indexed and why.

Auth hits `users.email`. The unique index is what makes duplicate registration detection work.

The investor feed uses `matches.(investorId, matchScore)` plus `pitches.(status, publishedAt)`. The composite is ordered so the equality filter comes first and the sort comes second.

The business feed uses `matches.(businessId, matchScore)` plus `offers.(businessId, status)`.

Chat uses `messages.(conversationId, createdAt)` for thread loads and `(conversationId, isRead)` for unread counts, plus indexes on both conversation participant columns.

History tabs use `profile_views.(viewerId, lastViewedAt)` and `profile_edit_history.(businessId, changedAt)`.

Notifications use `(userId, createdAt)` and `(userId, isRead)`.

The sector benchmark uses `readiness_scores.(sector, computedAt)`.

Events have three indexes: `(userId, createdAt)`, `(entityType, entityId, createdAt)`, `(eventType, createdAt)`. Each one matches a query pattern in the event service.

Impressions have `(userId, createdAt)` and `(pitchId, createdAt)`.

Search uses the trigram GIN index on businesses.

There's no index on `events.entityId` alone. It's always queried as part of the `(entityType, entityId)` pair.

## 9. Migrations

Migrations live in `server/drizzle/`, generated by Drizzle Kit, applied by `drizzle-kit migrate`.

Workflow after editing a model file:

```
cd server
npm run generate   # writes drizzle/NNNN_name.sql
npm run migrate    # applies pending migrations
```

For development, `npm run push` will apply schema changes directly without generating a migration file. Faster but not versioned, so never use it on a branch that will be shared.

Tests read every `.sql` file in `drizzle/` in sorted order and apply them to a fresh PGlite instance. This means every migration must be committed. If a test fails with "relation does not exist", a migration file is missing from the repo.

PGlite doesn't ship the `pg_trgm` extension in all versions, so the test setup loads it explicitly and the migration that creates the trigram index is skipped if the extension isn't available. In production, `pg_trgm` was enabled once manually on Neon and the index exists.

## 10. Rate limits

Not database constraints. Enforced in the service layer.

`send_message`: 500 per day per user.
`new_conversation`: 50 per day per user.
`gemini_extract`: 14 per minute, global — this one exists to stay under Gemini's free tier of 15 requests per minute.

Implementation is an in-memory map with daily reset, and a sliding window for the Gemini case. Cleared on server restart, which is fine for a single-instance MVP.

When the platform runs on multiple instances, the in-memory limits break — each instance would count independently. The migration path is Redis with `INCR` and `EXPIRE`. The service interface (`enforceLimit`, `checkLimit`) doesn't need to change.

## 11. Things that shaped the schema

A few decisions that show up in more than one place.

Identity is stable and extensions are separate. There's one users table, one row per human. Business data and investor data live in extension tables. Every foreign key in the system points at `users.id` or at a row that references it, never at a profile.

Ownership is checked in the service layer, not with roles. A user can own businesses and invest at the same time. The check that matters is "does this business belong to this user?", which is why every business-scoped service starts with an ownership assertion and why there's no `requireRole` middleware anywhere.

State is mutable, history is append-only. Current values live in one row. History lives in a table you never update. Readiness scores, events, feed impressions, messages, and profile edits all follow this pattern. Users, businesses, pitches, and offers don't — those are current state.

Denormalization is used for the hot path only. Valuations on pitches and offers, `businessId` on offers and investments, sector on readiness scores, `lastMessageAt` on conversations. All of these are computed on write so the read side doesn't have to. Anything not on a hot path stays normalized.

Constraints are enforced where they're cheapest. Uniqueness and referential integrity in the database, shape validation in Zod, business rules in the service layer. Self-follows and self-views are database checks because they're cheap to express as SQL and they've caught application bugs.

Everything that evolves is versioned. Scores and matches have `modelVersion`. Events have `schemaVersion`. Sessions rotate. The idea is that any query over historical data can be filtered by the version of the code that wrote it.
