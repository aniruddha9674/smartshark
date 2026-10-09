# Logic

How requests flow through the backend — routes, controllers, services, middleware, and utilities.

**Stack:** Node 22 + Express + Drizzle
**Location:** `server/src/`

Every endpoint follows the same pattern: **route → middleware → controller → service → database**.

See [database.md](./database.md) for table schemas referenced throughout this doc.

---

## 1. Code Layers

Five layers, each with a single responsibility. Files are grouped by layer.

| Layer | Folder | Responsibility |
|---|---|---|
| **Routes** | `src/routes/` | URL → handler mapping |
| **Middleware** | `src/middleware/` | Cross-cutting concerns (auth, validation, errors, upload) |
| **Controllers** | `src/controllers/` | HTTP layer — parse request, call service, send response |
| **Services** | `src/services/` | Business logic, database access |
| **Validators** | `src/validators/` | Request body + query shape (zod schemas) |

### 1.1 Service catalog

Current services and their responsibilities:

| Service | Purpose |
|---|---|
| `auth.service.js` | Register, login, refresh rotation, logout |
| `business.service.js` | Business CRUD, multi-business ownership, audit trail |
| `investorProfile.service.js` | Read/update investor profile |
| `pitch.service.js` | Pitch CRUD + lifecycle (draft → live → closed), events |
| `offer.service.js` | Offer create/counter/accept/reject/withdraw, transactions |
| `investment.service.js` | Portfolio queries, aggregate stats |
| `follow.service.js` | Polymorphic follow (business/investor) + follower lists |
| `conversation.service.js` | Get/create conversations, chat list, unread counts |
| `message.service.js` | Send/list messages, mark read, rate-limit gate |
| `notification.service.js` | Cross-cutting — insert notifications, respecting user prefs |
| `rateLimit.service.js` | In-memory daily rate limiter (per user, per action) |
| `upload.service.js` | Cloudinary stream upload |
| `extraction.service.js` | Gemini Flash document OCR + field extraction |
| `verification.service.js` | Verification pipeline: create → extract → apply → tier |
| `event.service.js` | Append-only event log + recently-viewed queries |
| `feedImpression.service.js` | Batch impression log for ranker training |

Supporting layers:

| Layer | Folder | Responsibility |
|---|---|---|
| **Models** | `src/models/postgres/`, `src/models/mongo/` | Drizzle tables + Mongoose schemas |
| **Events registry** | `src/events/` | Whitelist of allowed event types + validation |
| **Utils** | `src/utils/` | Pure helpers (hashing, tokens, errors, retry, rate limiter) |
| **Config** | `src/config/` | DB connections, Cloudinary, env validation, Swagger |

### The one rule

> **Controllers never touch the DB directly. Services never touch `req`/`res`.**

This separation means:
- Services are testable without HTTP
- Controllers stay thin (~10 lines each)
- Business logic has one home

---

## 2. Request Lifecycle

Every HTTP request goes through this pipeline:

```
Client request
    │
    ▼
┌─────────────────────────────────────────────┐
│ 1. Express router matches path + method     │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 2. Middleware chain (in order)              │
│    - requireAuth        ← JWT check         │
│    - validate(schema)   ← body validation   │
│    - upload.single()    ← Multer (uploads)  │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 3. Controller handler                       │
│    - reads req.body, req.user, req.file     │
│    - calls service function                 │
│    - sends response                         │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 4. Service function                         │
│    - business rules                         │
│    - Drizzle DB queries + Mongoose          │
│    - returns plain data or throws ApiError  │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 5. Response sent to client                  │
│    or errorHandler returns { error }        │
└─────────────────────────────────────────────┘
```

If any layer throws, `errorHandler` catches it and returns a structured JSON error. **No controller has a try/catch.**

**Note:** `requireRole` was removed in the multi-business refactor. Authorization is now capability-based — services check ownership (e.g., "does this business belong to this user?") rather than role.

---

## 3. Routes

All routes are mounted in `src/app.js`. Each router file lives in `src/routes/`.

### 3.1 Route registration

```js
// src/app.js
app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/investor", investorRoutes);
app.use("/api/pitches", pitchRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/investments", investmentRoutes);
app.use("/api/follows", followRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/verifications", verificationRoutes);
```

### 3.2 All routes

Every prefix mounts a router. All routes require a valid access token unless marked `public`.

**File:** `src/routes/auth.routes.js` — 5 endpoints
| Method | Path | Middleware | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | `validate(registerSchema)` | public |
| POST | `/api/auth/login` | `validate(loginSchema)` | public |
| POST | `/api/auth/refresh` | — | cookie |
| POST | `/api/auth/logout` | — | cookie |
| GET | `/api/auth/me` | `requireAuth` | Bearer |

**File:** `src/routes/business.routes.js` — 6 endpoints, `router.use(requireAuth)`
| Method | Path | Notes |
|---|---|---|
| GET | `/api/businesses` | List businesses I own |
| POST | `/api/businesses` | Create a new business |
| GET | `/api/businesses/:id` | Get one business (ownership checked) |
| PATCH | `/api/businesses/:id` | Update (writes `profile_edit_history`) |
| POST | `/api/businesses/:id/complete` | Mark profile complete |
| GET | `/api/businesses/:id/history` | Profile edit history |

**File:** `src/routes/investor.routes.js` — 4 endpoints, `router.use(requireAuth)`
| Method | Path |
|---|---|
| POST | `/api/investor/me` |
| GET | `/api/investor/me` |
| PATCH | `/api/investor/me` |
| POST | `/api/investor/complete` |

**File:** `src/routes/pitch.routes.js` — 8 endpoints, mixed auth
| Method | Path | Notes |
|---|---|---|
| GET | `/api/pitches` | Investor feed — live only, filter by stage/revenue/businessId |
| POST | `/api/pitches` | Create draft — `businessId` in body |
| GET | `/api/pitches/me` | `?businessId=` required |
| GET | `/api/pitches/recently-viewed` | Powered by `events` table |
| GET | `/api/pitches/:id` | Owner sees any status; others see only live |
| PATCH | `/api/pitches/:id` | Draft only |
| DELETE | `/api/pitches/:id` | Draft only |
| POST | `/api/pitches/:id/publish` | Draft → live |
| POST | `/api/pitches/:id/close` | Live → closed |

**File:** `src/routes/offer.routes.js` — 9 endpoints, `router.use(requireAuth)`
| Method | Path | Notes |
|---|---|---|
| POST | `/api/offers` | Create offer on live pitch (investor) |
| GET | `/api/offers/me` | My offers (investor) |
| GET | `/api/offers/received` | Offers on my business (owner) |
| GET | `/api/offers/:id` | One offer |
| GET | `/api/offers/:id/thread` | Full counter thread |
| POST | `/api/offers/:id/counter` | Counter (either side) |
| POST | `/api/offers/:id/accept` | Accept (business owner) — atomic transaction |
| POST | `/api/offers/:id/reject` | Reject (business owner) |
| POST | `/api/offers/:id/withdraw` | Withdraw (original investor) |

**File:** `src/routes/investment.routes.js` — 4 endpoints, `router.use(requireAuth)`
| Method | Path | Notes |
|---|---|---|
| GET | `/api/investments/me` | My portfolio (investor) |
| GET | `/api/investments/summary` | Aggregate stats |
| GET | `/api/investments/received` | Funding received (business owner) |
| GET | `/api/investments/:id` | One investment |

**File:** `src/routes/follow.routes.js` — 9 endpoints, `router.use(requireAuth)`
| Method | Path |
|---|---|
| GET | `/api/follows/following` |
| GET | `/api/follows/investor/followers` |
| GET | `/api/follows/status/business/:id` |
| GET | `/api/follows/status/investor/:id` |
| POST | `/api/follows/business/:id` |
| DELETE | `/api/follows/business/:id` |
| GET | `/api/follows/business/:id/followers` |
| POST | `/api/follows/investor/:id` |
| DELETE | `/api/follows/investor/:id` |

**File:** `src/routes/conversation.routes.js` — 7 endpoints, `router.use(requireAuth)`
| Method | Path |
|---|---|
| GET | `/api/conversations/unread-count` |
| GET | `/api/conversations` |
| POST | `/api/conversations` |
| GET | `/api/conversations/:id` |
| GET | `/api/conversations/:id/messages` |
| POST | `/api/conversations/:id/messages` |
| POST | `/api/conversations/:id/read` |

**File:** `src/routes/upload.routes.js` — 1 endpoint, `router.use(requireAuth)`
| Method | Path | Notes |
|---|---|---|
| POST | `/api/uploads` | Multipart form, field name `file`. Returns `{ url, publicId }` |

**File:** `src/routes/verification.routes.js` — 4 endpoints, `router.use(requireAuth)`
| Method | Path | Notes |
|---|---|---|
| POST | `/api/verifications` | Create verification + run OCR extraction |
| GET | `/api/verifications/me` | List my verifications (`?businessId=` optional) |
| POST | `/api/verifications/:id/apply` | Merge extracted fields into business profile |
| GET | `/api/verifications/:id` | One verification |

**Total: 57 endpoints across 10 routers.**

### 3.3 Swagger UI

Interactive API docs served at `/docs` via `swagger-ui-express`. Spec built from JSDoc `@openapi` comments in each route file (`swagger-jsdoc`).

**Config:** `src/config/swagger.js`
**Shared schemas:** `User`, `ErrorResponse`, `Business`, `BusinessProfile`, `ProfileEdit`, `InvestorProfile`, `Pitch`, `PitchCreate`, `PitchUpdate`, `Offer`, `OfferCreate`, `OfferCounter`, `Investment`, `FollowedUser`, `Pagination`, `ConversationSummary`, `Conversation`, `ConversationWithUser`, `Message`

**Notes:**
- `/refresh` and `/logout` read the refresh token from an httpOnly cookie — no `requireAuth` needed
- `/me` requires a valid access token — the JWT payload seeds `req.user`
- `/api/uploads` accepts multipart form data; Swagger UI supports the file picker

### 3.4 Middleware order

Middleware runs **left to right** as written in the route:

```js
router.post("/register",
  validate(registerSchema),      // 1st — body must be valid
  asyncHandler(authController.register)
);
```

For protected routes:

```js
router.get("/me",
  requireAuth,                    // 1st — sets req.user
  asyncHandler(authController.me) // 2nd — uses req.user
);
```

For file uploads:

```js
router.post("/",
  requireAuth,                    // 1st — must be logged in
  upload.single("file"),          // 2nd — parse multipart, validate file
  asyncHandler(uploadController.uploadFile)
);
```

**Order matters.** `upload.single()` requires `req.user` for the folder path, so `requireAuth` runs first.

**Why no `requireRole`?** Authorization is capability-based now. A user can own businesses and be an investor at the same time. Services check ownership ("does this business belong to this user?") instead of role. See §5 for the pattern.

---

## 4. Controllers

**Folder:** `src/controllers/`

Controllers are thin HTTP wrappers. They:
- Read from `req` (body, params, cookies, `req.user`, `req.file`)
- Call a service
- Send a response

They do **not** contain business logic, and they do **not** import `db`.

### 4.1 Controller catalog

| File | Exports | Notes |
|---|---|---|
| `auth.controller.js` | `register`, `login`, `refresh`, `logout`, `me` | Sets/clears refresh cookie |
| `business.controller.js` | `create`, `listMine`, `getOne`, `update`, `complete`, `history` | Multi-business |
| `investor.controller.js` | `create`, `getMine`, `update`, `complete` | 1:1 with user |
| `pitch.controller.js` | `create`, `listMine`, `getOne`, `getRecentlyViewed`, `update`, `publish`, `close`, `remove`, `listLive` | 9 exports |
| `offer.controller.js` | `create`, `listMine`, `listReceived`, `getOne`, `getThread`, `counter`, `accept`, `reject`, `withdraw` | 9 exports |
| `investment.controller.js` | `listMine`, `summary`, `listReceived`, `getOne` | 4 exports |
| `follow.controller.js` | `followBusiness`, `unfollowBusiness`, `followInvestor`, `unfollowInvestor`, `getFollowing`, `getBusinessFollowers`, `getInvestorFollowers`, `getBusinessStatus`, `getInvestorStatus` | 9 exports |
| `conversation.controller.js` | `list`, `start`, `getOne`, `unreadCount` | |
| `message.controller.js` | `list`, `send`, `markRead` | |
| `upload.controller.js` | `uploadFile` | Reads `req.file`, calls `uploadService` |
| `verification.controller.js` | `create`, `listMine`, `getOne`, `apply` | Pipeline entry + apply |

**Every controller export is wrapped in `asyncHandler` at the route layer.** Controllers can `throw` synchronously — `asyncHandler` catches and forwards.

### 4.2 The ownership pattern

Instead of `requireRole`, each service asserts ownership:

```js
// src/services/business.service.js
const assertBusinessOwnership = async (businessId, userId) => {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }
  return business;
};
```

Called at the start of every business-scoped operation: pitch create, offer accept, verification apply, business update.

**Why this replaced `requireRole`:**
- A user can own businesses AND be an investor
- Role is a UI concern, not a permissions concern
- Ownership is the real check — "does this business belong to this user?"

---

## 5. Services

**Folder:** `src/services/`

Services hold business logic. They:
- Receive plain data (not `req`/`res`)
- Apply rules
- Query the DB via `db` or Mongoose models
- Throw `ApiError` for known failures

They are the **only** layer that imports from `models/postgres/index.js` or `models/mongo/`.

### 5.1 Auth service

**File:** `src/services/auth.service.js`

| Function | Purpose |
|---|---|
| `registerUser({ name, email, password, role })` | Email uniqueness, hash password, insert user, issue tokens |
| `loginUser({ email, password }, userAgent)` | Find, verify password, check `isActive`, issue tokens |
| `refreshSession(rawRefreshToken, userAgent)` | Look up hashed token, verify not revoked/expired, rotate |
| `logoutUser(rawRefreshToken)` | Mark token row as revoked |

**Key rules:**
- Email uniqueness before insert (DB unique constraint also enforces)
- Same error for "user not found" and "wrong password" — no enumeration
- Refresh rotation: old token revoked, new one issued on every refresh
- `isActive` checked on login and refresh

### 5.2 Business service

**File:** `src/services/business.service.js`

| Function | Purpose |
|---|---|
| `createBusiness(userId, data)` | Insert new business owned by user |
| `listMyBusinesses(userId)` | All businesses owned by user |
| `getBusiness(id, userId)` | Fetch + ownership check |
| `updateBusiness(id, userId, data)` | Update + write `profile_edit_history` for changed fields |
| `completeBusiness(id, userId)` | Validate required fields, set `isProfileComplete = true` |
| `getHistory(id, userId)` | Read `profile_edit_history` rows |

**Key rules:**
- Ownership asserted on every read/write
- Field-level audit trail — one history row per changed field
- `completeBusiness` validates required fields before setting the flag

### 5.3 Pitch service

**File:** `src/services/pitch.service.js`

| Function | Purpose |
|---|---|
| `createPitch(businessId, userId, data)` | Insert draft (ownership + schema validation) |
| `getMyPitches(businessId, userId)` | All pitches for a business (ownership) |
| `getPitch(id, userId)` | Owner sees any status; others see only live. Logs `pitch_viewed` event for non-owner |
| `updatePitch(id, userId, data)` | Draft only. Recomputes `valuation` when ask/equity changes |
| `publishPitch(id, userId)` | Draft → live. Requires profile complete + valid fields + no other live pitch. Logs `pitch_published` |
| `closePitch(id, userId)` | Live → closed. Logs `pitch_closed` |
| `deletePitch(id, userId)` | Draft only |
| `listLivePitches({ stage, revenueRange, businessId, limit, offset })` | Investor feed |

**Key rules:**
- Only one live pitch per business (service check + could be DB constraint later)
- `valuation` denormalized — computed on write
- `eventService.log()` called after state changes (never inside a transaction)

### 5.4 Offer service

**File:** `src/services/offer.service.js`

The most complex service — counter-offer threads + atomic acceptance.

| Function | Purpose |
|---|---|
| `createOffer(investorId, data)` | Insert offer on live pitch. Logs `offer_created` |
| `counterOffer(offerId, userId, data)` | Either side counters. `assertCanCounter` prevents countering own offer |
| `acceptOffer(offerId, userId)` | **Atomic transaction**: accept + reject siblings + fund pitch + create investment + open conversation |
| `rejectOffer(offerId, userId)` | Mark rejected |
| `withdrawOffer(offerId, userId)` | Original investor only |
| `getThread(offerId)` | Walk `parentOfferId` chain |
| `listMyOffers(investorId)` | Investor's outgoing offers |
| `listReceivedOffers(businessId, userId)` | Owner's incoming offers |

**Key rules:**
- **Counter alternation:** `if (offer.initiatedById === userId) throw` — turns alternate naturally
- **Lazy expiry:** every action checks `expiresAt` and marks expired if past due. No cron.
- **Atomic accept:** all 5 operations in one `db.transaction()`. Mongoose + events outside.
- **One pending offer per investor per pitch** (enforced via DB constraint or service check)

### 5.5 Verification service

**File:** `src/services/verification.service.js`

The bridge between Mongo `Verification` and Postgres `businesses.verificationTier`.

| Function | Purpose |
|---|---|
| `createVerification({ userId, businessId, documentType, documentUrl, publicId })` | Ownership check → Mongo insert → call `extractFromDocument` → set status/confidence → log events |
| `listMyVerifications(userId, { businessId })` | Query Mongo by user |
| `getVerification(id, userId)` | Ownership check |
| `applyToBusinessProfile(verificationId, userId, confirmedFields)` | Merge OCR + user-confirmed fields into `businesses`. Postgres transaction for `businesses` + `profile_edit_history`. Mongo update for `appliedFields`. Then compute tier and update `businesses.verificationTier` |

**Key rules:**
- **OCR never writes directly to `businesses`.** User confirms first.
- **Postgres transaction** wraps `businesses` update + `profile_edit_history` insert. Mongoose calls are outside.
- **Conflict detection:** if a field already has a different value, don't overwrite — add to `conflicts` array.
- **`computeVerificationTier`** reads all verifications for the business: `unverified` → `basic` (1+ verified) → `verified` (2+ with matching `companyName`).
- **Post-transaction logging:** events fire after the transaction. Failures don't roll back the operation.

### 5.6 Extraction service

**File:** `src/services/extraction.service.js`

| Function | Purpose |
|---|---|
| `extractFromDocument(documentUrl, documentType)` | Fetch image → base64 → call Gemini Flash → parse JSON → return `{ fields, overallConfidence, raw, wrongDocument }` |

**Key rules:**
- **Rate limit:** `checkRateLimit("gemini", 14, 60_000)` — protects free tier 15 RPM
- **Retry:** `withRetry()` wraps the Gemini call with exponential backoff + jitter
- **Strict JSON:** Gemini is configured with `responseMimeType: "application/json"`, `temperature: 0.1`
- **Per-document spec:** `DOCUMENT_SPECS` maps each doc type to expected fields with descriptions
- **Wrong document detection:** if the image isn't the requested doc type, returns `{ error: "wrong_document" }` and the caller marks status `rejected`

### 5.7 Upload service

**File:** `src/services/upload.service.js`

| Function | Purpose |
|---|---|
| `uploadToCloudinary(buffer, folder, originalName)` | Promise-wrapped `upload_stream()` call. Returns `{ url, publicId }` |

**Key rules:**
- Uses `upload_stream()` — memory-efficient for buffers
- `resource_type: "auto"` — Cloudinary detects image vs PDF
- Sanitized `public_id` — strips unsafe characters, caps length

### 5.8 Event service

**File:** `src/services/event.service.js`

| Function | Purpose |
|---|---|
| `log(event)` | Fire-and-forget. Validates against registry. Records unknown types to `rejected_events`. Never throws. |
| `logStrict(event)` | Throws on failure. Used in tests. |
| `listMine(userId, { eventType, limit, offset })` | My recent events |
| `listForEntity(entityType, entityId, { limit, offset })` | Events for one entity |
| `countSince(eventType, since)` | Aggregations |
| `getRecentlyViewedPitches(userId, limit)` | Deduped by `entityId`, ordered by recency |

**Key rules:**
- **Whitelist enforced:** `validateEventType()` reads `src/events/registry.js`. Unknown types → `rejected_events` table.
- **Fire-and-forget:** `log()` swallows its own errors. Never fails the parent operation.
- **Never inside a transaction:** PGlite (single connection) deadlocks if `log()` is called inside `db.transaction()`. Always post-transaction.
- **`entityId` is varchar:** holds UUIDs (Postgres entities) AND Mongo ObjectIds. Not a foreign key.

### 5.9 Feed impression service

**File:** `src/services/feedImpression.service.js`

| Function | Purpose |
|---|---|
| `logBatch(userId, impressions)` | Batch insert — one row per (user, pitch, position) |
| `listForPitch(pitchId, { limit, offset })` | Analytics |
| `listForUser(userId, { limit, offset })` | ML training |
| `countForPitch(pitchId)` | Aggregation |

**Key rules:**
- **Batch insert only** — not per-impression. High volume.
- **Position-bias signal** — `position`, `score`, `modelVersion` all stored.
- Fire-and-forget, same as events.

### 5.10 Notification service

**File:** `src/services/notification.service.js`

Cross-cutting. Called by follow, message, offer, verification services.

| Function | Purpose |
|---|---|
| `createNotification({ userId, actorId, type, title, body, metadata })` | Insert row, respecting recipient's `notify*` prefs |

**Key rules:**
- Catches its own errors — a failed notification never fails the parent operation
- Respects `users.notifyNewMatch`, `notifyNewMessage`, etc.
- Called post-transaction, same as events

### 5.11 Rate limit service

**File:** `src/services/rateLimit.service.js`

| Function | Purpose |
|---|---|
| `enforceLimit(userId, action, limit)` | Throws `ApiError.tooManyRequests` if over |
| `checkLimit(userId, action, limit)` | Read-only |
| `_resetAll()` | Test helper |

**Current limits:** `send_message` (500/day), `new_conversation` (50/day).

### 5.12 Conversation service

**File:** `src/services/conversation.service.js`

| Function | Purpose |
|---|---|
| `getOrCreateConversation(userA, userB)` | Sorts UUIDs, upserts ordered pair |
| `listMyConversations(userId)` | Sorted by `lastMessageAt` desc |
| `getConversation(id, userId)` | Ownership check via participation |
| `unreadCount(userId)` | Total unread across all threads |

### 5.13 Message service

**File:** `src/services/message.service.js`

| Function | Purpose |
|---|---|
| `sendMessage(conversationId, senderId, body)` | Rate limit → insert → bump `lastMessageAt` → notify recipient → log event |
| `listMessages(conversationId, userId, { limit, offset })` | Thread load |
| `markRead(conversationId, userId)` | Marks all messages from the other participant as read |

---

## 6. Middleware

**Folder:** `src/middleware/`

Middleware runs before the controller. Each function receives `(req, res, next)`.

### 6.1 `auth.middleware.js`

**Export:** `requireAuth`

| Middleware | Behavior |
|---|---|
| `requireAuth` | Reads `Authorization: Bearer <token>`. Verifies JWT. Sets `req.user = { id, role }`. Calls `next(ApiError 401)` on failure. |

**Why `requireRole` was removed:** The multi-business refactor removed hard role gates. Authorization is now capability-based — services check ownership. A user can be both a business owner and an investor. Role remains in the JWT for UI routing decisions but doesn't gate routes.

### 6.2 `validate.middleware.js`

**Export:** `validate(schema, source = "body")`

Factory that returns a middleware. Runs `schema.safeParse(req[source])`:
- Success → replaces `req[source]` with parsed data (strips unknown fields)
- Failure → `next(ApiError.badRequest("Validation failed", details))`

**`source` param:** defaults to `"body"`, but can be `"query"` or `"params"`. Used in pitch list (`businessId` query) and follow list pagination.

### 6.3 `upload.middleware.js`

**Export:** `upload` (Multer instance)

- `storage: multer.memoryStorage()` — buffer in RAM, streamed to Cloudinary
- `limits: { fileSize: 10 * 1024 * 1024, files: 1 }` — 10 MB, one file
- `fileFilter` — only JPEG, PNG, WebP, PDF (both MIME type and extension checked)

**Why memory storage:** No temp files on disk. The buffer goes straight to Cloudinary's `upload_stream()`.

### 6.4 `error.middleware.js`

**Export:** `errorHandler(err, req, res, next)`

The **last** middleware registered in `app.js`. Handles:

1. **Multer errors** — `LIMIT_FILE_SIZE` → 413, `LIMIT_UNEXPECTED_FILE` → 400
2. **File type rejection** — `"Invalid file type"` message → 415
3. **`ApiError`** → returns `{ error, details? }` with the error's status code
4. **Unknown errors** → logs to console, returns 500 (with stack in dev)

**Why:** Controllers use `asyncHandler` to forward errors here. No controller writes error responses itself.

---

## 7. Validators

**Folder:** `src/validators/`

Zod schemas. One file per domain.

| File | Schemas | Notes |
|---|---|---|
| `auth.validator.js` | `registerSchema`, `loginSchema` | Email lowercased, role limited to business/investor |
| `business.validator.js` | `createBusinessSchema`, `updateBusinessSchema` | `companyName` min 2 chars |
| `investorProfile.validator.js` | `updateInvestorProfileSchema` | |
| `pitch.validator.js` | `createPitchSchema` (includes `businessId`), `updatePitchSchema` | |
| `offer.validator.js` | `createOfferSchema`, `counterOfferSchema` | |
| `follow.validator.js` | `paginationQuerySchema` | |
| `conversation.validator.js` | `startConversationSchema`, `sendMessageSchema` | |
| `upload.validator.js` | (none — Multer handles file validation) | |
| `verification.validator.js` | `createVerificationSchema`, `listVerificationsQuerySchema`, `applyVerificationSchema` | `documentType` enum: udyam/gst/shop_act |

**Notes:**
- Email lowercased at validation time → `Alice@X.com` matches `alice@x.com`
- `role: "admin"` is **rejected** — admins are seeded, not self-signed-up
- Unknown extra fields in the body are **stripped** (zod default)

---

## 8. Utils

**Folder:** `src/utils/`

Pure functions and helpers. No DB, no HTTP.

### 8.1 `apiError.js`

**Export:** `ApiError` class

```js
new ApiError(statusCode, message, details)
```

Static factories:
- `ApiError.badRequest(msg, details)` → 400
- `ApiError.unauthorized(msg?)` → 401
- `ApiError.forbidden(msg?)` → 403
- `ApiError.notFound(msg?)` → 404
- `ApiError.conflict(msg)` → 409
- `ApiError.tooManyRequests(msg?)` → 429

### 8.2 `asyncHandler.js`

**Export:** `asyncHandler(fn)`

```js
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

### 8.3 `password.js`

**Exports:** `hashPassword(plain)`, `verifyPassword(plain, hash)`

- `hashPassword` — bcrypt, 12 salt rounds
- `verifyPassword` — constant-time compare

### 8.4 `tokens.js`

**Exports:**
- `signAccessToken({ id, role })` — JWT, 15-min TTL
- `verifyAccessToken(token)` — throws on invalid/expired
- `generateRefreshToken()` — returns `{ raw, hash }`
- `hashRefreshToken(raw)` — SHA256, deterministic

### 8.5 `retry.js`

**Exports:**
- `withRetry(fn, { attempts, baseDelayMs, maxDelayMs, shouldRetry })` — exponential backoff + jitter
- `isTransientError(err)` — matches 429, timeout, 5xx, ECONNRESET

**Why:** Gemini occasionally returns 429 or times out. Retry makes extraction resilient without changing the calling code.

### 8.6 `rateLimiter.js`

**Exports:**
- `checkRateLimit(key, maxRequests, windowMs)` — sliding window, throws 429 with `retryAfterMs`
- `_resetRateLimiter()` — test helper

**Why:** Gemini free tier = 15 RPM. Set the limit to 14 to leave headroom. In-memory; swap to Redis when multi-instance.

---

## 9. Events Registry

**Folder:** `src/events/`

### 9.1 `registry.js`

**Export:** `ALLOWED_EVENTS` object + `validateEventType()` + `validateMetadata()`

Every event type must be registered. Each entry has:
- `version` — bump when metadata shape changes
- `requiredFields` — array of strings
- `purpose` — why it exists (documentation + future review)
- `retention` — `"forever"` or a period

**Registered event types:**
- Pitch: `pitch_viewed`, `pitch_published`, `pitch_closed`, `pitch_shortlisted`, `pitch_dismissed`
- Offer: `offer_created`, `offer_accepted`, `offer_rejected`, `offer_countered`
- Follow: `follow_created`
- Message: `message_sent`
- Auth: `user_registered`
- Verification: `verification_started`, `verification_extracted`, `verification_applied`, `verification_tier_changed`, `verification_failed`

**Why a registry:** Unknown event types are rejected. Attempts land in `rejected_events` — the system tells you which events are needed, without a code change.

---

## 10. Error Handling

Errors flow through one path:

```
Service throws ApiError
    │
    ▼
asyncHandler catches → next(err)
    │
    ▼
errorHandler formats response
    │
    ▼
{ error: "message", details?: {} }
```

### 10.1 Error response shapes

| Status | Body |
|---|---|
| 400 | `{ error: "Validation failed", details: {...} }` |
| 401 | `{ error: "No token provided" }` or `{ error: "Invalid credentials" }` |
| 403 | `{ error: "You do not own this business" }` |
| 404 | `{ error: "Not found" }` |
| 409 | `{ error: "Email already in use" }` |
| 413 | `{ error: "File too large. Maximum allowed size is 10 MB." }` |
| 415 | `{ error: "Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed." }` |
| 429 | `{ error: "Rate limit exceeded..." }` |
| 500 | `{ error: "Internal server error" }` (+ stack in dev) |

### 10.2 Logging

- Unknown errors: `console.error` in `errorHandler` — replace with structured logger later
- No logging for expected `ApiError`s (they're not bugs)
- `eventService.log()` catches its own errors and logs with `[event.service.log]` prefix
- `feedImpression.logBatch()` same pattern

---

## 11. End-to-End Example: `POST /api/verifications`

Trace of the most complex request in the system — document upload → OCR → verification record.

**Request:**
```http
POST /api/verifications
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json

{
  "businessId": "96e9e215-36ea-4d17-ac4f-0f11edd8c65a",
  "documentType": "udyam",
  "documentUrl": "https://res.cloudinary.com/diohvxzaq/image/upload/v.../udyam.png",
  "publicId": "verification-docs/user-id/..."
}
```

**Step 1 — Express router**
`app.js` → `app.use("/api/verifications", verificationRoutes)` → matches `POST /`.

**Step 2 — Middleware chain**
- `requireAuth` — verifies JWT, sets `req.user = { id, role }`
- `validate(createVerificationSchema)` — Zod parses body, confirms `documentType` is in enum, `documentUrl` is a URL

**Step 3 — Controller**
`verificationController.create(req, res)`:
- Reads `req.body` + `req.user.id`
- Calls `verificationService.createVerification({ userId, ...req.body })`

**Step 4 — Service (`createVerification`)**
1. `assertBusinessOwnership(businessId, userId)` — checks `businesses.ownerId === userId`
2. `Verification.create({ userId, businessId, documentType, documentUrl, status: "pending" })` — Mongo insert
3. `eventService.log({ eventType: "verification_started", ... })` — fire-and-forget
4. Calls `extractFromDocument(documentUrl, documentType)`:
   - Fetch image → base64
   - `checkRateLimit("gemini", 14, 60_000)`
   - `withRetry(() => model.generateContent([...]), { attempts: 3, shouldRetry: isTransientError })`
   - Parse strict JSON → compute mean confidence
5. Based on result:
   - `wrongDocument: true` → status `rejected`, log `verification_failed`
   - `confidence >= 0.7` → status `verified`, log `verification_extracted`
   - else → status `needs_review`, log `verification_extracted`
6. `verification.save()` — Mongo update

**Step 5 — Response**
```http
HTTP/1.1 201 Created

{
  "verification": {
    "_id": "6ac79c7ec7ef622a494bdc8e",
    "userId": "c4e0f094-...",
    "businessId": "96e9e215-...",
    "documentType": "udyam",
    "status": "verified",
    "confidenceScore": 0.95,
    "ocrExtractedData": {
      "enterprise_name": { "value": "Acme Pvt Ltd", "confidence": 0.95 },
      "udyam_registration_number": { "value": "UDYAM-XX-00-0000000", "confidence": 0.97 }
    },
    "createdAt": "2026-10-08T..."
  }
}
```

**Files touched:**
1. `src/app.js`
2. `src/routes/verification.routes.js`
3. `src/middleware/auth.middleware.js`
4. `src/middleware/validate.middleware.js`
5. `src/validators/verification.validator.js`
6. `src/controllers/verification.controller.js`
7. `src/services/verification.service.js`
8. `src/services/extraction.service.js`
9. `src/services/event.service.js`
10. `src/utils/retry.js`
11. `src/utils/rateLimiter.js`
12. `src/models/mongo/verification.model.js`
13. `src/models/postgres/business.model.js`
14. `src/events/registry.js`

Fourteen files, one request. That's the verification pipeline.

**Note:** `applyToBusinessProfile` (the apply step) touches even more — it uses a Postgres transaction across `businesses` + `profile_edit_history`, then updates Mongo, then computes tier from all verifications, then updates `businesses.verificationTier`, then logs two more events. See §5.5.

---

## 12. Testing

Tests mirror the layer structure.

**Folder:** `server/tests/`

| Test file | Layer | Tests |
|---|---|---|
| `tests/utils/password.test.js` | Utils | 5 |
| `tests/utils/tokens.test.js` | Utils | 12 |
| `tests/utils/retry.test.js` | Utils | 7 |
| `tests/utils/rateLimiter.test.js` | Utils | 4 |
| `tests/utils/auth.validator.test.js` | Validators | 14 |
| `tests/validators/businessProfile.validator.test.js` | Validators | 12 |
| `tests/validators/investorProfile.validator.test.js` | Validators | 13 |
| `tests/validators/pitch.validator.test.js` | Validators | 28 |
| `tests/validators/offer.validator.test.js` | Validators | 23 |
| `tests/middleware/requireAuth.test.js` | Middleware | 9 |
| `tests/auth/register.test.js` | Integration | 10 |
| `tests/auth/login.test.js` | Integration | 10 |
| `tests/auth/refresh.test.js` | Integration | 14 |
| `tests/health.test.js` | Smoke | 1 |
| `tests/business/profile.test.js` | Integration | ~16 |
| `tests/investor/profile.test.js` | Integration | ~12 |
| `tests/pitches/pitch.test.js` | Integration | 33 |
| `tests/pitches/recently-viewed.test.js` | Integration | 3 |
| `tests/offers/offer.test.js` | Integration | ~25 |
| `tests/investments/investment.test.js` | Integration | ~10 |
| `tests/follows/follow.test.js` | Integration | ~15 |
| `tests/conversations/conversation.test.js` | Integration | ~11 |
| `tests/conversations/message.test.js` | Integration | ~11 |
| `tests/uploads/upload.test.js` | Integration | 5 |
| `tests/verifications/verification.test.js` | Integration | 5 |
| `tests/verifications/apply.test.js` | Integration | 6 |
| `tests/services/rateLimit.service.test.js` | Service | 8 |
| `tests/services/businessProfile.service.test.js` | Service | 20 |
| `tests/services/investorProfile.service.test.js` | Service | 12 |
| `tests/services/pitch.service.test.js` | Service | 37 |
| `tests/services/offer.service.test.js` | Service | 49 |
| `tests/services/follow.service.test.js` | Service | 24 |
| `tests/services/conversation.service.test.js` | Service | 18 |
| `tests/services/message.service.test.js` | Service | 15 |
| `tests/services/event.service.test.js` | Service | 11 |
| `tests/services/event-integration.test.js` | Integration | 3 |
| `tests/services/feedImpression.service.test.js` | Service | 4 |
| `tests/services/rejectedEvent.test.js` | Service | 4 |

**Total:** ~524 tests. Run with `npm test`. Runs on every push via GitHub Actions.

**Approach:**
- **Unit tests** for pure logic (utils, validators, middleware) — fast, no DB
- **Integration tests** for endpoints — Supertest hits the app
- **PGlite** for Postgres in tests — in-memory WASM, no Docker
- **`mongodb-memory-server`** for Mongo in tests — real Mongoose behavior, no external service
- Every endpoint test covers the happy path + error paths (401, 400, 403, 404, 409)

**Test harness:** `tests/setup.js` loads all `drizzle/*.sql` migrations into PGlite and spins up an in-memory MongoDB. `vitest.config.js` sets env defaults so CI doesn't need real Cloudinary/Gemini credentials — services that would call external APIs are mocked per test.

---

## 13. Configuration

### 13.1 Environment

**File:** `src/config/env.js`

Loads `dotenv`, validates required vars, exports a typed `env` object.

**Required vars:**
- `PORT`
- `POSTGRES_URI`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `GEMINI_API_KEY`

**Rule:** Every file imports from `env.js`. Never `process.env` directly. In ESM, all imports hoist — dotenv must run inside a module that others import, not at the top of `server.js`.

### 13.2 Database connections

**File:** `src/config/db.postgres.js` — pool via `pg`, forced IPv4, idle timeout 30s
**File:** `src/config/db.mongo.js` — exports `connectMongo()` (called lazily by `server.js`, not at import)

**Why lazy Mongo:** Tests import `app.js` without connecting to Atlas. `tests/setup.js` owns the test connection via `mongodb-memory-server`.

### 13.3 Cloudinary

**File:** `src/config/cloudinary.js`

Validates `CLOUDINARY_*` env vars at import, configures the SDK, exports the configured client. Throws at startup if any are missing — fails loudly, not silently.

### 13.4 Swagger

**File:** `src/config/swagger.js`

Builds the OpenAPI spec from `@openapi` JSDoc blocks in `src/routes/*.js`. Serves UI at `/docs`.

---

## 14. Anchor Links for Cross-Referencing

From `overview.md`, link as:

```markdown
See [logic.md §3 Routes](./logic.md#3-routes)
See [logic.md §4 Controllers](./logic.md#4-controllers)
See [logic.md §5 Services](./logic.md#5-services)
See [logic.md §6 Middleware](./logic.md#6-middleware)
See [logic.md §11 End-to-End Example](./logic.md#11-end-to-end-example-post-apiverifications)
```

---

*Last updated: 2026-10-08*

---

## What changed vs the previous version

| Area | Change |
|---|---|
| **Services** | 8 → 16 — added `business`, `offer`, `investment`, `upload`, `extraction`, `verification`, `event`, `feedImpression` |
| **Controllers** | 3 → 11 — added all business domain + uploads + verifications |
| **Routes** | 32 → 57 endpoints across 10 routers |
| **`requireRole`** | Removed entirely. Authorization is ownership-based in services. |
| **`business_profiles` → `businesses`** | Multi-business model — `POST /api/businesses` creates, ownership is `ownerId` not `userId` |
| **Follow routes** | 5 → 9, polymorphic (business/investor targets) |
| **New domains** | Offers (9 endpoints), Investments (4), Uploads (1), Verifications (4) |
| **Events registry** | New `src/events/` folder — whitelist + validation |
| **Utils** | Added `retry.js`, `rateLimiter.js` |
| **Middleware** | Added `upload.middleware.js` (Multer) |
| **Error handler** | Now also catches Multer errors (413, 415) |
| **Tests** | 82 → ~524 across 39 files |
| **Test harness** | Added `mongodb-memory-server` — real Mongo behavior without external dependency |
| **Env vars** | Added `CLOUDINARY_*` and `GEMINI_API_KEY` |
| **§11 trace** | Replaced the register trace with the verification pipeline — the most complex request in the system |
