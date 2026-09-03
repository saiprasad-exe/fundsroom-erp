🧾 Fundsroom — Mini ERP + CRM Operations Portal

A role-based internal operations portal built as a full-stack case study. It implements
the complete **customer → product/stock → draft challan → transactional confirmation**
workflow, from CRM through inventory to a financially-safe document confirmation step.

![TanStack Start](https://img.shields.io/badge/TanStack_Start-FF4154?style=flat-square&logo=react&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)

---

## 📚 Table of contents

- [📁 Repository layout](#repository-layout)
- [👤 Roles](#roles)
- [🧩 Modules](#modules)
- [🔒 Transactional challan confirmation](#transactional-challan-confirmation)
- [🚀 Getting started](#getting-started)
- [⚙️ Frontend scripts](#frontend-scripts)
- [🛠️ Express reference API](#express-reference-api-optional)
- [🩹 Troubleshooting](#troubleshooting)
- [🧱 Built with](#built-with)

---

## 📁 Repository layout

The repository contains two independent deliverables — the UI does **not** call the
Express API; each talks to its own PostgreSQL setup.

| Path | What it is |
| --- | --- |
| `src/` | React + TypeScript responsive admin UI, running on TanStack Start with a managed PostgreSQL backend (auth, row-level security, guarded transactional database functions). This is the live, deployed app. |
| `backend/` | Standalone **Express + TypeScript + PostgreSQL** REST API reference implementation — JWT/bcrypt auth, Zod validation, centralized error handling, migrations, seed data, Vitest tests, and a Postman collection. See [`backend/README.md`](backend/README.md) for details and demo logins. |

## 👤 Roles

| Role | Capabilities |
| --- | --- |
| **ADMIN** | Full access, including user provisioning and deletions |
| **SALES** | Manage customers & follow-ups; create, confirm, and cancel draft challans |
| **WAREHOUSE** | Manage products, stock adjustments, and movement history |
| **ACCOUNTS** | Read-only access to CRM, inventory, and challans |

## 🧩 Modules

- 🔐 **Auth** — Email/password sign-in with hashed credentials, JWT-backed sessions, and role-aware navigation and route guards.
- 🤝 **CRM** — Searchable, filterable, paginated customer list; customer detail view with edit/delete and a follow-up timeline. Validates Indian mobile numbers and GST formats.
- 📦 **Products** — Catalogue with search, category filter, and low-stock filter. Create/edit is restricted to the WAREHOUSE role. SKU and current stock are immutable after creation.
- 📊 **Inventory** — Guarded IN/OUT stock adjustments with a mandatory reason, plus an append-only movement history. Stock can never go negative.
- 🧾 **Challans** — List with status/customer filters; draft creation with dynamic line items and live totals; detail screen with confirm/cancel actions.
- 📈 **Dashboard** — Customer, product, low-stock, and challan KPIs, plus recent challans and stock movements.

## 🔒 Transactional challan confirmation

Confirmation is designed as a single, all-or-nothing unit of work:

1. Lock the challan and reject anything that isn't `DRAFT` (a duplicate confirmation returns a conflict).
2. Lock every referenced product row, in a deterministic order, to prevent deadlocks.
3. Validate stock for **every** line item before making any writes.
4. Decrement stock and write one `OUT` movement per line.
5. Mark the challan `CONFIRMED` with a timestamp.

If any step fails, the entire operation rolls back — stock is never partially deducted.
Challan items also keep immutable snapshots of product name, SKU, and unit price, so
later catalogue changes never alter an already-issued document.

## 🚀 Getting started

**Requirements:**
- 🟢 Node 20+ (Node 22 recommended) and npm
- 🐘 PostgreSQL 14+ — only needed if you also want to run the Express reference API locally

**Steps:**

1. Unzip `fundsroom-erp.zip` and open the folder in VS Code (`File → Open Folder…`).
2. Open a terminal (`` Ctrl+` ``) and install the UI dependencies:

   ```sh
   npm install
   npm run dev
   ```

3. Open the printed local URL (default <http://localhost:8080>).

The included `.env` file already points at the hosted database, so the app works
immediately — sign in from the auth screen, or create an account, which is
automatically provisioned with a role.

**🧰 Recommended VS Code extensions:** ESLint, Prettier, Tailwind CSS IntelliSense.

### ⚙️ Frontend scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Create a production build |
| `npm run lint` | Lint the project |

### 🛠️ Express reference API (optional)

Requires a local PostgreSQL instance.

```sh
cd backend
npm install
cp .env.example .env        # set DATABASE_URL and a long random JWT_SECRET
npm run migrate             # create enums, tables, indexes, triggers
npm run seed                # seed demo users, customers, products, challans
npm run dev                 # runs on http://localhost:4000
npm test                    # 11 Vitest + Supertest tests
```

Demo logins are listed in [`backend/README.md`](backend/README.md).

> ℹ️ **Note:** The two deliverables are independent — the UI does not call the Express API.

## 🩹 Troubleshooting

| Symptom | Fix |
| --- | --- |
| `EADDRINUSE` | Another process is holding the port — stop it, or change the port. |
| `migrate` fails | Check `DATABASE_URL` and confirm PostgreSQL is running. |
| Type or import errors after pulling changes | Re-run `npm install`. |

## 🧱 Built with

TanStack Start · React · TypeScript · Tailwind CSS · TanStack Query · Zod ·
PostgreSQL · Express · JWT · bcrypt · Vitest
