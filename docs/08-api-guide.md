# 08 · API guide

Interactive docs: `http://localhost:4000/docs` (Swagger UI) · machine-readable: `/openapi.json`.

## Authentication

```
x-api-key: pms_dev_key_ashrafy
```

Keys belong to an organisation and carry scopes: `read` (GET), `write` (mutations), `admin` (minting, listing
and revoking keys). `admin` implies `write`, `write` implies `read`. A key is shown in full only once, when
`POST /api/api-keys` creates it; only its SHA-256 digest is stored, so it cannot be recovered later. Revoke one
with `DELETE /api/api-keys/:id`. Routes under
`/api/public/*`, `/health`, `/docs` need no key. Errors are always `{ "error": { "code", "message", "details" } }`.

## A day at the front desk, in requests

```bash
API=http://localhost:4000/api; K='x-api-key: pms_dev_key_ashrafy'
P=$(curl -s -H "$K" $API/me | jq -r '.properties[] | select(.code=="HRG") | .id')

# What is happening today
curl -s -H "$K" $API/properties/$P/dashboard | jq '.kpis, .rooms'
curl -s -H "$K" "$API/properties/$P/alerts?floorRate=2000"

# Availability and a quote
curl -s -H "$K" "$API/properties/$P/availability?from=2026-10-01&to=2026-10-04"
curl -s -H "$K" -H 'content-type: application/json' -X POST $API/properties/$P/quote \
  -d '{"roomTypeId":"…","ratePlanId":"…","arrival":"2026-10-01","departure":"2026-10-04","promoCode":"REDSEA10"}'

# Reserve, check in, post a bar order, sign up for an excursion
curl -s -H "$K" -H 'content-type: application/json' -X POST $API/properties/$P/reservations \
  -d '{"guest":{"firstName":"Ahmed","lastName":"Hassan","phone":"+2010…","nationality":"EG"},"roomTypeId":"…","ratePlanId":"…","arrival":"2026-10-01","departure":"2026-10-04","source":"WALK_IN"}'
curl -s -H "$K" -X POST $API/properties/$P/reservations/$R/check-in -H 'content-type: application/json' -d '{}'
curl -s -H "$K" -H 'content-type: application/json' -X POST $API/properties/$P/pos/orders \
  -d '{"outletId":"…","roomId":"…","lines":[{"menuItemId":"…","quantity":2}]}'
curl -s -H "$K" -X POST $API/properties/$P/pos/orders/$O/post-to-room -H 'content-type: application/json' -d '{}'
curl -s -H "$K" -H 'content-type: application/json' -X POST $API/properties/$P/sessions/$S/signups -d '{"reservationId":"'$R'","pax":2}'

# Night audit, settle, check out, fiscal document
curl -s -H "$K" -X POST $API/properties/$P/night-audit
curl -s -H "$K" -H 'content-type: application/json' -X POST $API/properties/$P/folios/$F/payments -d '{"amount":4627.12,"method":"CARD"}'
curl -s -H "$K" -X POST $API/properties/$P/reservations/$R/check-out -H 'content-type: application/json' -d '{}'
curl -s -H "$K" -X POST $API/properties/$P/compliance/process
```

## Route families

| Prefix | Purpose |
| --- | --- |
| `/api/me`, `/api/properties`, `/api/users` | Organisation, properties, room types, rooms, staff |
| `…/rate-plans`, `…/rate-grid`, `…/restrictions`, `…/promo-codes`, `…/availability`, `…/free-rooms`, `…/quote` | Rates and availability |
| `/api/guests` | Guest profiles and stay history (organisation-wide) |
| `…/reservations`, `…/group-blocks` | Reservations, check-in/out, cancel, no-show, room assignment, rooming lists |
| `…/folios` | Charges, payments, split, close (queues fiscal document) |
| `…/housekeeping/tasks`, `…/housekeeping/board` | Tasks and room status board |
| `…/dashboard`, `…/alerts`, `…/forecast`, `…/night-audit`, `/api/reports/portfolio`, `/api/calendar/convert`, `/api/audit-log` | Operations and reporting |
| `…/outlets`, `…/pos/orders` | POS, menus, recipes, costing |
| `…/ingredients`, `…/warehouses`, `…/stock`, `…/suppliers`, `…/purchase-orders` | Inventory and procurement |
| `…/activities`, `…/programme`, `…/sessions`, `…/signups` | Activities and entertainment |
| `…/compliance`, `/api/compliance/adapters` | Regulatory submissions |
| `…/channels` | Channel connections, ARI, inbound OTA reservations |
| `…/messages`, `…/reputation`, `…/reviews` | Guest messaging and reputation |
| `/api/webhooks`, `/api/api-keys` | Subscriptions, deliveries, keys |
| `/api/public/pricing`, `/api/public/booking-engine/:propertyId`, `/api/public/programme/:propertyId` | No-key endpoints for websites and guest screens |

## Webhooks

Create a subscription with `POST /api/webhooks { url, events }`; the response contains the signing secret.
Each delivery is `POST` JSON `{ event, occurredAt, data }` with headers `x-pms-event` and
`x-pms-signature` (hex HMAC-SHA256 of the raw body). Failed deliveries are kept and can be retried via
`POST /api/webhooks/deliveries/:id/retry`. Event list: `GET /api/webhooks/events`.
