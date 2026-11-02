# Logic

How a request moves through the backend.

Stack: Node 22, Express, Drizzle, Mongoose. Everything lives under `server/src/`.

Every endpoint follows the same path: route → middleware → controller → service → database. Once you understand one endpoint you understand them all.

Table schemas are in [database.md](./database.md).

## 1. The layers

Five folders, each with one job.

Routes map URLs to handler functions. They also attach the middleware that runs before the handler.

Middleware handles cross-cutting concerns — auth, body validation, file uploads, error formatting. Each is a function of `(req, res, next)`.

Controllers are the HTTP boundary. They read from `req`, call a service, and send a response. Controllers never import the database client.

Services hold the actual logic. They take plain arguments — never `req` or `res` — apply rules, query Postgres or Mongo, and return plain data or throw `ApiError`. **Services are the only layer that imports model definitions.**

Validators are Zod schemas. One file per domain. They run as middleware.

The shared rule: controllers don't touch the database, services don't touch HTTP. Services are testable without spinning up Express, controllers stay around ten lines.

Supporting folders:
- **Models** — Drizzle tables + Mongoose schemas
- **Events registry** — whitelist of allowed event types
- **Utils** — pure helpers (hashing, tokens, errors, retry, rate limiting)
- **Config** — DB connections, Cloudinary, Redis, env validation, Swagger

## 2. What happens when a request arrives
client request
→ express router matches path + method
→ middleware chain (requireAuth, validate, upload)
→ controller (reads req, calls service)
→ service (rules, DB queries, throws ApiError)
→ response or errorHandler

text

No controller has a try/catch. `asyncHandler` wraps every controller export and forwards throws to `errorHandler`.

**There is no `requireRole` middleware.** Removed in the multi-business refactor. Authorization is capability-based: services check ownership ("does this business belong to this user?").

## 3. Routes

Every router is mounted in `src/app.js`. All routes require a valid access token unless explicitly public.

**Auth** (`auth.routes.js`): register, login, refresh, logout, me. Register/login public. Refresh/logout use httpOnly cookie. Me requires bearer.

**Business** (`business.routes.js`): list mine, create, get one, patch, complete, history, **claim** (`POST /:id/claim` — sets ownerId on unclaimed MCA business), **public** (`GET /:id/public` — no ownership check, investor browse), **profile** (`GET /:id/profile` — full investor-facing profile with media/directors/charges/claims), **readiness** (`GET /:id/readiness`, `POST /:id/readiness/recompute`), **brief** (`GET /:id/brief`, `?regenerate=true`).

**Investor** (`investor.routes.js`): create profile, get mine, patch mine, mark complete.

**Pitches** (`pitch.routes.js`): create, list mine, list live, get one, patch, delete, publish, close, recently-viewed.

**Offers** (`offer.routes.js`): create, list mine, list received, get one, get thread, counter, accept, reject, withdraw. Accept runs a single Postgres transaction (accept offer, reject siblings, fund pitch, create investment, open conversation).

**Matches** (`match.routes.js`): recompute for business, recompute for investor, investor feed, business feed, shortlist, pass, ensure (on-demand single-pair scoring).

**Conversations** (`conversation.routes.js`): list, start, get one, unread count, list messages, send message, mark read.

**Investments** (`investment.routes.js`): portfolio, summary, funding received, get one.

**Follows** (`follow.routes.js`): 9 endpoints, polymorphic (business/investor targets).

**Notifications** (`notification.routes.js`): list, mark read, unread count.

**Uploads** (`upload.routes.js`): one endpoint, multipart, field `file`, returns `{url, publicId}`.

**Verifications** (`verification.routes.js`): create (OCR sync), list mine, get one, apply.

**Search** (`search.routes.js`): one endpoint, `GET /businesses?q=`, pg_trgm GIN index.

**Readiness** (`readiness.routes.js`): recompute, get latest, get trend.

**Admin** (`admin.routes.js`): verification review queue, user management, analytics.

**Health** (`health.routes.js`): one endpoint, Postgres + Mongo connectivity.

**Total: 90+ endpoints across 16 routers.**

Swagger at `/docs` from `@openapi` JSDoc blocks.

Middleware order matters. `requireAuth` runs first, then validation, then upload (which uses `req.user.id` for Cloudinary folder path).

## 4. Controllers

Thin HTTP wrappers.

```js
export const getOne = async (req, res) => {
  const business = await businessProfileService.getBusiness(req.params.id, req.user.id);
  res.json({ business });
};
Ownership check, 404, 403 all live in the service. Controllers move data between HTTP and services.

Every controller export is wrapped in asyncHandler:

js
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
5. Services
Services hold the actual logic.

Ownership pattern
js
const assertBusinessOwnership = async (businessId, userId) => {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) throw ApiError.forbidden("You do not own this business");
  return business;
};
Called at the start of every business-scoped operation. It's a function call and not a route middleware because the business ID can come from URL, body, or a related row.

Service catalog
Auth — register, login, refresh rotation, logout. Same error for "user not found" and "wrong password" (no enumeration). Refresh rotation: old token revoked, new issued, theft detection via reuse.

Business profile — CRUD, multi-business ownership, profile edit audit trail. Field changes write one profile_edit_history row per changed field, inside the same transaction as the businesses update. completeBusiness validates required fields first. claimBusiness — sets ownerId on an unclaimed MCA business, rejects if already claimed by someone else, no-ops if already owned by caller. getCompanyProfile — full profile read, no ownership check (investor-facing), returns business + media + directors + charges + claims.

Investor profile — one per user. Ticket size range validation against existing profile.

Pitch — draft → live → closed lifecycle. Only one live pitch per business. Valuation denormalized on write. Events on every transition.

Offer — counter threads via parentOfferId. Alternation enforced (can't counter own offer). Lazy expiry. Accept is a single transaction: accept offer, reject siblings, fund pitch, create investment, open conversation. Events and notifications after commit.

Investment — portfolio, funding received, aggregate stats. Reads only.

Follow — polymorphic. Target type from URL. Type-specific notifications.

Conversation — get-or-create for pairs. Participants ordered (lower UUID first). lastMessageAt denormalized.

Message — send (rate limited 500/day), list, mark read.

Notification — cross-cutting. createNotification respects notify* prefs, catches its own errors.

Rate limit — in-memory daily counters.

Upload — wraps Cloudinary upload_stream().

Extraction — Gemini OCR per document type. withRetry wrapper, 14 req/min rate limit. Uses gemini-3.8-flash (Gemini 2.5 Flash was retired 2026-10-20).

Format validator — pure functions. GSTIN (mod-36 checksum), Udyam (state codes), PAN (holder type), Shop Act. annotateFields(fields) returns annotated batch.

Verification — bridges Mongo and Postgres. Create → extract → validate → set status. Apply merges fields, writes business row + edit history in transaction, updates Mongo, recomputes tier. Tier rule: 2+ verified docs agreeing on legal name → verified, else basic or unverified. Cross-document consistency is the whole point.

Event — append-only log. log() fire-and-forget, validates against registry, records unknown to rejected_events. Never inside db.transaction() — PGlite deadlocks on nested connections.

Feed impression — batch insert per feed render.

Search — pg_trgm similarity() + word_similarity(). GIN index for candidates. Returns investor's match ID when present.

Match — five-factor scorer (sector 30, ticket 25, geography 20, verification 15, readiness 10). recomputeForInvestor scores all investable MCA businesses + complete profiles. recomputeForBusiness scores against active investors. ensureMatchForInvestor on-demand single pair.

getInvestorFeed — raw SQL, uses fame-weighted ranking:

text
rank = fame_base + match_score × 10 + profile_completeness_pct × 5
fame_base = 100000 (well_known) / 50000 (listed) / 10000 (≥10,000Cr) / 5000 (≥1,000Cr) / 2000 (≥100Cr) / 0
Cache key feed:v2:{userId}:.... Left-joins matches so businesses without a match row still appear (scored 0).

Readiness (readiness.service.js) — pure computeReadiness(business) returns {score, breakdown, missing, suggestions}. Feature checklist sums to 100. Persists to readiness_scores with modelVersion = rules-v1. Auto-recomputes after profile update.

Investor brief (investorBrief.service.js) — LLM summary via gemini-3.8-flash. getBrief returns cached or generates. generateBrief builds prompt from stored fields, calls Gemini, stores in businesses.investorBrief. Known gaps: no Zod validation on output, no withRetry.

CSV import — legacy pipeline (csvImport, columnMatcher, transformInferrer, crosswalkBuilder, harmonization, enrichment). Superseded by direct MCA bulk ingestion.

AI service — thin Gemini wrapper for pitch assistant widget. Not the same as extraction (which is document-specific).

Full request trace: creating a verification
Files touched by the create step alone: route, auth middleware, validate middleware, verification validator, verification controller, verification service, extraction service, format validator service, event service, retry util, rate limiter util, Mongo verification model, Postgres business model, events registry. Fourteen files.

The apply step touches even more — Postgres transaction on businesses + edit_history, Mongo update for appliedFields, tier recomputation, events.

6. Middleware
requireAuth — reads bearer, verifies JWT, sets req.user = {id, role}. Throws 401 on failure.

validate(schema, source = "body") — factory. Runs schema.safeParse(req[source]). Success → replaces req[source] with parsed data (strips unknowns). Failure → 400 with Zod details. source can be "body", "query", "params".

upload — Multer with memory storage, 10MB limit, one file, JPEG/PNG/WebP/PDF only (MIME type AND extension checked).

errorHandler — last middleware. Handles Multer errors (413, 400), file type rejection (415), ApiError (status + message), unknown (500, stack in dev).

7. Validators
One file per domain, all Zod.

auth — register, login. Email lowercased. Role restricted to business/investor (admin rejected at signup).

business profile — create, update. All strings .trim(). Unknown fields stripped.

investor profile — updates. Enforces minTicketSize <= maxTicketSize.

pitch — create (businessId required in body), update.

offer — create, counter. Amount positive, equity 0-100.

conversation — start, send message.

verification — create, list, apply. documentType enum: udyam/gst/shop_act.

follow — pagination.

Zod strips unknown fields by default — no privilege escalation via extra body fields.

8. Utils
ApiError — class with static factories: badRequest, unauthorized, forbidden, notFound, conflict, tooManyRequests. Carries statusCode, message, details.

asyncHandler — promise wrapper shown earlier.

password — bcrypt 12 rounds, constant-time verify.

tokens — signAccessToken({id, role}) 15-min JWT. verifyAccessToken throws on invalid/expired. generateRefreshToken returns {raw, hash}. hashRefreshToken is deterministic SHA256.

retry — withRetry(fn, {attempts, baseDelayMs, maxDelayMs, shouldRetry}). Exponential backoff with jitter. isTransientError matches 429, 5xx, timeout, ECONNRESET, "UNAVAILABLE", "high demand". Used by Gemini calls.

rateLimiter — sliding window. checkRateLimit(key, max, windowMs) throws 429 with retryAfterMs.

9. Events registry
Object in src/events/registry.js with one entry per allowed event type. Each has version, requiredFields, purpose, retention.

Unknown types don't silently fail. log() checks registry, records unknown to rejected_events (one row per distinct type, counter incremented), returns without throwing.

Weekly query: SELECT attempted_type, count FROM rejected_events WHERE count > 100 ORDER BY count DESC — prioritized list of missing registry entries.

10. Error handling
One path: service throws ApiError, async handler forwards, error handler formats {error, details?}.

400 validation

401 missing/invalid tokens

403 ownership violations

404 missing resources (some ownership failures return 404 for drafts to avoid existence leak)

409 conflicts

413 oversized uploads

415 wrong file types

429 rate limits

500 unexpected

11. Testing
47 test files, 619 tests. npm test. GitHub Actions runs on push.

Unit — pure logic (utils, validators, middleware)

Integration — Supertest hitting Express

Service — service functions with plain data, no HTTP

Test harness tests/setup.js: loads every migration into fresh PGlite. mongodb-memory-server for Mongo. vitest.config.js sets env defaults so CI doesn't need real credentials.

Namespace import pattern — when a service calls another service, tests spy on the namespace. Caller must use import * as llmMatcher from "..." not import { mapUnmappedColumns }. Named imports bind directly and can't be intercepted.

Known test gaps: investorBrief.service.js, readiness.service.js, and enrichment scripts have no unit tests. Paper limitation.

12. Config
src/config/env.js loads dotenv, validates required vars, exports env object. Every file imports from this.

Required: PORT, POSTGRES_URI, MONGO_URI, JWT_SECRET, JWT_REFRESH_SECRET, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, GEMINI_API_KEY.

Postgres: pg pool, IPv4 forced, idle 30s. Mongo: lazy connection via connectMongo().

Cloudinary: validates env vars at import, throws at startup if missing.

Swagger: builds OpenAPI from @openapi blocks in routes.

Redis: optional cache for match feed. cacheGet/cacheSet/cacheDel swallow errors — feed works without Redis.