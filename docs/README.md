
# SmartShark — Documentation

Virtual Shark Tank platform. Businesses pitch for investment, investors match and make offers.

**Stack:** Node 22 · Express · Postgres (Neon) · MongoDB (Atlas) · Drizzle · Vitest · GitHub Actions

---

## Quick Links

| Doc | What it covers |
|---|---|
| [overview.md](./overview.md) | Architecture, layers, security model, scaling plan |
| [logic.md](./logic.md) | Routes, controllers, services, request flow |
| [database.md](./database.md) | 14 tables, relationships, indexes, migrations |

**Reading order for a new contributor:** overview → logic → database → code.

---

## Status

| Phase | Feature | Status |
|---|---|---|
| 1 | Auth (JWT + refresh rotation + RBAC) | ✅ Complete — 82 tests, CI green |
| 2 | Business + investor profiles | ⏳ Next |
| 3 | Pitches | ⏳ |
| 4 | Matching (rule-based) | ⏳ |
| 5 | Offers | ⏳ |
| 6 | Conversations | ⏳ |
| 7 | Verification (Mongo ↔ Postgres) | ⏳ |

Full roadmap: [overview.md §11](./overview.md#11-roadmap).

---

## What's Built

- **Auth system** — register, login, refresh with rotation, logout, role-based access
- **14 Postgres tables** — users, profiles, matches, pitches, offers, and supporting tables
- **MongoDB verification model** — for OCR document processing
- **82 tests** — unit + integration, all passing
- **CI** — every push runs the test suite on GitHub Actions

---

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node 22 (ESM) |
| Framework | Express |
| ORM | Drizzle |
| Postgres | Neon (via `pg` driver) |
| MongoDB | Atlas (via Mongoose) |
| Auth | JWT + bcrypt + httpOnly refresh cookies |
| Validation | Zod |
| Tests | Vitest + Supertest + PGlite |
| CI | GitHub Actions |

---

## Repo Structure

```
smartshark/
├── .github/workflows/       ← CI
├── docs/                    ← you are here
│   ├── README.md
│   ├── overview.md
│   ├── logic.md
│   └── database.md
└── virtual-shark-tank/
    └── server/
        ├── src/
        │   ├── config/      ← DB connections, env
        │   ├── models/      ← Drizzle + Mongoose
        │   ├── routes/
        │   ├── middleware/
        │   ├── controllers/
        │   ├── services/
        │   ├── validators/
        │   └── utils/
        ├── tests/           ← Vitest test suite
        ├── drizzle/         ← migration files
        ├── vitest.config.js
        └── server.js
```

---

## Run Locally

```bash
cd virtual-shark-tank/server

# 1. Install dependencies
npm install

# 2. Create .env with:
#    PORT=5000
#    POSTGRES_URI=postgresql://...
#    MONGO_URI=mongodb+srv://...
#    JWT_SECRET=<48-byte hex>
#    JWT_REFRESH_SECRET=<48-byte hex>
#
# Generate secrets:
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Apply migrations
npm run migrate

# 4. Start the server
npm run dev

# 5. Run tests (uses in-memory DB, no external services needed)
npm test
```

Server runs on `http://localhost:5000`. Health check: `GET /health`.

---

## Design Principles

The rules that shaped every decision. Full list: [overview.md §12](./overview.md#12-design-principles).

1. **Stable identity, role extensions** — one `users` table, profiles extend it
2. **Layer dependencies point down** — routes → controllers → services → models
3. **Events vs state** — append-only for history, mutable rows for current state
4. **Denormalize for the hot path only** — computed fields where they're queried
5. **Enforce at the lowest layer** — DB constraints, zod validation, service rules
6. **Stateless servers, stateful tokens** — horizontal scaling is free
7. **Test behavior, not implementation** — endpoint tests hit real HTTP
8. **Version everything that evolves** — migrations, `modelVersion`, token rotation
9. **Don't optimize before measuring** — infrastructure scales, not rewrites
10. **Document decisions, not tutorials** — docs explain *why*

---

## Key Decisions

Quick reference for "why was this chosen?" Full reasoning in the linked docs.

| Decision | Why | Reference |
|---|---|---|
| Postgres for core data | Joins, transactions, ACID | [overview.md §4](./overview.md#4-data-stores) |
| MongoDB for verification | OCR shape varies per doc type | [database.md §7](./database.md#7-mongodb) |
| Two tokens (access + refresh) | Revocable sessions, short theft window | [overview.md §6](./overview.md#6-security-model) |
| Refresh token rotation | Detect stolen tokens | [logic.md §5.1](./logic.md#51-auth-service) |
| `pg` driver, not Neon HTTP | HTTP fails intermittently on long-running servers | [database.md §2.1](./database.md#21-postgres-neon) |
| Monolith, not microservices | Team of 1, no distributed transaction complexity needed | [overview.md §5.1](./overview.md#51-why-monolith-not-microservices) |
| PGlite for tests | No Docker, no network, fast CI | [logic.md §11](./logic.md#11-testing) |
| Rule-based matching first | Ship before ML, swap scorer later | [database.md §3.11](./database.md#311-matches) |

---

## Contributing

This is currently a solo project. If you're reviewing or exploring:

1. Read [overview.md](./overview.md) first — it's the map
2. Dive into [logic.md](./logic.md) for code structure
3. Check [database.md](./database.md) for schema

**Before opening a PR:**
- `npm test` must pass
- CI must be green
- New endpoints need tests

---

## Contact

- **GitHub:** [@aniruddha9674](https://github.com/aniruddha9674)
- **Project:** [smartshark](https://github.com/aniruddha9674/smartshark)

---

*Last updated: 2026-09-15*
```

---

## What makes this README work

**It's a map, not a manual.** Every section either answers "where do I go next?" or "what is this?" — no deep content that belongs elsewhere.

**Six quick links at the top.** A recruiter lands here, scans the table, clicks `overview.md`. Done in 10 seconds.

**"Key Decisions" table is the MVP section.** It's the one thing people scroll to — "I don't want to read 3 docs, just tell me the 8 decisions you made." The table does that in 30 seconds.

**Numbers are specific.** "14 tables", "82 tests", "48-byte hex" — concrete facts beat vague claims. Recruiters and collaborators trust specifics.

**Roadmap is honest.** ⏳ vs ✅ — no pretending things are done.

**Repo structure mirrors reality.** Anyone can `cd` into the paths shown and find the files.

## The full docs set is now

```
docs/
├── README.md          ← entry point (this)
├── overview.md        ← architecture + why
├── logic.md           ← code flow
└── database.md        ← schema
