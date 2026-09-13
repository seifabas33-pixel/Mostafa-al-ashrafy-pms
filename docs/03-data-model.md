# 03 · Data model

Full schema: `apps/api/prisma/schema.prisma` (45 models). Grouped by domain:

| Domain | Models | Notes |
| --- | --- | --- |
| Tenancy & access | Organization, Property, User, ApiKey | Property holds currency, tax regime (`EG_ETA`, `SA_ZATCA`, `QA`, `NONE`), VAT/service rates, `businessDate`, calendar preference |
| Rooms & rates | RoomType, Room, RatePlan, RateAmount, Restriction, PromoCode, MarketSegment | `RoomType.sellMode = BED` for hostels; `RatePlan.derivedFromId` + pct/amount for derived rates; restrictions per date, optionally per room type / rate plan |
| Guests & stays | Guest, GroupBlock, GroupBlockLine, Reservation, ReservationNight, Folio, FolioLine | Nights store the agreed rate and a `posted` flag consumed by the night audit; folio lines store net/service/tax separately |
| Housekeeping & audit | HousekeepingTask, NightAuditRun | Night audit rows are the source of historical KPIs |
| F&B & stock | Outlet, MenuItem, RecipeLine, Ingredient, Warehouse, StockLevel, StockMovement, PosOrder, PosOrderLine, Supplier, PurchaseOrder, PurchaseOrderLine | Outlet → warehouse for recipe deduction; every movement carries a reason (`POS_SALE`, `PO_RECEIPT`, `WASTAGE` …) |
| Activities | Activity, ActivitySession, ActivitySignup | Signups can be `WAITLIST`; paid activities post to the folio |
| Distribution & compliance | ChannelConnection, ChannelSyncLog, ComplianceSubmission | Submissions keep payload and authority response as JSON strings |
| Guest layer | GuestMessage, Review | Messages are scheduled with templates; reviews carry sentiment and topics |
| Integration | WebhookSubscription, WebhookDelivery, AuditLog | Deliveries retain attempts and last error for retry |
| Commercial | PricingPlan, PropertySubscription | Published tiers with SLA and cancellation days |

## Status vocabularies

| Field | Values |
| --- | --- |
| Reservation.status | CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, NO_SHOW |
| Reservation.source | DIRECT, BOOKING_ENGINE, OTA, WALK_IN, GROUP, API |
| Room.status / hkStatus | VACANT, OCCUPIED, OUT_OF_ORDER, OUT_OF_SERVICE / CLEAN, DIRTY, INSPECTED, IN_PROGRESS |
| Folio.kind / status | MASTER, SPLIT, GROUP_MASTER, HOUSE / OPEN, CLOSED |
| FolioLine.kind / category | CHARGE, PAYMENT, ADJUSTMENT / ROOM, FNB, ACTIVITY, SPA, MISC, PAYMENT |
| PosOrder.status | OPEN, POSTED_TO_ROOM, PAID, VOID |
| PurchaseOrder.status | DRAFT, PENDING_APPROVAL, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED |
| ActivitySignup.status | BOOKED, WAITLIST, ATTENDED, NO_SHOW, CANCELLED |
| ComplianceSubmission.type | ETA_EINVOICE, ETA_ERECEIPT, MOI_GUEST_REPORT, ZATCA_INVOICE, ZATCA_CREDIT_NOTE, SHOMOOS_GUEST, NTMP_REPORT |
| ComplianceSubmission.status | PENDING, SUBMITTED, ACCEPTED, REJECTED |
| GuestMessage.template | PRE_ARRIVAL, DIGITAL_CHECKIN, UPSELL, POST_STAY_REVIEW, CUSTOM |

## Key invariants

- `availability = (rooms − out_of_order) × units_per_room − booked − unpicked_block_rooms`, per night.
- A reservation always has a MASTER folio; check-out requires every folio balance to be zero (or `force`).
- Night audit is idempotent per (property, business date) and is the only thing that advances `businessDate`.
- Stock is only changed through `StockMovement` rows; `StockLevel` is the cached sum.
