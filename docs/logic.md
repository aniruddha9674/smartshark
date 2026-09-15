
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
| **Middleware** | `src/middleware/` | Cross-cutting concerns (auth, validation, errors) |
| **Controllers** | `src/controllers/` | HTTP layer — parse request, call service, send response |
| **Services** | `src/services/` | Business logic, database access |
| **Validators** | `src/validators/` | Request body shape (zod schemas) |

Supporting layers:

| Layer | Folder | Responsibility |
|---|---|---|
| **Models** | `src/models/postgres/`, `src/models/mongo/` | Drizzle tables + Mongoose schemas |
| **Utils** | `src/utils/` | Pure helpers (hashing, tokens, error classes) |
| **Config** | `src/config/` | DB connections, env validation |

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
│    - validate(schema)   ← body validation   │
│    - requireAuth        ← JWT check         │
│    - requireRole(...)   ← role check        │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 3. Controller handler                       │
│    - reads req.body, req.user, req.cookies  │
│    - calls service function                 │
│    - sends response                         │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 4. Service function                         │
│    - business rules                         │
│    - Drizzle DB queries                     │
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

---

## 3. Routes

All routes are mounted in `src/app.js`. Each router file lives in `src/routes/`.

### 3.1 Route registration

```js
// src/app.js
app.use("/api/auth", authRoutes);
// future:
app.use("/api/business", businessRoutes);
app.use("/api/investor", investorRoutes);
app.use("/api/pitches", pitchRoutes);
```

### 3.2 Auth routes

**File:** `src/routes/auth.routes.js`

| Method | Path | Middleware | Handler | Auth |
|---|---|---|---|---|
| POST | `/api/auth/register` | `validate(registerSchema)` | `authController.register` | none |
| POST | `/api/auth/login` | `validate(loginSchema)` | `authController.login` | none |
| POST | `/api/auth/refresh` | — | `authController.refresh` | cookie |
| POST | `/api/auth/logout` | — | `authController.logout` | cookie |
| GET | `/api/auth/me` | `requireAuth` | `authController.me` | Bearer |

**Notes:**
- `/refresh` and `/logout` read the refresh token from an httpOnly cookie — no `requireAuth` needed
- `/me` requires a valid access token — the JWT payload seeds `req.user`

### 3.3 Planned routes

| Prefix | Purpose | Status |
|---|---|---|
| `/api/business` | Business profile CRUD | Planned |
| `/api/investor` | Investor profile CRUD | Planned |
| `/api/pitches` | Pitch create/update/list | Planned |
| `/api/offers` | Offer create/accept/counter | Planned |
| `/api/matches` | Feed + shortlist actions | Planned |
| `/api/conversations` | Chat threads | Planned |

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

For role-gated routes:

```js
router.get("/dashboard",
  requireAuth,                    // 1st — must have valid token
  requireRole("business"),        // 2nd — must have correct role
  asyncHandler(businessController.getDashboard)
);
```

**Order matters.** `requireRole` reads `req.user.role`, so it must run after `requireAuth`.

---

## 4. Controllers

**Folder:** `src/controllers/`

Controllers are thin HTTP wrappers. They:
- Read from `req` (body, params, cookies, `req.user`)
- Call a service
- Send a response

They do **not** contain business logic, and they do **not** import `db`.

### 4.1 Auth controller

**File:** `src/controllers/auth.controller.js`
**Calls:** `authService` + sets/clears cookies

| Export | Purpose |
|---|---|
| `register` | Create user, set refresh cookie, return 201 + user + access token |
| `login` | Verify credentials, set refresh cookie, return 200 + user + access token |
| `refresh` | Rotate refresh token, return new access token + cookie |
| `logout` | Revoke refresh token, clear cookie, return message |
| `me` | Fetch current user from DB, return full user object |

**Cookie handling:** `setRefreshCookie()` is a local helper inside the controller. All auth endpoints share it.

**Why `me` queries the DB:** The JWT carries only `{ id, role }`. `/me` fetches the full user (name, email, settings, verification status) fresh from the DB. This keeps the JWT small and revocation immediate.

**Never returns:** `passwordHash`. Every auth response is sanitized before sending.

### 4.2 Planned controllers

| Controller | Endpoints | Status |
|---|---|---|
| `business.controller.js` | GET/PATCH `/business/me` | Planned |
| `investor.controller.js` | GET/PATCH `/investor/me` | Planned |
| `pitch.controller.js` | CRUD on pitches | Planned |
| `offer.controller.js` | Create/accept/counter offers | Planned |
| `match.controller.js` | Feed + shortlist | Planned |
| `conversation.controller.js` | List threads, load messages | Planned |

---

## 5. Services

**Folder:** `src/services/`

Services hold business logic. They:
- Receive plain data (not `req`/`res`)
- Apply rules
- Query the DB via `db`
- Throw `ApiError` for known failures

They are the **only** layer that imports from `models/postgres/index.js`.

### 5.1 Auth service

**File:** `src/services/auth.service.js`
**Imports:** `db`, `users`, `refreshTokens`, `hashPassword`, `verifyPassword`, `signAccessToken`, `generateRefreshToken`, `hashRefreshToken`

| Function | Purpose |
|---|---|
| `registerUser({ name, email, password, role })` | Check email uniqueness, hash password, insert user, issue tokens |
| `loginUser({ email, password }, userAgent)` | Find user, verify password, check isActive, issue tokens |
| `refreshSession(rawRefreshToken, userAgent)` | Look up hashed token, verify not revoked/expired, rotate, issue new tokens |
| `logoutUser(rawRefreshToken)` | Mark token row as revoked |

**Helpers (not exported):**
- `issueTokens(user, userAgent)` — signs JWT + inserts refresh token row
- `sanitize(user)` — strips `passwordHash` before return

**Key business rules:**
- Email uniqueness checked before insert (DB unique constraint also enforces)
- Same error message for "user not found" and "wrong password" → no user enumeration
- Refresh rotation: old token revoked, new one issued — every refresh
- `isActive` checked on login and refresh — banned users lose access immediately

**Reference:** See [database.md §3.1 users](./database.md#31-users) and [§3.2 refresh_tokens](./database.md#32-refresh_tokens).

### 5.2 Planned services

| Service | Purpose |
|---|---|
| `businessProfile.service.js` | Read/update business profile + write to `profile_edit_history` |
| `investorProfile.service.js` | Read/update investor profile |
| `pitch.service.js` | Create/update/publish pitch, enforce one live per business |
| `offer.service.js` | Create offer, accept (in transaction), counter (self-ref) |
| `match.service.js` | Run scoring, upsert into `matches`, return ranked feed |
| `notification.service.js` | Insert notification rows, respecting user preferences |
| `conversation.service.js` | Get or create conversation for a pair, list threads |
| `verification.service.js` | Bridge MongoDB `Verification` ↔ Postgres `verificationTier` |

---

## 6. Middleware

**Folder:** `src/middleware/`

Middleware runs before the controller. Each function receives `(req, res, next)`.

### 6.1 `auth.middleware.js`

**Exports:** `requireAuth`, `requireRole(...roles)`

| Middleware | Behavior |
|---|---|
| `requireAuth` | Reads `Authorization: Bearer <token>`. Verifies JWT. Sets `req.user = { id, role }`. Calls `next(ApiError 401)` on failure. |
| `requireRole(...roles)` | Reads `req.user.role`. If not in the list, calls `next(ApiError 403)`. If `req.user` is missing (order bug), returns 401. |

**Why it's separate from the controller:** Role checks happen before any business logic runs. Controllers never check `req.user.role` themselves. This gives one place to audit "who can do what."

**Reference:** [database.md §3.1 users](./database.md#31-users) — the `role` enum.

### 6.2 `validate.middleware.js`

**Export:** `validate(schema)`

Factory that returns a middleware. Runs `schema.safeParse(req.body)`:
- Success → replaces `req.body` with parsed data (strips unknown fields)
- Failure → `next(ApiError.badRequest("Validation failed", details))`

**Why:** Never trust client input. Validation happens before any service runs.

### 6.3 `error.middleware.js`

**Export:** `errorHandler(err, req, res, next)`

The **last** middleware registered in `app.js`. Catches everything:
- `ApiError` → returns `{ error, details? }` with the error's status code
- Unknown error → logs to console, returns 500 (with stack in dev)

**Why:** Controllers use `asyncHandler` to forward errors here. No controller writes error responses itself.

---

## 7. Validators

**Folder:** `src/validators/`

Zod schemas. One file per domain.

### 7.1 `auth.validator.js`

| Schema | Fields |
|---|---|
| `registerSchema` | name, email (lowercased), password (min 8, 1 upper, 1 lower, 1 number), role (`business` \| `investor`) |
| `loginSchema` | email (lowercased), password (min 1) |

**Notes:**
- Email is lowercased at validation time → `Alice@X.com` matches `alice@x.com`
- `role: "admin"` is **rejected** — admins are seeded, not self-signed-up
- Login does not enforce password complexity — that's register's job
- Unknown extra fields in the body are **stripped** (zod default)

### 7.2 Planned validators

| File | Purpose |
|---|---|
| `businessProfile.validator.js` | Profile update schema |
| `investorProfile.validator.js` | Profile update schema |
| `pitch.validator.js` | Pitch create/update |
| `offer.validator.js` | Offer create/counter |

---

## 8. Utils

**Folder:** `src/utils/`

Pure functions and helpers. No DB, no HTTP.

### 8.1 `apiError.js`

**Export:** `ApiError` class

```js
new ApiError(statusCode, message, details)
```

Static factory methods:
- `ApiError.badRequest(msg, details)` → 400
- `ApiError.unauthorized(msg?)` → 401
- `ApiError.forbidden(msg?)` → 403
- `ApiError.notFound(msg?)` → 404
- `ApiError.conflict(msg)` → 409

**Why:** Typed errors let `errorHandler` return the correct status without controllers building responses.

### 8.2 `asyncHandler.js`

**Export:** `asyncHandler(fn)`

Wraps an async controller. Any thrown error is passed to `next(err)` automatically.

```js
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

**Why:** Without this, every controller needs `try/catch`. This is the standard Express pattern for async functions.

### 8.3 `password.js`

**Exports:** `hashPassword(plain)`, `verifyPassword(plain, hash)`

- `hashPassword` uses bcrypt with 12 salt rounds (~250ms per hash)
- `verifyPassword` compares constant-time

**Why bcrypt:** Intentionally slow — makes brute-forcing a leaked hash impractical.

### 8.4 `tokens.js`

**Exports:**
- `signAccessToken({ id, role })` — JWT, 15-min TTL
- `verifyAccessToken(token)` — throws on invalid/expired
- `generateRefreshToken()` — returns `{ raw, hash }`
- `hashRefreshToken(raw)` — SHA256, deterministic

**Why two token types:**
- Access token = JWT (stateless, cannot be revoked, dies fast)
- Refresh token = opaque random (can be revoked, stored hashed)

**Why SHA256 (not bcrypt) for refresh:** The token is already 384 bits of randomness. No need for a slow hash.

### 8.5 Planned utils

| File | Purpose |
|---|---|
| `logger.js` | Structured logging (replace `console.log`) |
| `pagination.js` | Cursor-based pagination helpers |
| `dateUtils.js` | Time-zone-safe formatting |

---

## 9. Error Handling

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

### 9.1 Error response shapes

| Status | Body |
|---|---|
| 400 | `{ error: "Validation failed", details: {...} }` |
| 401 | `{ error: "No token provided" }` or `{ error: "Invalid credentials" }` |
| 403 | `{ error: "Forbidden" }` or `{ error: "Insufficient permissions" }` |
| 404 | `{ error: "Not found" }` |
| 409 | `{ error: "Email already in use" }` |
| 500 | `{ error: "Internal server error" }` (+ stack in dev) |

### 9.2 Logging

- Unknown errors: `console.error` in `errorHandler` — replace with structured logger later
- No logging for expected `ApiError`s (they're not bugs)

---

## 10. End-to-End Example: `POST /api/auth/register`

Trace of a single request through every layer.

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Alice Sharma",
  "email": "alice@example.com",
  "password": "Password123",
  "role": "investor"
}
```

**Step 1 — Express routes**
`src/app.js` → `app.use("/api/auth", authRoutes)` → matches `POST /register`.

**Step 2 — Validation middleware**
`validate(registerSchema)` runs. Zod parses the body:
- All fields present ✓
- Email format valid ✓
- Password meets complexity ✓
- Role is `business` or `investor` ✓
- Email lowercased, unknown fields stripped

Replaces `req.body` with the parsed result. Calls `next()`.

**Step 3 — Controller**
`authController.register(req, res)`:
- Reads `req.body`
- Calls `authService.registerUser({ ... })`

**Step 4 — Service**
`authService.registerUser`:
1. `db.query.users.findFirst({ where: eq(users.email, email) })` — checks uniqueness
2. If found → throws `ApiError.conflict("Email already in use")`
3. `hashPassword(password)` — bcrypt, 12 rounds
4. `db.insert(users).values({ ... }).returning()` — creates row in [`users`](./database.md#31-users)
5. Calls `issueTokens(user, userAgent)`:
   - `signAccessToken({ id, role })`
   - `generateRefreshToken()` → `{ raw, hash }`
   - `db.insert(refreshTokens).values({ userId, tokenHash: hash, expiresAt })` — creates row in [`refresh_tokens`](./database.md#32-refresh_tokens)
6. `sanitize(user)` — strips `passwordHash`
7. Returns `{ user, accessToken, refreshToken }`

**Step 5 — Back in the controller**
- `setRefreshCookie(res, refreshToken)` — httpOnly, `SameSite=Strict`, `Path=/api/auth`
- `res.status(201).json({ user, accessToken })`

**Step 6 — Response**
```http
HTTP/1.1 201 Created
Set-Cookie: refreshToken=...; HttpOnly; SameSite=Strict; Path=/api/auth

{
  "user": {
    "id": "c6955a1a-...",
    "name": "Alice Sharma",
    "email": "alice@example.com",
    "role": "investor",
    "isVerified": false,
    "isActive": true,
    ...
  },
  "accessToken": "eyJhbGciOi..."
}
```

**Files touched:**
1. `src/app.js`
2. `src/routes/auth.routes.js`
3. `src/middleware/validate.middleware.js`
4. `src/validators/auth.validator.js`
5. `src/controllers/auth.controller.js`
6. `src/services/auth.service.js`
7. `src/utils/password.js`
8. `src/utils/tokens.js`
9. `src/models/postgres/user.model.js`
10. `src/models/postgres/refreshToken.model.js`
11. `src/config/db.postgres.js`

Eleven files, one request. That's the layering.

---

## 11. Testing

Tests mirror the layer structure.

**Folder:** `server/tests/`

| Test file | Layer | Tests |
|---|---|---|
| `tests/utils/password.test.js` | Utils | 5 |
| `tests/utils/tokens.test.js` | Utils | 12 |
| `tests/validators/auth.validator.test.js` | Validators | 19 |
| `tests/middleware/requireAuth.test.js` | Middleware | 11 |
| `tests/auth/register.test.js` | Integration | 10 |
| `tests/auth/login.test.js` | Integration | 10 |
| `tests/auth/refresh.test.js` | Integration | 14 |
| `tests/health.test.js` | Smoke | 1 |

**Total:** 82 tests. Run with `npm test`. Runs on every push via GitHub Actions.

**Approach:**
- **Unit tests** for pure logic (utils, validators, middleware) — fast, no DB
- **Integration tests** for endpoints — Supertest hits the app, PGlite backs it
- Every endpoint test covers the happy path + error paths (401, 400, 409)

See `vitest.config.js` and `tests/setup.js` for the harness.

---

## 12. Configuration

### 12.1 Environment

**File:** `src/config/env.js`

Loads `dotenv`, validates required vars, exports a typed `env` object.

**Required vars:**
- `PORT`
- `POSTGRES_URI`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

**Rule:** Every file imports from `env.js`. Never `process.env` directly. In ESM, all imports hoist — dotenv must run inside a module that others import, not at the top of `server.js`.

### 12.2 Database connections

**File:** `src/config/db.postgres.js` — pool via `pg`, forced IPv4, idle timeout 30s
**File:** `src/config/db.mongo.js` — Mongoose connection

See [database.md §2 Data Stores](./database.md#2-data-stores).

---

## 13. Anchor Links for Cross-Referencing

From `overview.md`, link as:

```markdown
See [logic.md §3 Routes](./logic.md#3-routes)
See [logic.md §4 Controllers](./logic.md#4-controllers)
See [logic.md §5 Services](./logic.md#5-services)
See [logic.md §6 Middleware](./logic.md#6-middleware)
See [logic.md §10 End-to-End Example](./logic.md#10-end-to-end-example-post-apiauthregister)
```

---

*Last updated: 2026-09-15*
```

---

## What to know about this doc

**§10 is the most valuable section.** The end-to-end trace is what you'll read when you forget how the layers fit. It's a walk-through that answers "where does X happen?" in one read.

**Layers mirror code exactly.** Every file mentioned exists. Every file that exists is mentioned. When you add a new controller, you add a row to §4.

**"Planned" sections are honest.** They show what's coming without pretending it exists. Update them as you build.

**Anchor links target section numbers.** From `overview.md`:
```markdown
The request pipeline is documented in [logic.md §2](./logic.md#2-request-lifecycle).
```

