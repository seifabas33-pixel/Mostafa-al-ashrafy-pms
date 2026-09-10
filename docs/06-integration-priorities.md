# 06 · Integration priorities

Source: research report Section 9 (`research/data/partners.json`), ordered by what the client base actually
attaches (Section 10: Channel Manager is the most common attach; POS/Back Office at resorts and groups).

| Priority | Category | Partners the market expects | Status in this build |
| --- | --- | --- | --- |
| P0 | Government / fiscal | Egyptian Tax Authority, Ministry of Interior, ZATCA Fatoora, Shomoos, NTMP | Ledger + sandbox adapters (`services/compliance.ts`) |
| P0 | Distribution | SiteMinder (400+ channels), Booking.com, Expedia, STAAH, eZee Centrix, RateGain | ARI builder + push log + inbound reservation endpoint (`services/channels.ts`); partner certification per connector |
| P1 | Payments | Paymob, Kashier (Egypt), Sympl BNPL, Adyen, DPO Group | Payment methods modelled (`CARD`, `BNPL`, `OTA_VIRTUAL_CARD`); gateway tokenisation roadmap |
| P1 | Messaging | WhatsApp Business API, transactional email | Journey scheduler + dispatch endpoint (`services/guestJourney.ts`); provider adapter roadmap |
| P2 | Locks & kiosks | SALTO, VingCard, dormakaba; Ariane, TABHOTEL | Webhook events (`reservation.checked_in`, `room.status_changed`) give lock/kiosk vendors what they need |
| P2 | ID scanning | Samsotech, OpenTEC, Acuant, AdriaScan | Guest document fields ready |
| P2 | Accounting | Xero, QuickBooks, Infor SunSystems | Folio lines + night-audit rows exportable via API; connectors roadmap |
| P3 | Revenue management | Hotel Lab | Rate grid API (`PUT rate-plans/:id/amounts`) accepts RMS pushes |
| P3 | Reputation | ReviewPro, Google, TripAdvisor ingestion | `POST reviews` + summary; scrapers/APIs roadmap |
| P3 | Telecom / spa | Mitel, TNG | Folio charge API |

## Why the API comes first

The report notes Kwentra claims an "open API" but publishes no docs, and that a documented API attracts channel
managers, RMS, locks and local fintechs to integrate with you instead. This build ships:

- OpenAPI 3.1 at `/openapi.json`, Swagger UI at `/docs`, 98 paths.
- Scoped API keys (`read`, `write`, `admin`).
- 19 webhook events with HMAC signatures and delivery retry (`GET /api/webhooks/events`).
- Public endpoints for the booking engine, pricing and guest programme that need no key.

## Certification checklist for a channel connector

1. Map room type and rate plan codes (`externalPropertyId` on `ChannelConnection`).
2. Push ARI daily and on every change (`POST /channels/:id/push`); confirm OOO rooms and stop-sells reach the channel.
3. Deliver reservations to `POST /channels/:id/reservations` with `externalRef`; modifications and cancellations
   reuse the reservation endpoints.
4. Reconcile with `ChannelSyncLog` and the audit log.
