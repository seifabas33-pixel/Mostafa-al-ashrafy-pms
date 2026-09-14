# 07 · Roadmap

The research report's reading order for the team was: §3 feature parity, §8 compliance, §9 integrations,
§6 contract terms, §13 pricing corridor. This roadmap follows that order.

## Delivered in this repository (v0.1)

- Research scrubbed into `research/data` (14 JSON files) and the full report text.
- Data model (45 models), API (98 documented endpoints / 126 operations, OpenAPI), 61 automated tests, seed
  with two properties across two regulatory regimes, React web app with 15 screens.
- Front Office core, POS + recipes + inventory + procurement, activities, compliance ledger, channels bridge,
  guest journey, reputation, pricing calculator, webhooks, audit log, multi-property reporting.

## v0.2 · Pilot-ready (6–8 weeks)

- **Property-local times in the UI.** Every date helper currently renders in UTC, while each property
  carries a configured timezone, so audit, POS, compliance and activity times are shifted from the
  hotel's own clock. Needs a timezone-aware formatter rather than per-call-site patches.
- **Occupancy limits and bed counts on the public booking form.** The room type's `maxAdults` and
  `maxChildren` are not enforced, and a per-bed dorm booking always submits one bed. Needs a bed-count
  control plus server-side enforcement on the public create path.
- Staff authentication: email/password + TOTP MFA, roles → per-screen permissions, session audit.
- ETA e-invoice adapter against the ETA SDK sandbox; MoI report format confirmed with a pilot hotel.
- Paymob and Kashier payment capture on the booking engine and folio; BNPL via Sympl.
- WhatsApp Business provider adapter for the guest journey; Arabic templates.
- PostgreSQL migration files; backups; staging environment; release notes per deploy.
- Reservation modifications (date change with re-quote), room moves with folio transfer, deposits and
  cancellation policies.

## v0.3 · Resort depth (8–10 weeks)

- Offline-tolerant front desk and POS (PWA, queued writes with conflict resolution).
- Weekly/monthly long-stay rates, packages (rate + activities bundle), all-inclusive wristband tracking.
- Housekeeping mobile view with photo attachments and minibar posting.
- Activities: animation-team rota, guest app sign-ups, lobby-screen programme, capacity by age group.
- Channel connectors certified: SiteMinder first (widest reach among Kwentra clients), then STAAH and eZee.
- Accounting export (Xero, QuickBooks) and general-ledger mapping.

## v0.4 · Saudi launch

- ZATCA phase-2 XML, stamping and clearance; Shomoos and NTMP live adapters.
- Arabic UI with RTL; Hijri date pickers.
- Group-block tooling for Umrah operators: rooming-list import from Excel, bus-arrival manifests, central
  reservations across Makkah/Madinah properties.
- Saudi entity, SAR billing, roadshow content.

## v1.0 · Platform

- Natural-language operations assistant on top of the alert engine (the K-AI equivalent), with actions
  (apply stop-sell, adjust rate) executed through the same audited services.
- Review ingestion from Google, Booking.com and TripAdvisor; response drafting.
- Owner mobile app (KPIs across the portfolio in both calendars).
- Marketplace listing: Hotel Tech Report, ExploreTECH; partner programme with referral and reseller tiers.

## Metrics to track from day one

- Verified public reviews (target 30 within 12 months; Kwentra has 7 in 12 years).
- Time to go-live (target under 48 hours, matching Kwentra's promise) and time to first fiscal acceptance.
- Uptime against the 99.9% SLA, and release regressions caught by tests vs reported by clients.
