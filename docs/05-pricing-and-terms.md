# 05 · Pricing and commercial terms

Source: research report Sections 6 and 13 (`research/data/pricing.json`, `competitors.json`).

## What the market looks like

- Kwentra: no public prices, per-room or occupancy-based contracts, Front Office mandatory, non-refundable,
  60 days' notice, no SLA, ADGM law.
- Global cloud PMS starting prices on Hotel Tech Report: USD 500–1,200 per month (ThinkReservations 500,
  Cloudbeds/HOTELTIME/Clock 600, Stayntouch 800, Mews 900, Shiji 1,200).
- Industry corridor: USD 4–15 per room per month; setup USD 500–2,000; small hotel all-in USD 50–200/month;
  mid-size USD 200–800/month.

## Published plans (seeded in `PricingPlan`)

| Plan | Model | Price (USD) | Minimum / month | Setup | Modules | SLA | Cancellation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Essential | per room / month | 6 | 90 | 500 | front office, housekeeping, booking engine, reports, API | 99.9% | 30 days |
| Resort | per room / month | 10 | 250 | 1,200 | + POS, inventory, activities, channel manager, compliance | 99.9% | 30 days |
| Seasonal | per occupied room-night | 0.45 | 60 | 800 | same as Resort | 99.9% | 30 days |
| Group | per room / month | 8 | 1,500 | 2,000 | everything + multi-property, central reservations, consolidated reporting, dedicated experience manager | 99.95% | 30 days |

Worked examples from `GET /api/public/pricing/estimate`:

| Property | Essential | Resort | Seasonal (55% occ.) |
| --- | --- | --- | --- |
| 60 rooms, 12 months | 360/month | 600/month | 451/month |
| 30 rooms, 30% occupancy | 180/month | 300/month | 123/month |

The Seasonal plan is the honest version of Kwentra's occupancy-based model: a Red Sea resort that closes for a
month pays the minimum only, and the calculator shows it before anyone talks to sales.

## Terms to beat Kwentra on (from the T&Cs the report extracted)

| Kwentra | Ashrafy PMS |
| --- | --- |
| Quote-only pricing | Published, in USD with EGP/SAR display at checkout |
| 60 days' written notice before term end | 30 days, any time, effective end of month |
| Non-refundable, non-cancellable | Pro-rated refund on annual plans within 30 days of go-live |
| No SLA | 99.9% uptime, service credits 10% per 0.1% missed |
| Switch models only at renewal | Switch per-room ↔ occupancy at any month end |
| Data deleted within 30 days of termination | 90-day export window, full JSON export via API |
| ADGM governing law | Egyptian entity for Egyptian clients, Saudi entity for Saudi clients |
| Front Office mandatory | Same (it is the core), but every other module is à la carte |

## Go-to-market lifted from Kwentra's playbook (report §12)

- Referral: USD 300 per closed deal, paid quarterly. Champion: 10% of first-year revenue.
- Field workshops at Red Sea hotel groups; a Saudi roadshow before Umrah season.
- Reseller deals with local IT integrators (LOGICSWARE-type firms).
- Reviews: request a Hotel Tech Report / Capterra review at go-live + 30 days and on every closed support ticket
  with a 5/5 CSAT; 30 verified reviews out-ranks Kwentra on every directory.
