# Fundsroom Mini ERP + CRM — Express + PostgreSQL API

Reference REST backend for the case study: JWT/bcrypt auth, role-based authorization
(ADMIN / SALES / WAREHOUSE / ACCOUNTS), Zod validation, centralized error handling,
a normalized relational schema and fully transactional stock + challan logic.

## Stack

Node 20+, TypeScript, Express 4, PostgreSQL (`pg`), bcryptjs, jsonwebtoken, Zod,
Helmet, CORS, Morgan, Vitest + Supertest.

## Setup

```sh
cd backend
npm install
cp .env.example .env         # set DATABASE_URL and a long random JWT_SECRET
npm run migrate              # creates enums, tables, indexes, triggers
npm run seed                 # demo users, customers, products, movements, challans
npm run dev                  # http://localhost:4000
```

Other scripts: `npm run build`, `npm start`, `npm run typecheck`, `npm test`.

### Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `4000`) |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `CORS_ORIGIN` | Allowed origin(s), comma-separated, `*` for all |
| `DATABASE_URL` | PostgreSQL connection string |
| `PGSSLMODE` | `require` to enable SSL (managed Postgres) |
| `JWT_SECRET` | Signing secret — must be long and random |
| `JWT_EXPIRES_IN` | Token lifetime (default `12h`) |
| `BCRYPT_ROUNDS` | Password hashing cost (default `10`) |

### Demo credentials (after `npm run seed`)

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | admin@fundsroom.test | Admin@123 |
| SALES | sales@fundsroom.test | Sales@123 |
| WAREHOUSE | warehouse@fundsroom.test | Ware@1234 |
| ACCOUNTS | accounts@fundsroom.test | Acct@1234 |

Local demo values only — never ship them to a real environment.

## Response envelope

```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

Error codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` (409), `INSUFFICIENT_STOCK` (422), `INTERNAL_ERROR` (500).
List endpoints return `{ records, page, limit, totalRecords, totalPages }`.

## API

All routes are prefixed with `/api`. Everything except `/health` and `/auth/login`
requires `Authorization: Bearer <jwt>`. ADMIN passes every role check.

| Method | Endpoint | Roles |
| --- | --- | --- |
| GET | `/health` | public |
| POST | `/auth/login` | public |
| POST | `/auth/register` | ADMIN |
| GET | `/auth/me` | any |
| GET | `/customers` `?page&limit&search&status&customer_type` | any |
| POST | `/customers` | SALES |
| GET | `/customers/:id` | any |
| PUT | `/customers/:id` | SALES |
| DELETE | `/customers/:id` | ADMIN |
| GET/POST | `/customers/:id/follow-ups` | any / SALES |
| GET | `/products` `?page&limit&search&category&lowStockOnly` | any |
| GET | `/products/low-stock` | any |
| GET | `/products/:id` | any |
| POST | `/products` | WAREHOUSE |
| PUT | `/products/:id` | WAREHOUSE |
| POST | `/products/:id/stock` | WAREHOUSE |
| GET | `/products/:id/movements` | any |
| GET | `/challans` `?page&limit&status&customer_id` | any |
| GET | `/challans/:id` | any |
| POST | `/challans` | SALES |
| PUT | `/challans/:id` (DRAFT only) | SALES |
| POST | `/challans/:id/confirm` | SALES |
| POST | `/challans/:id/cancel` | SALES |
| GET | `/dashboard` | any |

`POST /auth/register` is intentionally ADMIN-only: roles are provisioned by an
administrator, never self-assigned. Login returns the same generic message for an
unknown email and a wrong password to avoid user enumeration.

## Transactional guarantees

`POST /api/challans/:id/confirm` runs entirely inside one transaction:

1. lock the challan row (`FOR UPDATE`) and reject anything that is not `DRAFT`
   → duplicate confirmation returns `409 CONFLICT`;
2. lock every referenced product row ordered by id (deadlock-safe);
3. validate stock for **every** line before a single write;
4. decrement stock and insert one `OUT` stock movement per line;
5. flip the challan to `CONFIRMED` with `confirmed_at`.

Any failure rolls the whole unit of work back, so stock is never partially
deducted. `POST /api/products/:id/stock` uses the same lock → validate → write
pattern and refuses any adjustment that would drive stock below zero.

Challan items store `product_name_snapshot`, `sku_snapshot` and
`unit_price_snapshot`, so later catalogue edits never rewrite issued documents.
Stock movements are append-only history.

## Tests

```sh
npm test
```

Vitest + Supertest drive the real Express app with the database layer mocked,
covering: authentication required, role denial, validation failures, successful
confirmation (stock decremented + OUT movement written), insufficient stock
(rollback, no writes) and duplicate confirmation rejected.

## Postman

Import `postman_collection.json`. Run **Auth → Login (admin)** first; it stores the
JWT in the `token` collection variable. Set `customerId`, `productId` and
`challanId` from list responses.

## Deployment

Suitable for Render / Railway / Fly.io with managed PostgreSQL:

1. Build command `npm install && npm run build`, start command `npm start`.
2. Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV=production`,
   `PGSSLMODE=require`.
3. Run `npm run migrate` (and optionally `npm run seed`) once against the database.
4. `GET /api/health` works as the platform health check.

Helmet sets secure headers, CORS is restricted to `CORS_ORIGIN`, JSON bodies are
capped at 1 MB, and the pool is closed on `SIGINT`/`SIGTERM`.
