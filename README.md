# Fundsroom — Mini ERP + CRM Operations Portal

Full-stack case study implementation: a role-based internal operations portal covering
the complete **customer → product/stock → draft challan → transactional confirmation**
flow.

The repository contains two deliverables:

| Path | What it is |
| --- | --- |
| `src/` | React + TypeScript responsive admin UI running on TanStack Start with a managed PostgreSQL backend (auth, row-level security, guarded transactional database functions). This is the live, deployed app. |
| `backend/` | Standalone **Express + TypeScript + PostgreSQL** REST API reference implementation (JWT/bcrypt, Zod validation, centralized errors, migrations, seed data, Vitest tests, Postman collection). See [`backend/README.md`](backend/README.md). |

## Roles

| Role | Capabilities |
| --- | --- |
| ADMIN | Everything, including user provisioning and deletions |
| SALES | Customers & follow-ups, draft challans, confirm/cancel |
| WAREHOUSE | Products, stock adjustments, movement history |
| ACCOUNTS | Read-only access to CRM, inventory and challans |

## Modules

- **Auth** — email/password sign-in, hashed credentials, JWT-backed sessions, role-aware navigation and route guards.
- **CRM** — customer list with search, status and type filters, pagination; customer detail with edit/delete and a follow-up timeline. Validated Indian mobile and GST formats.
- **Products** — catalogue with search, category filter and low-stock filter; create/edit restricted to warehouse. SKU and current stock are immutable after creation.
- **Inventory** — guarded IN/OUT stock adjustments with a mandatory reason plus append-only movement history. Stock can never go negative.
- **Challans** — list with status/customer filters, draft creation with dynamic line items and live totals, and a detail screen with confirm/cancel actions.
- **Dashboard** — customer, product, low-stock and challan KPIs plus recent challans and stock movements.

## Transactional challan confirmation

Confirmation is a single all-or-nothing unit of work:

1. lock the challan and reject anything that is not `DRAFT` (duplicate confirmation → conflict);
2. lock every referenced product row in a deterministic order;
3. validate stock for **every** line before any write;
4. decrement stock and write one `OUT` movement per line;
5. mark the challan `CONFIRMED` with a timestamp.

Any failure rolls the entire operation back — stock is never partially deducted.
Challan items keep immutable product name, SKU and unit-price snapshots, so later
catalogue changes never alter an issued document.

## Run it in VS Code

Requirements: **Node 20+** (Node 22 recommended) and npm. PostgreSQL 14+ only if you
want to run the Express reference API locally.

1. Unzip `fundsroom-erp.zip` and open the folder in VS Code (`File → Open Folder…`).
2. Open a terminal (`Ctrl+``) and install the UI dependencies:

```sh
npm install
npm run dev
```

The portal starts on the printed local URL (default <http://localhost:8080>).
The `.env` file included in the zip already points at the hosted database, so the app
works immediately — sign in from the auth screen, or create an account and it is
provisioned with a role automatically.

Recommended VS Code extensions: ESLint, Prettier, Tailwind CSS IntelliSense.

### Frontend scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build |
| `npm run lint` | Lint the project |

### Express reference API (optional, needs local PostgreSQL)

```sh
cd backend
npm install
cp .env.example .env        # set DATABASE_URL + a long random JWT_SECRET
npm run migrate             # create enums, tables, indexes, triggers
npm run seed                # demo users, customers, products, challans
npm run dev                 # http://localhost:4000
npm test                    # 11 Vitest + Supertest tests
```

Demo logins are listed in [`backend/README.md`](backend/README.md).
The two deliverables are independent — the UI does not call the Express API.

### Troubleshooting

- `EADDRINUSE` → another process holds the port; stop it or change the port.
- Backend `migrate` fails → check `DATABASE_URL` and that PostgreSQL is running.
- Type or import errors after pulling changes → re-run `npm install`.


## Built with

TanStack Start, React, TypeScript, Tailwind CSS, TanStack Query, Zod, PostgreSQL,
Express, JWT, bcrypt, Vitest.
