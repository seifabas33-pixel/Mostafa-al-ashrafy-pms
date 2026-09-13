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
npm test                    # API unit + integration tests (vitest, isolated SQLite test db)
npm run typecheck           # both apps
npm run build               # both apps
```

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
