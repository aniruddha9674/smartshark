# Logic

How a request moves through the backend.

Stack: Node 22, Express, Drizzle, Mongoose. Everything lives under `server/src/`.

Every endpoint follows the same path: route → middleware → controller → service → database. Once you understand one endpoint you understand them all.

Table schemas are in [database.md](./database.md).

## 1. The layers

Five folders, each with one job.

Routes map URLs to handler functions. They also attach the middleware that runs before the handler. Nothing else belongs in a route file.

Middleware handles cross-cutting concerns — auth, body validation, file uploads, error formatting. Each middleware is a function of `(req, res, next)` and either mutates `req` and calls `next()`, or throws / calls `next(err)`.

Controllers are the HTTP boundary. They read from `req`, call a service, and send a response. That's it. Controllers never import the database client, never query, never apply business rules.

Services hold the actual logic. They take plain arguments — never `req` or `res` — apply rules, query Postgres or Mongo, and return plain data or throw `ApiError`. Services are the only layer that imports model definitions.

Validators are Zod schemas. One file per domain. They run as middleware and either pass validated data through or reject the request with a 400.

There's a shared rule the whole codebase follows: controllers don't touch the database, and services don't touch HTTP. That means services are testable without spinning up an Express app, controllers stay around ten lines, and when you need to debug something you know which layer it lives in.

Supporting folders:

Models hold the Drizzle table definitions and Mongoose schemas.
The events registry holds the whitelist of allowed event types.
Utils are pure helpers — password hashing, JWT signing, error classes, retry logic, in-memory rate limiting.
Config holds database connections, Cloudinary setup, environment validation, and the Swagger spec.

## 2. What happens when a request arrives

Express matches the URL against a router. The router runs its middleware chain in order — auth first, then validation, then upload handling if the route accepts a file. Then the controller runs, calls the service, and sends back JSON. If anything throws, `errorHandler` catches it and formats the response.

```
client request
  → express router matches path + method
  → middleware chain (requireAuth, validate, upload)
  → controller (reads req, calls service)
  → service (rules, DB queries, throws ApiError)
  → response or errorHandler
```

No controller has a try/catch. The `asyncHandler` wrapper around every controller export catches synchronous and async throws, forwards to `next(err)`, and `errorHandler` formats the response. One path for every error.

Worth stating clearly: there's no `requireRole` middleware. It existed in an earlier version and was removed when the platform moved to a multi-business model. A user can own businesses and be an investor at the same time, so a role check on a route makes no sense — the check that matters is "does this business belong to this user?", and that's enforced in the service layer. More on that in the ownership section below.

## 3. Routes

Every router is mounted in `src/app.js`. All routes require a valid access token unless the route is explicitly public.

Auth (`auth.routes.js`): register, login, refresh, logout, me. Five endpoints. Register and login are public. Refresh and logout read a refresh token from an httpOnly cookie and don't need the access token. `me` requires a bearer token.

Business (`business.routes.js`): list mine, create, get one, patch, complete, history. Plus the public profile at `GET /:id/public` which returns a business for any authenticated user without an ownership check — investors use this when browsing from search. And `POST /:id/complete` which validates required fields and flips `isProfileComplete`.

Investor (`investor.routes.js`): create my profile, get mine, patch mine, mark complete. Four endpoints.

Pitches (`pitch.routes.js`): create, list mine, list live, get one, patch, delete, publish, close, recently-viewed. The last one is backed by the events table rather than a dedicated table — every non-owner view of a pitch logs an event, and the endpoint reads back the deduped list.

Offers (`offer.routes.js`): create, list mine, list received, get one, get thread, counter, accept, reject, withdraw. Accept is the interesting one — it runs a single Postgres transaction that accepts the offer, rejects sibling pending offers, marks the pitch funded, creates the investment, and opens the conversation between the two parties.

Matches (`match.routes.js`): recompute for business, recompute for investor, investor feed, business feed, shortlist, pass. Plus an ensure endpoint that computes a match on-demand for a given (business, investor) pair — used when an investor clicks into a business they haven't been scored against yet.

Conversations (`conversation.routes.js`): list threads, start thread, get one, unread count, list messages, send message, mark read.

Messages also have their own router for the endpoints that aren't nested under a conversation.

Investments (`investment.routes.js`): portfolio, summary, funding received, get one.

Follows (`follow.routes.js`): follow business, unfollow business, follow investor, unfollow investor, list following, business followers, investor followers, business follow status, investor follow status. Nine endpoints. Polymorphic — the target type is in the URL.

Notifications (`notification.routes.js`): list mine, mark read, unread count.

Uploads (`upload.routes.js`): one endpoint. Multipart form, field name `file`. Returns `{ url, publicId }` from Cloudinary.

Verifications (`verification.routes.js`): create (runs OCR extraction synchronously), list mine, get one, apply. Apply is where extracted fields get merged into the business profile.

Search (`search.routes.js`): one endpoint. `GET /businesses?q=`. Fuzzy match with a pg_trgm GIN index.

Readiness (`readiness.routes.js`): recompute score, get latest, get trend.

Admin (`admin.routes.js`): verification review queue, user management, analytics.

Health (`health.routes.js`): one endpoint. Checks Postgres and Mongo connectivity and returns a status object.

Swagger docs are served at `/docs`. The spec is built from `@openapi` JSDoc blocks in each route file, so the routes and docs can't drift apart.

A note on middleware order: it runs left to right. For a protected route, `requireAuth` runs first because downstream middleware depends on `req.user`. For a file upload route, `requireAuth` still runs first — the upload middleware builds the Cloudinary folder path from the user's ID.

## 4. Controllers

Controllers are thin. They read from `req`, call a service function, and send a response.

A controller looks like this:

```js
export const getOne = async (req, res) => {
  const business = await businessProfileService.getBusiness(
    req.params.id,
    req.user.id
  );
  res.json({ business });
};
```

That's it. The ownership check, the 404 case, the 403 case — all of it lives in the service. Controllers just know how to move data between HTTP and the service layer.

Every controller export is wrapped in `asyncHandler` at the route layer. That wrapper is what makes try/catch unnecessary in the controller:

```js
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

If the service throws synchronously or returns a rejected promise, the error lands in `errorHandler` and the response comes back structured. The controller never sees it.

## 5. Services

Services are where the actual thinking happens. They take plain data, apply rules, query the database, and either return a value or throw an `ApiError`.

### Ownership instead of roles

Before anything else, here's the pattern that shows up in almost every service:

```js
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

Every business-scoped service call starts with this. Pitch creation, offer acceptance, verification apply, business updates, match recompute — all of them.

The reason it's a function call and not a route middleware is that the same business ID can come from different places. Sometimes it's in the URL (`PATCH /api/businesses/:id`). Sometimes it's in the body (creating a pitch). Sometimes it's derived from a related row (accepting an offer — the business comes from the pitch the offer is on). Middleware can only see the URL. A service function sees everything.

This also means a user can be an investor and a business owner, and there's no ambiguity. The check is "does this business belong to this user?", not "is this user's role `business`?".

### The service catalog

Auth service handles register, login, refresh rotation, logout. Email uniqueness is checked before insert (the database unique constraint is a backstop). The same error message goes out for "user not found" and "wrong password" — no user enumeration. Refresh is a rotation: the old token gets marked revoked in Postgres, a new one is issued, and the new access token comes back with a new httpOnly cookie. If a stolen token gets used after rotation, the legitimate user's next refresh fails, which is the theft signal.

Business profile service handles business CRUD, multi-business ownership, and the profile edit audit trail. Every field change on a business writes one row to `profile_edit_history`. That write happens inside the same transaction as the businesses update, so the audit row and the state change are atomic. `completeBusiness` validates required fields before flipping `isProfileComplete` — it throws a 400 listing missing fields rather than silently setting the flag.

Investor profile service is the investor equivalent. One profile per user. Ticket size range validation is checked against the existing profile — if you're setting a new minimum that exceeds your existing maximum, that's a 400.

Pitch service handles the full lifecycle: draft, live, closed, funded, withdrawn. Only one live pitch per business at a time (enforced in the service). Valuation is denormalized — it's computed as `askAmount / (equityOffered / 100)` on every write. Publish requires the business profile to be complete and all required fields to be present. Every state transition logs an event: `pitch_published`, `pitch_closed`, `pitch_viewed`.

Offer service is the most complex one. Counter-offers are just rows pointing at each other via `parentOfferId`, and alternation is enforced by a simple check: you can't counter an offer you initiated. Expiry is lazy — every read and every action checks `expiresAt` and marks the row expired if it's past. No cron job. Accept is a single transaction:

```
begin transaction
  update this offer → accepted
  update sibling pending offers on the same pitch → rejected
  update pitch → funded
  insert investment row
  insert conversation (or find existing)
commit
  → then: notifications, events, all outside the transaction
```

Five operations, all or nothing. The transaction boundaries are deliberate — event logs and notifications can fail without affecting the deal state, so they run after the commit. Mongoose writes also run after, because you can't hold a Postgres transaction open while waiting on a different database.

Investment service handles portfolio queries, funding received, and aggregate stats. Reads only — investments are only created inside the offer acceptance transaction.

Follow service handles polymorphic follows. The target type (business or investor) is derived from the URL segment, and the service does the type-specific work — following a business notifies the owner, following an investor notifies the investor. Notifications go through the shared notification service.

Conversation service handles get-or-create for a pair of users. Participants are stored as an ordered pair (lower UUID first) with a check constraint, so `(X, Y)` and `(Y, X)` collapse automatically. The service sorts the incoming UUIDs before querying, so the caller never has to know the ordering rule. `lastMessageAt` is denormalized — it gets bumped on every message send so the chat list can sort without a join.

Message service handles send, list, mark read. Send enforces a daily limit of 500 messages per user, bumps `lastMessageAt` on the conversation, notifies the recipient through the notification service, and logs a `message_sent` event. The rate limit is checked before the insert; the notification and event happen after.

Notification service is cross-cutting. Every other service calls it. It's a single function: `createNotification`. Before inserting, it reads the recipient's `notify*` preferences from the users table and skips the insert if the user has disabled that type. It catches its own errors — a failed notification never fails the parent operation. This runs after any transaction, same as events.

Rate limit service is in-memory. Two daily counters per user — one for messages, one for new conversations. Resets at UTC midnight. Cleared on server restart, which is fine for a single-instance MVP. When the platform runs on multiple instances, the interface stays the same and the backing store becomes Redis.

Upload service wraps Cloudinary's `upload_stream()`. Takes a buffer, returns `{ url, publicId }`. Memory-efficient because it streams rather than writing to disk.

Extraction service calls Gemini. It fetches the image, base64-encodes it, sends it with a per-document-type prompt, and parses the JSON response. The response is strict JSON — `responseMimeType: "application/json"`, `temperature: 0.1` — so there's no prose-with-JSON-inside to strip. The call is wrapped in `withRetry` with exponential backoff, and gated by a sliding-window rate limiter set to 14 requests per minute (Gemini's free tier is 15). If the response says the wrong document type was uploaded, the service returns `wrongDocument: true` and the caller marks the verification as rejected.

Format validator service is pure functions. It validates GSTIN (15-character format, state code range, mod-36 checksum), Udyam (format plus a state code whitelist), PAN (format plus holder type), and Shop Act (length and character class). Each validator returns `{ valid, reason }`. The service also exposes `annotateFields` which takes a batch of OCR fields and annotates each with `formatValid` and `formatReason` where a validator exists. Those annotations get stored on the Mongo verification document and become the training signal for the trust model.

Verification service bridges Mongo and Postgres. Creating a verification inserts a Mongo document with status `pending`, calls the extraction service, runs format validation on the result, and sets the final status based on confidence. Applying merges the OCR fields with any user-confirmed overrides, writes changes to the business row inside a Postgres transaction, writes one `profile_edit_history` row per changed field in the same transaction, then updates Mongo with `appliedFields`, then recomputes the verification tier from all of the business's documents and updates `businesses.verificationTier` if it changed. Events fire at every stage, always after the transaction.

The tier computation is the point of the whole pipeline. No verifications is unverified. One or more verified documents gives basic. Two or more verified documents where the extracted company name collapses to a single unique value across all of them gives verified. If an Udyam certificate says "Acme Pvt Ltd" and a GST certificate says "Acme Private Limited", the tier stays at basic even though both documents verified successfully — because the two documents disagree on the legal name. That cross-document consistency check is what the paper is about.

Event service is the append-only activity log. `log()` is fire-and-forget — it validates the event type against the registry, records unknown types to `rejected_events` without throwing, and swallows its own errors. `logStrict()` is used in tests and throws. There's also `listMine`, `listForEntity`, `countSince`, and `getRecentlyViewedPitches` which dedupes by entity ID and orders by recency.

One important rule: `log()` is never called inside a `db.transaction()`. PGlite uses a single connection and deadlocks on nested transactions, and the same constraint applies to production for consistency. Events always fire after the transaction commits.

Feed impression service logs which pitches appeared where. Batch insert, not per-impression. The signal is `(position, score, modelVersion)` — enough to compute position bias later when training a ranker. Same fire-and-forget pattern as events.

Search service uses Postgres `pg_trgm`. It runs a query that scores each business by `similarity()` and `word_similarity()` against the concatenated search fields, with a GIN index for fast candidate lookup. Falls back to `ILIKE` for substring matches that trigrams miss. Returns the investor's match ID for each result if one exists, so the frontend can route directly to the match view instead of the public browse view.

Match service is the rule-based scorer. Five factors with fixed weights — sector (30), ticket size (25), geography (20), verification tier (15), readiness (10). The result is upserted into the matches table with a JSONB breakdown of each factor. `recomputeForInvestor` iterates all complete businesses and upserts a match row for each. `recomputeForBusiness` iterates all active investors. There's also `ensureMatchForInvestor` which computes a single pair on demand — used by the search flow so an investor can click into a business they haven't been scored against yet.

CSV import services handle the external data loading pipeline. `csvImport.service.js` reads a CSV, batches rows into `raw_import_businesses`, and creates an `import_batches` row. `columnMatcher.service.js` and `llmColumnMatcher.service.js` map source columns to canonical fields — fuzzy match first, then an LLM fallback for columns the fuzzy matcher couldn't handle. `transformInferrer.service.js` looks at sample values and infers what transform to apply. `crosswalkBuilder.service.js` assembles the full mapping. `harmonization.service.js` applies the crosswalk to raw rows and produces business records, logging failures to `harmonization_errors`. `enrichment.service.js` fills in logo URLs and cover images after harmonization.

AI service is a thin wrapper around the Gemini client used by the pitch assistant widget. Different from the extraction service — that one is doc-specific and uses a per-document spec. This one is generic.

## 6. Middleware

Auth middleware has one export: `requireAuth`. Reads the bearer token from the Authorization header, verifies the JWT, sets `req.user = { id, role }`, and calls `next()`. On failure, throws a 401.

Validate middleware is a factory. `validate(schema, source = "body")` returns a middleware that runs `schema.safeParse(req[source])`. On success, it replaces `req[source]` with the parsed data — which strips unknown fields as a side effect. On failure, it throws a 400 with the Zod error details. The `source` parameter defaults to `"body"` but accepts `"query"` or `"params"` for routes that validate those.

Upload middleware is a configured Multer instance. Memory storage (buffer in RAM, streamed to Cloudinary — no temp files on disk), a 10 MB size cap, one file per request, and a file filter that only accepts JPEG, PNG, WebP, and PDF — checking both the MIME type and the extension, because a malicious upload can spoof either one.

Error middleware is the last one registered. It handles Multer's specific error codes (413 for file too large, 400 for unexpected field), the file-type rejection (415), `ApiError` instances (returns the error's status and message), and unknown errors (logs and returns 500, with a stack trace in dev). This is the only place that writes an error response.

## 7. Validators

One file per domain. All Zod.

Auth validator handles register and login. Email is lowercased at validation time so `Alice@X.com` and `alice@x.com` are treated as the same address. Role is restricted to `business` or `investor` — `admin` is rejected, because admins are seeded directly in the database, not self-registered.

Business profile validator handles create and update. String fields all have `.trim()` — this prevents the " " bug where someone enters spaces and the field saves as whitespace instead of empty. `companyName` has a minimum length. Unknown fields are stripped by Zod.

Investor profile validator handles updates. Enforces that `minTicketSize <= maxTicketSize` when both are present.

Pitch validator handles create and update. Required fields are checked at create time. `businessId` is required in the body for create.

Offer validator handles create and counter. Amount positive, equity between 0 and 100.

Conversation validator handles start and send message. Message body has a minimum and maximum length.

Verification validator handles create, list, and apply. `documentType` is restricted to `udyam`, `gst`, or `shop_act`. `documentUrl` must be a valid URL.

Follow validator has just a pagination schema.

A general note: Zod strips unknown fields by default. That's why you can't escalate privilege by sending extra fields in a request body — they get removed before the service sees them.

## 8. Utils

ApiError is a class with static factory methods for each status code: `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `tooManyRequests`. Instances carry `statusCode`, `message`, and optional `details`.

AsyncHandler is the promise wrapper shown earlier. Every controller export goes through it at the route layer.

Password helpers wrap bcrypt. `hashPassword` uses 12 salt rounds. `verifyPassword` does a constant-time comparison.

Token helpers wrap JWT. `signAccessToken` issues a 15-minute JWT with `{ id, role }` in the payload. `verifyAccessToken` throws on invalid or expired. `generateRefreshToken` returns `{ raw, hash }` — the raw value goes into the httpOnly cookie, the hash goes into Postgres. `hashRefreshToken` is deterministic SHA256.

Retry helpers wrap async functions with exponential backoff and jitter. `withRetry(fn, options)` takes an `attempts` count and a `shouldRetry` predicate. `isTransientError` matches the errors that are worth retrying — 429, timeouts, 5xx, ECONNRESET. Used by the Gemini call.

Rate limiter util is a sliding window counter. `checkRateLimit(key, max, windowMs)` throws a 429 with a `retryAfterMs` hint if the window is full. Separate from the daily rate limit service — this one is meant for tight per-second limits like Gemini's RPM cap.

## 9. Events registry

The registry is an object in `src/events/registry.js` with one entry per allowed event type. Each entry has a `version` (bumped when the metadata shape changes), a list of `requiredFields`, a short `purpose` string, and a `retention` policy.

Registered types cover pitches, offers, follows, messages, auth, and verification. The full list is in the registry.

The point of the registry is that unknown event types don't silently fail. `eventService.log()` checks the type before inserting. If it's registered, the insert happens. If it's not, the call is recorded in `rejected_events` — one row per distinct attempted type, with a counter and timestamps — and the function returns without throwing.

That means adding a new event type requires a code change to the registry, not a database migration. And the `rejected_events` table tells you which types the system is asking for. Every week or so you can run a query like `SELECT attempted_type, count FROM rejected_events WHERE count > 100` and see what's missing.

## 10. Error handling

One path. Service throws `ApiError`. Async handler forwards it. Error handler formats the response as `{ error, details? }`.

The status codes used across the API:

400 for validation failures. The body has a `details` field with the Zod error.
401 for missing or invalid tokens, wrong credentials.
403 for ownership violations — "You do not own this business".
404 for missing resources. Note that some ownership failures return 404 instead of 403 — specifically, drafts that a non-owner tries to fetch return 404 so an attacker can't distinguish "exists but you can't see it" from "doesn't exist".
409 for conflicts — duplicate email, second live pitch on the same business.
413 for oversized uploads.
415 for wrong file types.
429 for rate limits.
500 for anything unexpected, with a stack trace in dev but not in prod.

Logging is currently `console.error` in the error handler for unknown errors. `ApiError`s aren't logged — they're expected failures, not bugs. `eventService.log()` and `feedImpression.logBatch()` catch their own errors and log with a prefix so they're easy to grep for. Structured logging is a future improvement.

## 11. End-to-end: creating a verification

This is the most complex request in the system, so it's worth tracing all the way through.

The request is a POST to `/api/verifications` with a body containing `businessId`, `documentType`, `documentUrl`, and `publicId`. The URL and public ID come from a separate call to `/api/uploads` that already put the file in Cloudinary.

Express matches the route. `requireAuth` runs and verifies the JWT. `validate(createVerificationSchema)` runs and confirms the document type is one of the three allowed values and the URL is actually a URL. Then the controller runs.

The controller reads `req.body` and `req.user.id` and calls `verificationService.createVerification`. Nothing else.

Inside the service:

First, `assertBusinessOwnership` fetches the business and confirms the caller owns it. If not, this throws and the request ends here with a 403.

Then a new Mongo document is created with status `pending`, the user ID, the business ID, the document type, the URL, and the public ID.

Then `verification_started` is logged. Fire and forget — if the event insert fails, the pipeline continues.

Then the extraction service runs. It fetches the image from Cloudinary, base64-encodes it, checks the rate limiter (14 requests per minute, sliding window), and calls Gemini with a prompt built from the document type's spec. The call is wrapped in `withRetry` with three attempts and exponential backoff. Gemini returns strict JSON containing a map of field name to `{ value, confidence }`.

Then the format validator runs on the extracted fields. GSTIN, Udyam registration numbers, PAN, and Shop Act certificate numbers each have their own validator. Each field that has a validator gets annotated with `formatValid` and `formatReason`. Fields without a validator pass through unchanged.

Then the Mongo document gets updated: the annotated fields, the overall confidence, the format validation summary, and the status. Status is `rejected` if Gemini said the wrong document was uploaded, `verified` if overall confidence is 0.7 or higher, and `needs_review` otherwise.

Then `verification_extracted` is logged, with the confidence and format validation counts in the metadata.

If anything throws during extraction, the catch block sets status to `needs_review` and logs `verification_failed`. The verification record still exists — a user can see what went wrong and try again.

The response is the verification document with its final status, confidence, and the annotated OCR data.

The apply step is a separate request. When the user clicks Apply, the service merges the OCR fields with any values the user confirmed in the UI, compares each against the current business value, writes changes inside a Postgres transaction (business row plus `profile_edit_history` rows), updates the Mongo document with the applied field list, recomputes the tier from all of the business's verifications, and updates the businesses row if the tier changed. Three events fire — `verification_applied`, and possibly `verification_tier_changed`. All after the transaction.

Files touched by the create step alone: route, auth middleware, validate middleware, verification validator, verification controller, verification service, extraction service, format validator service, event service, retry util, rate limiter util, Mongo verification model, Postgres business model, events registry. Fourteen files for one request.

The apply step touches even more, but that's the pipeline. It's long because every step has a reason to exist and the failure modes are all handled.

## 12. Testing

47 test files, 619 tests. `npm test` runs them all. GitHub Actions runs them on every push.

Unit tests cover pure logic — password hashing, token signing, retry backoff, rate limiter, Zod schemas, the middleware that doesn't need a database. These run fast and don't touch Postgres or Mongo.

Integration tests drive the Express app with Supertest. They hit real endpoints and check real responses. Every endpoint test covers the happy path plus the error paths — 401 without a token, 400 for bad input, 403 for wrong owner, 404 for missing resources, 409 for conflicts.

Service tests sit between the two. They call service functions directly with plain data, no HTTP involved. Most of the ownership logic and business rules are tested here because it's faster than going through HTTP.

The test harness is `tests/setup.js`. It loads every migration file in `drizzle/` in sorted order into a fresh PGlite instance and applies them. PGlite is Postgres compiled to WebAssembly — the same SQL, no Docker required. Since PGlite doesn't ship `pg_trgm` in all versions, the harness loads the extension explicitly and the migration that creates the trigram index is skipped if the extension isn't available. In production, `pg_trgm` was enabled once on Neon and the index exists there.

Mongo uses `mongodb-memory-server`. Real Mongoose behavior, in-memory, no external service. Each test file spins up its own instance.

Environment defaults are set in `vitest.config.js` so CI doesn't need real Cloudinary or Gemini credentials. Services that would call external APIs are mocked per test.

A testing pattern worth noting: when a service calls another service, tests often spy on the inner service's export. For that to work, the caller needs to import the module as a namespace (`import * as llmMatcher from "..."`) rather than destructuring the specific function at import time (`import { mapUnmappedColumns } from "..."`). Named imports bind directly and can't be intercepted by `vi.spyOn` on the namespace. This bit us once with the LLM column matcher — the tests passed locally on a version that had a namespace import, and CI failed when someone switched to a named import during a refactor.

## 13. Config

Environment is loaded in `src/config/env.js`. It reads `dotenv`, validates that required variables are present, and exports a typed `env` object. Every other file imports from this, never from `process.env` directly. That rule exists because in ESM all imports hoist — dotenv has to run inside a module that others import, not at the top of the entry point.

Required variables: `PORT`, `POSTGRES_URI`, `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GEMINI_API_KEY`.

Postgres connection is a `pg` pool with IPv4 forced (some ISPs misroute IPv6 and the connection hangs without it). Idle timeout is 30 seconds.

Mongo connection is lazy. `db.mongo.js` exports a `connectMongo()` function that `server.js` calls at boot. Tests never call it — they use `mongodb-memory-server` instead. Keeping this lazy means importing `app.js` doesn't try to connect to Atlas.

Cloudinary config validates the three `CLOUDINARY_*` variables at import time and throws immediately if any are missing. Fail loudly at startup, not silently on the first upload.

Swagger config builds the OpenAPI spec from the `@openapi` JSDoc blocks in route files. The spec is served at `/docs` along with the interactive UI.

Redis config exists but is only used for the match feed cache. `cacheGet`, `cacheSet`, and `cacheDel` wrap the client. If Redis is down, the wrappers swallow errors and return null — the feed still works, it's just slower.
