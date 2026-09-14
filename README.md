# Ashrafy PMS

A cloud hotel property-management system for Red Sea, Sinai and Saudi independents, designed from the
**Kwentra PMS competitive research report** (8 September 2026). The report is scrubbed into structured
data in [`research/`](research/) and every product decision in this repository traces back to it.

| What | Where |
| --- | --- |
| Scrubbed research (JSON + text) | [`research/data/*.json`](research/data), [`research/kwentra-research-report.md`](research/kwentra-research-report.md) |
| Product & engineering docs | [`docs/`](docs) |
| Final build report | [`FINAL_REPORT.md`](FINAL_REPORT.md) |
| API (Fastify + Prisma, TypeScript) | [`apps/api`](apps/api) |
| Web app (React + Vite, TypeScript) | [`apps/web`](apps/web) |

## What is built

The report's Section 14 pairs each Kwentra weakness with an opening. This codebase takes every one of them:

- **Transparent pricing** with published per-room, occupancy-based and group tiers, a real uptime SLA and 30-day
  cancellation, plus a public estimate calculator with the industry benchmarks from the report.
- **Modern web app** (React, no jQuery/Bootstrap 3) with a live occupancy dashboard, room rack, saved filters.
- **Public, documented REST + webhook API** (OpenAPI at `/docs`, HMAC-signed webhooks, scoped API keys stored
  as digests, per-field tenancy checks on every foreign key).
- **Compliance ledger** with adapters for Egypt ETA e-invoice/e-receipt and Ministry of Interior guest reporting,
  and Saudi ZATCA, Shomoos and NTMP. Submissions are queued automatically at check-in and folio close.
- **Front Office parity**: room rack, out-of-order control, derived rates, restrictions, promo codes, hostel
  bed mode, day use, group blocks with rooming-list import, split folios, automated night audit,
  Hijri + Gregorian reporting.
- **POS with recipe costing** that deducts stock, multi-warehouse inventory, PO approval and receiving,
  documented-vs-actual consumption.
- **Activities & entertainment module**: published programme, sessions, capacity, waitlists, folio posting.
- **Guest layer**: scheduled WhatsApp/email journey (pre-arrival, digital check-in, upsell, review request)
  and a reputation summary with sentiment and topic scoring.
- **Multi-property from day one**: one organisation, many properties, consolidated portfolio report.

## Quick start

```bash
npm run setup               # installs both apps, creates apps/api/.env, pushes the SQLite schema, seeds demo data
npm run dev                 # API on :4000 (docs at /docs), web on :5173
```

`npm run setup` is the same as: `npm install`, copy `apps/api/.env.example` to `apps/api/.env`, `npm run db:push`,
`npm run db:seed`. The seed creates two demo properties (Hurghada resort, Makkah hotel) and the dev API key.

Dev API key: `pms_dev_key_ashrafy` (header `x-api-key`). The web app stores it in local storage.

```bash
npm run doctor              # checks Node, dependencies, .env, database and ports before a local run
npm test                    # API unit + integration tests (vitest, isolated SQLite test db)
npm run typecheck           # both apps
npm run build               # both apps
```

### Troubleshooting a local run

Run both commands in a terminal **on your own machine**, in the folder you cloned the repository into.
Everything is local: the API, the web app and the SQLite database all run on your computer, and
`http://localhost:5173` only works in a browser on that same computer.

If it will not start, run:

```bash
npm run doctor
```

It checks the Node version, the installed dependencies, `apps/api/.env`, the generated Prisma client, the
seeded demo database and both ports, then prints the first thing that is actually wrong and the command
that fixes it. It changes nothing, so it is always safe to run.

| Symptom | Cause and fix |
| --- | --- |
| `npm run setup` fails with syntax errors, or `Unsupported engine` | Node is too old. Run `node -v`; it must be 22 or newer. Install the current LTS from nodejs.org, close the terminal, reopen it and try again. |
| `prisma: not found` or `vite: not found` | Dependencies are not installed. Run `npm install` in the repository root first, then `npm run setup`. |
| `EADDRINUSE`, or `Port 5173 is already in use` | An earlier `npm run dev` is still running in another terminal. Close it, or `lsof -ti:5173 \| xargs kill` (`lsof -ti:4000` for the API). The web server is pinned to 5173 on purpose and refuses to start elsewhere, so it can never end up quietly serving on 5174 while you are looking at 5173. |
| `prisma db push` warns that data will be lost | The demo database predates a schema change. Delete `apps/api/prisma/dev.db` and run `npm run setup` again; it only holds demo data. |
| The browser shows nothing at `localhost:5173` | Check the terminal running `npm run dev` is still open and shows no errors. Both servers stop when you close that terminal. |
| The app loads but every panel says unauthorised | The API key in Settings does not match the seeded one. Set it back to `pms_dev_key_ashrafy`, or re-run `npm run db:seed`. |

## Repository layout

```
research/            scrubbed PDF data (source of truth for requirements)
docs/                requirements, architecture, data model, compliance, pricing, integrations, roadmap, API guide
apps/api/prisma/     schema.prisma (data model), seed.ts (demo data)
apps/api/src/        lib/ (dates, money, errors), plugins/ (auth), services/ (domain logic), routes/ (HTTP)
apps/api/test/       vitest suites
apps/web/src/        React app: pages/, components/, api.ts
```

## Production notes

Switch `datasource db` in `apps/api/prisma/schema.prisma` to `postgresql`, point `DATABASE_URL` at Postgres and run
`prisma migrate`. Compliance adapters run in sandbox mode; wire authority credentials in
`apps/api/src/services/compliance.ts`. Webhooks deliver over HTTPS with an `x-pms-signature` HMAC header.
