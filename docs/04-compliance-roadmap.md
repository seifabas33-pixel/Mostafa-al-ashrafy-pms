# 04 · Compliance roadmap

Source: research report Section 8 (`research/data/compliance.json`). The report calls this Kwentra's most
defensible differentiator and "the area a new entrant must budget for first", with the sequence:
Egypt first, then Saudi, with Hijri/Gregorian reporting throughout.

## What is implemented

`apps/api/src/services/compliance.ts` is a compliance ledger plus adapter registry:

| Trigger | Regime `EG_ETA` | Regime `SA_ZATCA` |
| --- | --- | --- |
| Reservation check-in | `MOI_GUEST_REPORT` (Ministry of Interior guest data) | `SHOMOOS_GUEST` + `NTMP_REPORT` |
| Folio close | `ETA_EINVOICE` | `ZATCA_INVOICE` |
| Manual | `ETA_ERECEIPT`, `ZATCA_CREDIT_NOTE` | |

Each submission is a row with status `PENDING → ACCEPTED/REJECTED`, the exact payload sent, the authority
response, an external reference, attempt count and last error. `POST /compliance/process` drains the queue;
`POST /compliance/:id/retry` re-runs one. Rejections surface as CRITICAL alerts on the dashboard.

Adapters currently run in **sandbox mode**: they build the real payload shape (issuer, receiver with document
number, per-line net/service/VAT, totals; or establishment + guest identity + stay for guest reporting) and return
a synthetic acceptance. This makes the whole workflow testable before credentials exist.

## Phase plan

### Phase 1 · Egypt (launch requirement)

1. **ETA e-invoice / e-receipt** (Egyptian Tax Authority, SDK-based signing). Work: register the property as a
   taxpayer device, implement the document schema (`issuer`, `receiver`, `taxTotals`, `invoiceLines` with GS1/EGS
   item codes), sign with the HSM/USB token, submit and poll status, store the UUID as `externalRef`. Handle
   B2C e-receipts for POS outlets.
2. **Ministry of Interior guest reporting**: nightly transmission of the arrivals list with passport/ID data;
   confirm the exact channel (portal upload or API) per governorate with the client's security liaison.
3. Both submissions already carry the required guest fields (`documentType`, `documentNumber`, `nationality`,
   `dateOfBirth`); the digital check-in message collects them before arrival.

### Phase 2 · Saudi Arabia (Umrah market)

1. **ZATCA Fatoora phase 2**: XML (UBL 2.1) invoices, cryptographic stamp, QR code, clearance for B2B and
   reporting for B2C within 24h; credit notes for refunds. `ZATCA_INVOICE` and `ZATCA_CREDIT_NOTE` map to these.
2. **Shomoos**: guest identity transmission at check-in (`SHOMOOS_GUEST`).
3. **NTMP**: Ministry of Tourism occupancy and guest statistics (`NTMP_REPORT`); nightly aggregation from
   night-audit rows is already available in `portfolioReport`.
4. Hijri reporting is live: business dates, dashboards and the portfolio report carry both calendars.

### Phase 3 · Qatar and others

Passport scanning (OpenTEC/Samsotech) and SITA iBorders feed the same guest-report payload; add a `QA` regime
entry in `requiredTypes()`.

## Operational rules

- Never close a folio without a fiscal document queued; the close route does this automatically.
- Rejected submissions block nothing operationally but stay visible until resolved (alerts + compliance page).
- Keep `payload` and `response` for the statutory retention period (5 years) — they are never deleted with the folio.
