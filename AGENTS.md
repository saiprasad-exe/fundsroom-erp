# Project Instructions

## Overview

This repository contains the **Fundsroom ERP + CRM** application: a role-based internal
operations portal covering the customer → product/stock → draft challan → transactional
confirmation workflow.

It has two independent deliverables:

- `src/` — React + TypeScript UI on TanStack Start, backed by a managed PostgreSQL instance.
- `backend/` — Standalone Express + TypeScript + PostgreSQL REST API reference implementation.

The UI does **not** call the Express API — treat the two as separate systems unless a
task explicitly asks you to connect them.

## Ground rules

- Keep the project source, configuration, database integration, and documentation in a
  working state at all times. Don't leave the build, lint, or test suite broken between
  tasks.
- Never commit secrets, API keys, or `.env`/`.env.*` files containing credentials.
  Use `.env.example` (with placeholder values only) to document required variables.
- Prefer the smallest change that correctly solves the task. Don't refactor unrelated
  code, rename files, or reorganize folders as a side effect of an unrelated fix.
- Match the existing code style and conventions in the file you're editing rather than
  introducing a new pattern.
- If a change affects setup steps, scripts, environment variables, or architecture,
  update `README.md` (and `backend/README.md` if relevant) in the same change.

## Before you finish a task

- Run the relevant checks for whatever you touched:
  - Frontend: `npm run lint` and `npm run build`
  - Backend: `npm test` (and `npm run migrate` if schema changed)
- Confirm the app still starts (`npm run dev`) after dependency or config changes.
- Double-check no secrets, credentials, or `.env` files were added to the diff.

## Data-integrity-sensitive areas

Some parts of this codebase enforce financial/inventory correctness and should be
changed with extra care and tests:

- **Challan confirmation** — must remain a single all-or-nothing transaction (lock
  challan → lock products in deterministic order → validate all lines → decrement
  stock and write movements → mark confirmed). Never allow partial stock deduction.
- **Stock adjustments** — stock must never go negative; every adjustment requires a
  reason and produces an append-only movement record.
- **Challan line items** — product name, SKU, and unit price are immutable snapshots
  once a challan is created; don't let later catalogue edits mutate issued documents.
- **Role permissions** — respect the ADMIN / SALES / WAREHOUSE / ACCOUNTS boundaries
  described in `README.md` when adding routes, UI, or API endpoints.

## Out of scope unless asked

- Don't add new third-party services, analytics, or telemetry.
- Don't change authentication/authorization logic without explicit instruction.
- Don't delete or rewrite migration history — add new migrations instead.
