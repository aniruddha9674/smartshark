# Database

Complete schema reference for the SmartShark platform.

**Stack:** Postgres (Neon) + MongoDB (Atlas)
**ORM:** Drizzle (Postgres), Mongoose (MongoDB)
**Location:** `server/src/models/postgres/`, `server/src/models/mongo/`

---

## 1. Overview

The platform uses **polyglot persistence** — two databases, each chosen for what it does best.

| Store | Data | Why |
|---|---|---|
| **Postgres** | 14 relational tables — users, profiles, matches, pitches, offers | Joins, transactions, ACID guarantees |
| **MongoDB** | Verification documents (OCR output, review state) | Schema-less, shape varies per document type |

Everything in Postgres references `users.id` as the root identity. MongoDB links back via a `userId` string field, enforced at the service layer.

See [§2 Data Stores](#2-data-stores) for the split rationale.

---

## 2. Data Stores

### 2.1 Postgres (Neon)

- **Purpose:** Core relational data — anything queried with joins, filtered, sorted, or aggregated
- **Driver:** `pg` (node-postgres) with connection pooling
- **Connection:** Pooled endpoint via `POSTGRES_URI` in `.env`
- **Why this driver:** Long-running Express server needs persistent TCP connections. Neon's HTTP serverless driver is for serverless functions only.
- **IPv4 forced:** `family: 4` in pool config — fixes IPv6 routing issues on some ISPs.

### 2.2 MongoDB (Atlas)

- **Purpose:** Verification data (uploaded documents, OCR results, review status)
- **Driver:** Mongoose
- **Connection:** `MONGO_URI` in `.env`
- **Why Mongo:** OCR output shape varies per document type (Udyam vs GST vs Shop Act). No fixed schema. No joins needed.

---

## 3. Table Catalog

All Postgres tables. Ordered by **dependency layer** — identity first, then profiles, then interactions, then domain.

### Layer summary

| Layer | Tables | Purpose |
|---|---|---|
| **1. Identity** | `users`, `refresh_tokens` | Who you are, how you log in |
| **2. Profiles** | `business_profiles`, `investor_profiles` | Role-specific extensions |
| **3. Discovery** | `follows`, `profile_views`, `matches` | How users find each other |
| **4. Communication** | `conversations`, `messages`, `notifications` | How users talk |
| **5. Domain** | `pitches`, `offers` | The deal flow |
| **6. Analytics** | `readiness_scores`, `profile_edit_history` | Computed + audit data |

---

### 3.1 `users`

**Purpose:** Root identity table. Every other FK points here.

**File:** `server/src/models/postgres/user.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | varchar(255) | |
| `email` | varchar(255) | unique index |
| `passwordHash` | varchar(255) | bcrypt, never returned |
| `role` | enum | `business` \| `investor` \| `admin` |
| `isVerified` | boolean | default false |
| `isActive` | boolean | default true |
| `isProfileComplete` | boolean | default false |
| `avatarUrl` | varchar(500) | nullable |
| `language` | varchar(10) | default `en` |
| `theme` | varchar(10) | default `system` |
| `notifyNewMatch` | boolean | default true |
| `notifyNewMessage` | boolean | default true |
| `notifyFollow` | boolean | default true |
| `notifyProfileUpdate` | boolean | default true |
| `notifyScoreChange` | boolean | default true |
| `notifyVerification` | boolean | default true |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | `$onUpdate` auto-set |

**Indexes:**
- `email_idx` (unique) on `email`

**Why the design:**
- Single identity for both dashboards — one login endpoint, one JWT
- Settings stored inline (not separate table) — only ~10 fields, would be over-engineering to split
- `isProfileComplete` gates visibility on the platform

**Used by:** Every other table via FK.

---

### 3.2 `refresh_tokens`

**Purpose:** Revocable session management. Enables logout + refresh rotation.

**File:** `server/src/models/postgres/refreshToken.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | uuid FK | → `users.id`, cascade delete |
| `tokenHash` | varchar(255) | SHA256 of raw token |
| `userAgent` | varchar(255) | nullable, for "active sessions" UI later |
| `expiresAt` | timestamp | 30 days from issue |
| `revoked` | boolean | default false |
| `createdAt` | timestamp | |

**Why the design:**
- **Hashed, not raw** — DB leak doesn't expose usable tokens
- **One row per issue, not per user** — lets a user have multiple active sessions (phone + laptop)
- **Rotation** — old token revoked, new one inserted on every refresh

**Used by:** Auth flow only.

---

### 3.3 `business_profiles`

**Purpose:** Business-specific fields. 1:1 with a `users` row where `role = 'business'`.

**File:** `server/src/models/postgres/businessProfile.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | uuid FK unique | → `users.id`, cascade delete |
| `companyName` | varchar(255) | |
| `sector` | varchar(100) | |
| `city` | varchar(100) | |
| `description` | text | medium-length |
| `udyamNumber` | varchar(50) | nullable |
| `gstNumber` | varchar(50) | nullable |
| `shopActLicense` | varchar(50) | nullable |
| `verificationTier` | enum | `unverified` \| `basic` \| `verified` |
| `fundingAsk` | numeric | |
| `yearsOperating` | integer | |

**Why the design:**
- 1:1 with `users` — separates identity from role data
- `verificationTier` mirrors the verification result from MongoDB
- Verification numbers stored here even though verification flow uses Mongo — Postgres holds the "result" for fast filtering

**Used by:** `readiness_scores`, `pitches`, matching logic.

---

### 3.4 `investor_profiles`

**Purpose:** Investor-specific fields. 1:1 with `users` where `role = 'investor'`.

**File:** `server/src/models/postgres/investorProfile.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | uuid FK unique | → `users.id`, cascade delete |
| `panNumber` | varchar(20) | nullable, identity verification |
| `firmName` | varchar(255) | |
| `investmentFocus` | varchar(255) | sectors |
| `preferredGeography` | varchar(255) | |
| `minTicketSize` | numeric | |
| `maxTicketSize` | numeric | |
| `isIdentityVerified` | boolean | default false |

**Why the design:**
- Mirrors business_profiles structure — same pattern, different fields
- Ticket size range drives matching (business ask must fall in range)

**Used by:** Matching logic, investor feed.

---

### 3.5 `follows`

**Purpose:** One-way follow relationship (investor follows business, or vice versa).

**File:** `server/src/models/postgres/follow.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `followerId` | uuid FK | → `users.id` |
| `followingId` | uuid FK | → `users.id` |
| `createdAt` | timestamp | |

**Indexes:**
- `unique_follow_idx` (unique) on `(followerId, followingId)`
- `following_idx` on `followingId`

**Constraints:**
- `no_self_follow` check: `followerId <> followingId`

**Why the design:**
- One table, both directions — role derived from `users.role`
- Reverse index on `followingId` for "who follows me" queries
- DB-level self-follow guard — prevents app bugs

**Used by:**
- `src/services/follow.service.js` — all read/write operations
- `src/routes/follow.routes.js` — 5 endpoints
- Auto-follow from `match.service.js` when a match is shortlisted (Phase 5)
- Triggers `follow` notifications via `notification.service.js`

---

### 3.6 `notifications`

**Purpose:** Per-user notification inbox. Cross-cutting — receives events from every layer.

**File:** `server/src/models/postgres/notification.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | uuid FK | recipient → `users.id` |
| `actorId` | uuid FK nullable | who triggered → `users.id`, `set null` |
| `type` | enum | see below |
| `title` | varchar(255) | pre-rendered |
| `body` | text | nullable |
| `metadata` | jsonb | flexible payload (`{ matchId, pitchId, ... }`) |
| `isRead` | boolean | default false |
| `readAt` | timestamp | nullable |
| `createdAt` | timestamp | |

**Enum `notification_type`:**
`new_match`, `new_message`, `follow`, `profile_update`, `score_change`, `verification_update`, `saved_business_activity`, `system`

**Indexes:**
- `notif_user_created_idx` on `(userId, createdAt)` — main feed query
- `notif_user_unread_idx` on `(userId, isRead)` — badge count

**Why the design:**
- One table for both roles — type enum handles the difference
- `actorId` uses `set null` so deleting a user doesn't wipe notification history
- JSONB `metadata` avoids column-per-feature

**Used by:** Notification bell on both dashboards.

---

### 3.7 `conversations`

**Purpose:** One row per chat thread. One conversation per user pair, forever.

**File:** `server/src/models/postgres/conversation.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `participantAId` | uuid FK | → `users.id` (lower UUID) |
| `participantBId` | uuid FK | → `users.id` (higher UUID) |
| `lastMessageAt` | timestamp | sort key for chat list |
| `createdAt` | timestamp | |

**Indexes:**
- `unique_conversation_pair_idx` (unique) on `(participantAId, participantBId)`
- `conv_participant_a_idx` on `participantAId`
- `conv_participant_b_idx` on `participantBId`

**Constraints:**
- `conversation_ordered_pair` check: `participantAId < participantBId`

**Why the design:**
- Ordered pair means `(X, Y)` and `(Y, X)` collapse into one row
- `lastMessageAt` denormalized for fast "sort chats by activity" — no join to `messages`

**Used by:**
- `src/services/follow.service.js` — all read/write operations
- `src/routes/follow.routes.js` — 5 endpoints
- Auto-follow from `match.service.js` when a match is shortlisted (Phase 5)
- Triggers `follow` notifications via `notification.service.js`

---

### 3.8 `messages`

**Purpose:** Individual chat messages. Append-only.

**File:** `server/src/models/postgres/message.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `conversationId` | uuid FK | → `conversations.id`, cascade delete |
| `senderId` | uuid FK | → `users.id` |
| `body` | text | |
| `isRead` | boolean | default false |
| `readAt` | timestamp | nullable |
| `createdAt` | timestamp | |

**Indexes:**
- `msg_conv_created_idx` on `(conversationId, createdAt)` — thread load
- `msg_unread_idx` on `(conversationId, isRead)` — unread badge

**Why the design:**
- Append-only — never UPDATE a message
- `senderId` derived participant — the other one comes from `conversation`
- Per-message read state for "seen" indicators

**Used by:**
- `src/services/message.service.js` — send, list, mark-read
- Unread badge (`GET /api/conversations/unread-count`)
- Triggers `new_message` notifications via `notification.service.js`
- **Rate limit:** 500 messages/day per user, enforced by `rateLimit.service.js`

---

### 3.9 `profile_views`

**Purpose:** Track who viewed whom. Upsert — one row per viewer/viewed pair.

**File:** `server/src/models/postgres/profileView.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `viewerId` | uuid FK | → `users.id` |
| `viewedId` | uuid FK | → `users.id` |
| `viewCount` | integer | default 1, incremented |
| `lastViewedAt` | timestamp | updated on each view |
| `createdAt` | timestamp | |

**Indexes:**
- `unique_profile_view_idx` (unique) on `(viewerId, viewedId)`
- `pv_viewer_recent_idx` on `(viewerId, lastViewedAt)` — "recently viewed"
- `pv_viewed_idx` on `viewedId` — "who viewed me"

**Constraints:**
- `no_self_view` check: `viewerId <> viewedId`

**Why the design:**
- Upsert pattern — repeat views just bump `viewCount` and `lastViewedAt`
- Keeps table small vs. append-only
- Still supports "recently viewed" sort

**Used by:** History tabs on both dashboards.

---

### 3.10 `readiness_scores`

**Purpose:** Business readiness score history. Append-only — every recompute is a new row.

**File:** `server/src/models/postgres/readinessScore.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `businessId` | uuid FK | → `users.id` |
| `score` | integer | 0–100 |
| `modelVersion` | varchar(50) | e.g., `rules-v1`, `ml-v2` |
| `shapBreakdown` | jsonb | `[{ feature, value, contribution }]` |
| `suggestions` | jsonb | `["Add GST", "Increase revenue docs"]` |
| `sector` | varchar(100) | denormalized for benchmark query |
| `stage` | varchar(50) | denormalized |
| `computedAt` | timestamp | |

**Indexes:**
- `rs_business_recent_idx` on `(businessId, computedAt)` — trend chart
- `rs_benchmark_idx` on `(sector, computedAt)` — sector average query

**Why the design:**
- Append-only → trend history works
- `modelVersion` — critical for ML. When model changes, old scores marked with old version.
- `sector` denormalized — benchmark query avoids joining `business_profiles`

**Used by:** Business Analysis tab. Current score also cached on `business_profiles`.

---

### 3.11 `matches`

**Purpose:** Algorithmic pairing of business ↔ investor. One row per pair, upserted.

**File:** `server/src/models/postgres/match.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `businessId` | uuid FK | → `users.id` |
| `investorId` | uuid FK | → `users.id` |
| `matchScore` | integer | 0–100 |
| `matchReasons` | jsonb | `[{ factor, weight, matched }]` |
| `modelVersion` | varchar(50) | default `rules-v1` |
| `status` | enum | see below |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Enum `match_status`:**
`pending`, `viewed`, `shortlisted`, `passed`, `connected`

**Indexes:**
- `unique_match_pair_idx` (unique) on `(businessId, investorId)`
- `match_investor_score_idx` on `(investorId, matchScore)`
- `match_business_score_idx` on `(businessId, matchScore)`

**Constraints:**
- `no_self_match` check: `businessId <> investorId`

**Why the design:**
- Built before ML exists — rule-based scorer populates it, ML replaces scoring later
- `modelVersion` for migration between scoring engines
- `status` drives the feed and history views

**Used by:** Feed tabs on both dashboards, Investor Analysis.

---

### 3.12 `profile_edit_history`

**Purpose:** Audit trail of business profile changes. Append-only.

**File:** `server/src/models/postgres/profileEditHistory.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `businessId` | uuid FK | → `users.id` |
| `editedById` | uuid FK nullable | → `users.id`, `set null` |
| `fieldName` | varchar(100) | e.g. `fundingAsk` |
| `oldValue` | text | nullable |
| `newValue` | text | |
| `fieldType` | varchar(30) | `string` \| `number` \| `currency` \| `date` |
| `changedAt` | timestamp | |

**Indexes:**
- `peh_business_recent_idx` on `(businessId, changedAt)` — History tab
- `peh_field_idx` on `(businessId, fieldName)` — field-level history

**Why the design:**
- One row per field change (not one per save) — easier to display
- `editedById` nullable for system edits (verification tier bump)
- All values as text — audit tables shouldn't care about types

**Used by:** Business History tab.

---

### 3.13 `pitches`

**Purpose:** A business's formal ask for investment. Temporal — a business can have many over time.

**File:** `server/src/models/postgres/pitch.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `businessId` | uuid FK | → `users.id` |
| `title` | varchar(255) | internal round name |
| `tagline` | varchar(300) | one-liner for cards |
| `shortPitch` | varchar(500) | 2–3 sentences |
| `longSummary` | text | full page |
| `askAmount` | numeric | > 0 |
| `equityOffered` | numeric | > 0, ≤ 100 |
| `valuation` | numeric | denormalized: `askAmount / (equityOffered / 100)` |
| `videoUrl` | varchar(500) | pointer to Cloudinary/S3 |
| `pitchDeckUrl` | varchar(500) | pointer |
| `coverImageUrl` | varchar(500) | pointer |
| `sectorSpecificFields` | jsonb | flexible per-sector extras |
| `status` | enum | `draft`, `live`, `closed`, `funded`, `withdrawn` |
| `publishedAt` | timestamp | when it went live |
| `closedAt` | timestamp | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Indexes:**
- `pitch_business_idx` on `(businessId, status)`
- `pitch_live_feed_idx` on `(status, publishedAt)` — investor feed

**Constraints:**
- `pitch_equity_range` check: `0 < equityOffered ≤ 100`
- `pitch_ask_positive` check: `askAmount > 0`

**Why the design:**
- Temporal — separate from `business_profiles` so past pitches are preserved
- `valuation` denormalized — computed on write, queried without math
- Media stored as URLs only — files live in Cloudinary/S3

**Used by:** `offers`, Investor feed, Business profile.

---

### 3.14 `offers`

**Purpose:** An investor's formal bid on a pitch. Self-referencing for counter-offer threads.

**File:** `server/src/models/postgres/offer.model.js`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `pitchId` | uuid FK | → `pitches.id`, cascade delete |
| `investorId` | uuid FK | → `users.id` |
| `businessId` | uuid FK | → `users.id`, denormalized |
| `initiatedById` | uuid FK | → `users.id` — who created this row |
| `parentOfferId` | uuid FK | self-ref for counters, `set null` |
| `amount` | numeric | > 0 |
| `equityRequested` | numeric | > 0, ≤ 100 |
| `valuation` | numeric | denormalized |
| `conditions` | jsonb | custom terms |
| `message` | text | optional note |
| `status` | enum | `pending`, `accepted`, `rejected`, `countered`, `withdrawn`, `expired` |
| `expiresAt` | timestamp | deadline |
| `respondedAt` | timestamp | nullable |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Indexes:**
- `offer_pitch_status_idx` on `(pitchId, status, createdAt)`
- `offer_investor_idx` on `(investorId, createdAt)`
- `offer_business_idx` on `(businessId, status)`
- `offer_parent_idx` on `parentOfferId`

**Constraints:**
- `offer_amount_positive` check
- `offer_equity_range` check

**Why the design:**
- `initiatedById` handles counter-offers — either side can create a row
- `parentOfferId` self-ref creates a negotiation thread
- Immutable after terminal status — no `UPDATE` on accepted/rejected/withdrawn/expired

**Used by:** Pitch detail page, business notifications, future `investments`.

---

## 4. Relationships

### 4.1 Text diagram


### 4.2 Cross-references

| From | To | Cardinality | Delete rule |
|---|---|---|---|
| `refresh_tokens.userId` | `users.id` | N:1 | cascade |
| `business_profiles.userId` | `users.id` | 1:1 | cascade |
| `investor_profiles.userId` | `users.id` | 1:1 | cascade |
| `follows.followerId` | `users.id` | N:1 | cascade |
| `follows.followingId` | `users.id` | N:1 | cascade |
| `notifications.userId` | `users.id` | N:1 | cascade |
| `notifications.actorId` | `users.id` | N:1 | set null |
| `conversations.participantAId` | `users.id` | N:1 | cascade |
| `conversations.participantBId` | `users.id` | N:1 | cascade |
| `messages.conversationId` | `conversations.id` | N:1 | cascade |
| `messages.senderId` | `users.id` | N:1 | cascade |
| `profile_views.viewerId` | `users.id` | N:1 | cascade |
| `profile_views.viewedId` | `users.id` | N:1 | cascade |
| `readiness_scores.businessId` | `users.id` | N:1 | cascade |
| `matches.businessId` | `users.id` | N:1 | cascade |
| `matches.investorId` | `users.id` | N:1 | cascade |
| `profile_edit_history.businessId` | `users.id` | N:1 | cascade |
| `profile_edit_history.editedById` | `users.id` | N:1 | set null |
| `pitches.businessId` | `users.id` | N:1 | cascade |
| `offers.pitchId` | `pitches.id` | N:1 | cascade |
| `offers.investorId` | `users.id` | N:1 | cascade |
| `offers.businessId` | `users.id` | N:1 | cascade |
| `offers.initiatedById` | `users.id` | N:1 | cascade |
| `offers.parentOfferId` | `offers.id` | N:1 (self) | set null |

**Rule of thumb:** cascade for owned data, set null for references to other people's data.

---

## 5. Indexes

### 5.1 By purpose

| Purpose | Tables indexed |
|---|---|
| **Auth / session** | `users.email` |
| **Feed (investor)** | `matches.investorId + matchScore`, `pitches.status + publishedAt` |
| **Feed (business)** | `matches.businessId + matchScore`, `offers.businessId + status` |
| **Chat** | `conversations.participantAId`, `conversations.participantBId`, `messages.conversationId + createdAt` |
| **History** | `profile_views.viewerId + lastViewedAt`, `profile_edit_history.businessId + changedAt` |
| **Notifications** | `notifications.userId + createdAt`, `notifications.userId + isRead` |
| **Benchmark** | `readiness_scores.sector + computedAt` |

### 5.2 Why these exist

- Every hot query has a covering index. No sequential scans on real workloads.
- Composite indexes ordered by selectivity — the most-filtered column first.
- Partial indexes (e.g., unique pending offer) come later if needed.

---

## 6. Enums

All Postgres enums defined via Drizzle `pgEnum`. Changing an enum requires a migration.

| Enum | Values | Used in |
|---|---|---|
| `role` | `business`, `investor`, `admin` | `users` |
| `verification_tier` | `unverified`, `basic`, `verified` | `business_profiles` |
| `notification_type` | 8 values | `notifications` |
| `match_status` | `pending`, `viewed`, `shortlisted`, `passed`, `connected` | `matches` |
| `pitch_status` | `draft`, `live`, `closed`, `funded`, `withdrawn` | `pitches` |
| `offer_status` | `pending`, `accepted`, `rejected`, `countered`, `withdrawn`, `expired` | `offers` |

---

## 7. MongoDB

### 7.1 `Verification`

**Purpose:** Uploaded documents + OCR data + review state. Not part of Postgres — schema varies by document type.

**File:** `server/src/models/mongo/verification.model.js`

| Field | Type | Notes |
|---|---|---|
| `userId` | String | Postgres `users.id` (uuid as string) |
| `documentType` | String | enum: `udyam`, `gst`, `shop_act` |
| `documentUrl` | String | uploaded file location |
| `ocrExtractedData` | Mixed | raw OCR output |
| `status` | String | enum: `pending`, `verified`, `needs_review`, `rejected` |
| `confidenceScore` | Number | drives auto vs manual review |
| `reviewedAt` | Date | |
| `createdAt` | Date | |

**Why Mongo:**
- OCR output varies per document type
- No joins needed — verification only fetched by `userId`
- Schema-less means new document types don't need migrations

**Sync back to Postgres:**
When status flips to `verified`, the service updates `business_profiles.verificationTier`.

---

## 8. Migration Workflow

Migrations live in `server/drizzle/`. Generated by `drizzle-kit`, applied by `drizzle-kit migrate`.

## 9. Rate Limits (Application-Layer)

Not DB constraints — enforced in `rateLimit.service.js` (in-memory).

| Action | Limit | Scope |
|---|---|---|
| `send_message` | 500 / day | per user |
| `new_conversation` | 50 / day | per user |

**Implementation:** in-memory `Map` keyed by `userId:action:YYYY-MM-DD`. Resets daily at UTC midnight. Cleared on server restart (acceptable for MVP — a restart just gives users a fresh quota).

**Migration path:** swap to Redis (`INCR` + `EXPIRE`) when running multiple server instances. Interface (`enforceLimit`, `checkLimit`) stays the same.

### Commands

```bash
cd server

# After editing a *.model.js file:
npm run generate     # creates drizzle/NNNN_name.sql

# Apply to the database:
npm run migrate      # applies pending migrations

# In development, push schema directly without a migration file:
npm run push         # faster, but not versioned