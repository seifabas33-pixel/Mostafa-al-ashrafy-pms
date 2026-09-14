# 01 · Product requirements

Source: research report Sections 3, 4, 11 and 14 (`research/data/features.json`, `reviews.json`, `gaps.json`).

## Target customer

Independent hotels, resorts and small chains on the Red Sea and Sinai coasts (Egypt) and pilgrimage hotels in
Makkah/Madinah (Saudi Arabia), 20 to 500 rooms, currently on Kwentra, ComSyS, Oracle OPERA or spreadsheets.
The buyer is an owner or GM; the daily users are front desk, housekeeping, F&B, accounting and the animation team.

## Positioning (the four things Kwentra is thinnest on)

1. **Published prices, real SLA, monthly cancellation.**
2. **Modern, fast, mobile-first UI** with the live occupancy dashboard reviewers ask for.
3. **Public API and webhooks** from day one.
4. **Native guest layer + a real activities module**, the resort-operations differentiator.

Compliance depth (ETA, MoI, ZATCA, Shomoos, NTMP, Hijri) is table stakes, not a differentiator: it must be matched.

## Feature parity checklist (Kwentra → Ashrafy PMS)

| Kwentra capability (report §3) | Status in this build | Where |
| --- | --- | --- |
| Room rack, check-in/out, cleaning & maintenance status | Built | `services/reservations.ts`, `routes/housekeeping.ts` (board) |
| Out-of-order blocks sales on all channels | Built: OOO rooms leave inventory in `availability()` and the ARI payload | `services/availability.ts`, `services/channels.ts` |
| Dashboard: arrivals, departures, occupancy by room type, revenue, ADR | Built live (not from last audit) + 14-day forecast | `services/kpis.ts` |
| Individual & group bookings, guest history, rates, upgrades | Built; group blocks with rooming-list import and rolling release | `routes/reservations.ts` |
| Multiple folios, split rate | Built: split folio, transfer lines | `services/folios.ts` |
| Hourly/day-use | Built (`dayUse`, half rate) | `services/rates.ts` |
| Overbooking control | Built (409 with `allowOverbooking` override) | `services/reservations.ts` |
| Connected rooms, market segments | Modelled (`Room.connectedRoomId`, `MarketSegment`) | `schema.prisma` |
| Housekeeping status, progress, task assignment | Built | `routes/housekeeping.ts` |
| Automated night audit | Built: room charges, no-shows, KPIs, HK tasks, date roll | `services/nightAudit.ts` |
| Dynamic pricing, derived rates, LOS/lead restrictions, promo codes | Built (derived plans, restrictions per date, promo codes); geotargeting not built | `services/rates.ts` |
| Weekly/monthly rates | Not built (long-stay rates are a roadmap item) | — |
| Hostel mode (sell beds) | Built (`sellMode: BED`) | `services/availability.ts` |
| Self check-in kiosk, passport scanning | API-ready (guest document fields, digital check-in message); hardware partners are integrations | `services/guestJourney.ts` |
| Pre-arrival / post-stay email automation | Built, plus WhatsApp and upsell | `services/guestJourney.ts` |
| Offline resilience | Not built (needs PWA/service-worker work in the web app) | roadmap |
| Per-user permissions, role-based dashboards, MFA | Partially: API-key scopes and user roles modelled; staff login/MFA is roadmap | `plugins/auth.ts` |
| Add-on packages / activities linked to reservations | Built as a full activities module (sessions, capacity, waitlist, folio posting, public programme) | `services/activities.ts` |
| POS: real-time folio posting, kitchen/allergy notes, recipe stock deduction, revenue by item | Built | `services/pos.ts` |
| POS offline mode | Not built | roadmap |
| Channel manager: two-way ARI, stop-sell, LOS | ARI payload builder, push log, inbound OTA reservation endpoint; live connector credentials are per partner | `services/channels.ts` |
| Booking engine widget, promo codes, online payment | Public availability/quote/book endpoints; payment gateway (Paymob/Kashier/Adyen) is an integration | `routes/public.ts` |
| Inventory: multi-warehouse, documented vs actual consumption, PO authorisation & receiving | Built | `services/inventory.ts` |
| Kwentra Sites (website builder) | Out of scope | — |
| Kwentra Pay (Paymob/Sympl) | Payment method `BNPL` modelled; gateway integration is roadmap | — |
| General accounts (Xero/QuickBooks/SunSystems) | Export via API/webhooks; connectors roadmap | — |
| Multi-property: one login, central reservations, consolidated reporting, Hijri/Gregorian | Built (org → properties, portfolio report, dual calendar) | `services/kpis.ts` |
| Insights mobile app (owner KPIs) | Dashboard/portfolio endpoints are mobile-ready; native app roadmap | — |
| K-AI operations assistant | Rule engine built (rate below floor, low availability, VIP/returning, low stock, PO approval, compliance rejections, departure balances); NL layer roadmap | `services/kpis.ts` `alerts()` |
| Reflectfy-style reputation | Built: review ingestion, sentiment, topics, unanswered count | `services/reviews.ts` |

## What reviewers criticise at Kwentra, and the requirement it becomes

| Complaint (report §11) | Requirement |
| --- | --- |
| Dashboard does not show live occupancy | Dashboard computes from current room/reservation state, refreshes automatically |
| Limited filtering | Reservation list supports status, date range, arrival/departure/in-house day and free-text search; UI ships saved filters |
| Regressions after weekly updates | Test suite on every change (61 API tests, including tenancy and inventory regressions), staged releases with release notes |
| Room-category presentation issues | Room types carry sort order, description, occupancy limits; rack groups by type |

## Non-functional requirements

- Uptime SLA 99.9% (99.95% for group tier), published and credited.
- All money to two decimals; tax computed as service on net, VAT on net + service (configurable per property).
- Every write is auditable (`AuditLog`) and observable (webhooks).
- Same schema on SQLite (dev) and PostgreSQL (prod).
- Phone-width web UI; Arabic UI and RTL are roadmap.
