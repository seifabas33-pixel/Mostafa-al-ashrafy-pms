# 02 · Architecture

Source: research report Section 5 (Kwentra's observed stack) and Section 14 (what to do differently).

## Kwentra, as fingerprinted

Python/Django with server-rendered templates, Metronic 4.7.5, Bootstrap 3.0.2, jQuery 2.0.3, a hash-routed
front-office app, one database schema per property with an external consolidation service, GCP containers, no
public API documentation. See `research/data/architecture.json`.

## Ashrafy PMS

```
┌──────────────┐   HTTPS/JSON    ┌───────────────────────────────┐   Prisma   ┌────────────┐
│ apps/web     │ ──────────────▶ │ apps/api (Fastify 5, Node 22) │ ─────────▶ │ SQLite dev │
│ React + Vite │  x-api-key      │  routes → services → prisma   │            │ Postgres   │
└──────────────┘                 │  zod validation, OpenAPI 3.1  │            └────────────┘
       ▲                         │  webhooks (HMAC), audit log   │
       │ public, no key          │  compliance adapters          │──▶ ETA / MoI / ZATCA / Shomoos / NTMP
 booking engine, programme,      │  channel ARI builder          │──▶ SiteMinder / STAAH / Booking.com …
 pricing calculator              └───────────────────────────────┘──▶ WhatsApp / email provider
```

### Tenancy

Row-level: `Organization → Property`, and every operational table carries `propertyId`. One database serves a
20-hotel group; the portfolio report is a query, not an ETL job. This is the "do multi-property from the start"
recommendation. A schema-per-tenant option remains possible later because no query crosses organisations.

### Layers

- **routes/**: HTTP only. Zod schemas validate input and generate OpenAPI. Property ownership is checked with
  `requireProperty` on every property-scoped route.
- **services/**: all business rules (availability, quoting, reservations, folios, night audit, POS, inventory,
  activities, compliance, channels, guest journey, reviews, pricing, webhooks). Services are what tests exercise.
- **prisma/**: schema and seed. String-typed enums keep SQLite and PostgreSQL identical.

### Transactions and side effects

Interactive Prisma transactions wrap multi-row writes (reservation + folio, POS post + stock deduction, PO
receipt). Side effects (webhook emission, guest-journey scheduling) run after commit, and audit rows are written
inside the transaction through the same client. SQLite runs in WAL mode for local development.

### Time and calendars

All stay dates are UTC-midnight `Date` values; the API speaks `YYYY-MM-DD`. Each property has a `businessDate`
advanced only by the night audit, so operations do not depend on wall-clock midnight. Hijri dates come from
ICU's Umm al-Qura calendar (`lib/dates.ts`), used in dashboards and the portfolio report.

### Money and tax

`computeTax(net, vat, service)` applies service charge on net, then VAT on net + service. Egypt defaults to
14% VAT / 12% service; Saudi to 15% VAT / 0% service. Every folio line stores net, service and tax separately so
fiscal payloads (ETA, ZATCA) are exact.

### Security

- API keys per organisation with `read`, `write`, `admin` scopes (`admin` implies `write`, `write` implies
  `read`); `lastUsedAt` tracking. Keys are stored as a SHA-256 digest alongside a non-secret prefix, so a
  database copy yields no usable credential; the plaintext is returned once at creation. Minting, listing and
  revoking keys require the `admin` scope, so a leaked write key cannot escalate itself.
- Tenancy is enforced twice: `requireProperty` proves the property in the URL belongs to the caller, and
  `lib/ownership.ts` proves every foreign key in the request body belongs to that same tenant. Without the
  second check a caller can attach another tenant's row to their own record and read it back through an
  `include`.
- Webhook targets are restricted to public https endpoints, re-resolved before every delivery and sent with
  redirects disabled, so a subscription cannot be pointed at the internal network.
- Unhandled errors return a generic message and a request id; the detail stays in the server log, because
  database errors carry model, field and constraint names.
- Webhook deliveries signed with HMAC-SHA256 (`x-pms-signature`).
- Audit log on every state change; no PII in logs beyond names needed for operations.
- Staff authentication (sessions, MFA, per-screen permissions) is a roadmap item; API keys are the day-one
  integration surface the report says Kwentra lacks.

### Front end

React 18 + Vite, plain CSS with variables, no jQuery, responsive to phone width. Data hooks call the API through
one fetch helper; the property switcher and API key live in local storage.

### Deployment

Node 22 container for the API, static hosting for the web build, PostgreSQL managed service. The API is
stateless; compliance and message dispatch can run from a cron hitting `/compliance/process` and
`/messages/dispatch`, or from a worker later.
