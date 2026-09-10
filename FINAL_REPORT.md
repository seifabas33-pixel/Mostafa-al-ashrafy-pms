# Final report · Ashrafy PMS built from the Kwentra research

Prepared for Seif Abas · 10 September 2026 · branch `claude/pdf-data-extraction-report-4duhzt`

## 1. What was asked and what was delivered

You asked for the Kwentra PMS research PDF to be scrubbed into data, for the project to be built up according
to it, and for a final report. All three are in this repository:

| Deliverable | Result |
| --- | --- |
| Scrubbed data | 17-page PDF extracted to `research/kwentra-research-report.md` (1,024 lines) and 14 structured JSON files in `research/data/` covering company, leadership, timeline, features, architecture, pricing and terms, compliance, partners, 30 named clients + 7 prospects, reviews, competitors, gaps, go-to-market, caveats and 36 sources |
| Product built | A working multi-property hotel PMS: TypeScript API (46 data models, 98 documented routes), React web app (12 pages), demo seed with a Hurghada resort and a Makkah hotel, 35 passing automated tests |
| Documentation | 8 documents in `docs/` (requirements with a Kwentra parity checklist, architecture, data model, compliance roadmap, pricing and terms, integration priorities, roadmap, API guide) plus this report |

## 2. How the report shaped the build

The report's Section 14 lists eleven Kwentra weaknesses and the opening each creates. Every one has a concrete
answer in the code:

| Report finding | What the build does |
| --- | --- |
| Opaque pricing, no SLA, 60-day notice | Four published plans (per-room, occupancy-based, group) with 99.9% SLA and 30-day cancellation; public calculator with the industry benchmarks from Section 13 |
| Dated jQuery/Bootstrap-3 front end | React 18 + Vite app, responsive to phone width, no legacy UI libraries |
| Dashboard lacks live occupancy; poor filtering | Dashboard computed from live room and reservation state with a 14-day forecast; reservation list with saved filters and search |
| "Open API" with no docs | OpenAPI 3.1 with Swagger UI, scoped API keys, 19 signed webhook events, public endpoints for the booking engine |
| Compliance moat (ETA, MoI, ZATCA, Shomoos, NTMP) | Compliance ledger with an adapter per authority, queued automatically at check-in and folio close, Hijri + Gregorian everywhere |
| Thin guest layer, reputation bought via Reflectfy | Scheduled WhatsApp/email journey (pre-arrival, digital check-in, upsell, review request) and a reputation summary with sentiment and topics |
| Activities are basic | Full activities module: programme, sessions, capacity, waitlist, animation team, folio posting, public programme feed |
| Multi-property sold to 20-hotel groups | Organisation → properties from day one, consolidated portfolio KPIs |
| POS with recipe costing is a real strength | POS posts to folios and deducts recipe ingredients from the outlet's warehouse; PO approval and receiving; documented-vs-actual consumption |
| Field workshops + referral commissions | Documented in the pricing and go-to-market doc as the playbook to copy |
| Only 7 public reviews in 12 years | Review request built into the guest journey; review collection targets in the roadmap |

Front Office parity with Section 3 is tracked line by line in `docs/01-product-requirements.md`. Built: room
rack data, out-of-order control that removes rooms from every channel, derived rates, date restrictions
(stop-sell, CTA/CTD, LOS, lead time), promo codes, hostel bed mode, day use, group blocks with rooming-list
import and rolling release, split folios, automated night audit, housekeeping board and tasks. Not built yet:
offline mode, weekly/monthly long-stay rates, staff login with MFA, geotargeted pricing.

## 3. Verified behaviour

The full front-desk cycle was exercised against the running API with seeded data:

1. Walk-in reservation with the `REDSEA10` promo: two nights quoted at 2,760 EGP, discounted to 4,968 total.
2. Four guest-journey messages scheduled automatically.
3. Check-in auto-assigned a clean room and queued the Ministry of Interior guest report.
4. Restaurant order posted to the room: 640 EGP net, and 0.5 kg chicken, 0.3 kg rice, tomatoes and lemons
   deducted from the kitchen store by the recipe.
5. Yoga sign-up posted 500 EGP to the folio.
6. Night audit posted nine room charges, computed 33.33% occupancy, ADR 3,564.89, RevPAR 1,188.30, and rolled
   the business date.
7. Check-out was refused with a 4,627.12 balance, accepted after card payment, and closed the folio.
8. Egyptian e-invoice built from the folio and accepted by the sandbox adapter with an ETA reference.
9. Portfolio report returned 15 days of KPIs for Hurghada and 14 for Makkah with Hijri dates.

Automated tests (`npm test`, 35 tests in 3 files) cover date and Hijri handling, tax maths, restrictions and
promo logic, pricing estimates, sentiment scoring, webhook signing, availability with out-of-order rooms, beds
and group blocks, derived rates, and the end-to-end lifecycle above including procurement and the public
booking engine. Typecheck passes for both apps.

## 4. Web application

_See section 4 addendum below._

## 5. Decisions and assumptions

- **Stack**: Node 22, Fastify 5, Prisma 6 on SQLite for development (PostgreSQL for production by changing the
  datasource), React 18 + Vite. Chosen for a documented API, type safety end to end, and a modern front end,
  which are exactly the gaps the report identifies.
- **Tax model**: service charge on net, VAT on net plus service (Egypt 14%/12%, Saudi 15%/0%), configurable per
  property. Confirm with the accountant for each client.
- **Compliance adapters are sandboxed**: payload shapes are real, transmission is simulated. Live integrations
  need ETA taxpayer registration and signing tokens, ZATCA onboarding, and MoI/Shomoos/NTMP credentials.
- **Prices in the seed** are proposals inside the report's benchmark corridor (USD 4–15 per room per month),
  not final commercial decisions.
- **Names, guests and properties in the seed are fictional** demo data; the Kwentra client and partner names
  live only in `research/`.

## 6. What to do next

1. Review the published plans and terms in `docs/05-pricing-and-terms.md`; they are the lead-generation weapon
   the report recommends and the numbers are yours to set.
2. Pick the pilot hotel and start ETA registration; the compliance ledger is waiting for credentials.
3. Run `npm run setup && npm run dev`, open the web app and walk the demo day with the front-desk team.
4. Follow `docs/07-roadmap.md`: staff login and MFA, payment capture (Paymob/Kashier), WhatsApp provider,
   SiteMinder certification, then the Saudi phase.
