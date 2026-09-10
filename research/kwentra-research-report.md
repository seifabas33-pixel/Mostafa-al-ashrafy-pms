# Kwentra PMS — Competitive Research Report (scrubbed text)

Source: `research/Kwentra_PMS_Research_Report.pdf` (17 pages, dated 8 September 2026, prepared for Seif Abas).
This file is the machine-extracted text with page headers removed. Tables were flattened by the extractor, so
one table cell appears per line; the structured versions of every table live in `research/data/*.json`.

<!-- page 1 -->
Kwentra PMS
Competitive Research Report — everything publicly available about the
platform, its company, pricing, clients, integrations and market position
Prepared for: Seif Abas
Purpose: reference material for a similar hotel property-management-system project
Date: 8 September 2026
Coverage: kwentra.com (all public pages), resources.kwentra.com (blog & news), login portal
fingerprint, Hotel Tech Report, Capterra / GetApp / Software Advice, ExploreTECH, Crunchbase, The
Org, ZoomInfo, Google Play & App Store, partner sites
Confidence note: figures are as published by Kwentra or third-party directories on the dates cited.
Items marked [unverified] appear in one source only or conflict between sources.

<!-- page 2 -->
Contents

- 1. Executive summary

- 2. Company profile & leadership

- 3. Product suite — core modules

- 4. Add-ons, K-AI and the Reflectfy acquisition

- 5. Technical architecture (observed)

- 6. Pricing model & commercial terms

- 7. Onboarding, support & localisation

- 8. Regulatory & compliance integrations

- 9. Integration partner ecosystem

- 10. Client base by country

- 11. Market reception — ratings & reviews

- 12. Go-to-market, sales channels & marketing

- 13. Competitive landscape & price benchmarks

- 14. Gaps and opportunities for your project

- 15. Caveats and unverified claims

- 16. Sources

<!-- page 3 -->

## 1. Executive summary
Kwentra is a cloud-based, all-in-one hospitality management system aimed at independent hotels,
resorts and small-to-mid-size chains in the Middle East and Africa. The brand launched around
2013–2014 out of Cairo under the company CloudInn (legal operating entity CLOUDINN FOR SOFTWARE
S.A.E.; contracting entity Cloud Hospitality Tech Ltd, registered in Abu Dhabi Global Market). It is led by
co-founder and CEO Mai Shalaby, with CTO Ahmed Toulan and VP Sales Loay Sherif, and employs
roughly 35 people (directories list 11–50).
The product is sold as an ecosystem rather than a single PMS: Front Office (the mandatory core,
marketed as 300+ features), Point of Sale with recipe management, Channel Manager, Booking Engine,
Inventory & Procurement, plus add-ons for website building (Kwentra Sites), payments (Kwentra Pay via
Paymob/Sympl), general accounting and Multi-Property. Since April 2026 the company has been
pushing K-AI, a conversational operations assistant, and on 7 September 2026 it announced the
acquisition of Reflectfy, an AI review-and-sentiment platform, to add reputation management.
Commercially, Kwentra does not publish prices. Contracts are either per-room-per-month or
occupancy-based (pay per guest actually staying), with the Front Office module as the minimum. Terms
are non-refundable, require 60 days' cancellation notice and carry no uptime SLA. Go-live is promised
within 48 hours and training is delivered through a self-serve Help Center plus a dedicated Experience
Manager.
Kwentra's strongest assets are its regional compliance depth (Egyptian Tax Authority e-invoicing,
Ministry of Interior guest reporting, Saudi ZATCA/Shomoos/NTMP, Hijri and Gregorian reporting), a Red
Sea and Saudi client roster of roughly 37 named properties or groups, a partner list of about 45
integrations, and an aggressive field marketing programme (hotel workshops, a Saudi roadshow,
referral commissions). Its weaknesses are equally visible: only 7 public reviews (4.8/5 but ranked #57 of
357 PMSs on Hotel Tech Report), zero reviews on Capterra/GetApp, a visibly dated front-end stack
(Django templates, Metronic 4.7.5, Bootstrap 3.0.2, jQuery 2.0.3), recurring complaints about
dashboards and filtering, and opaque pricing.
What this means for a similar project: the market Kwentra serves is real and under-reviewed, the
compliance integrations are the true moat, and a modern, transparent, mobile-first entrant with published
pricing and an open API would attack exactly where Kwentra is thinnest. Section 14 details this.

## 2. Company profile & leadership
Brand / product
kwentra (styled lower-case), tagline “The hospitality ecosystem for tomorrow”
Operating company
CLOUDINN FOR SOFTWARE S.A.E. (Egyptian joint-stock company) — the publisher
of record on Google Play and the App Store
Contracting entity
Cloud Hospitality Tech Ltd, governed by the laws of ADGM (Abu Dhabi Global
Market), UAE — per Terms & Conditions
Founded
2013 (company boilerplate, Hotel Tech Report); ExploreTECH lists product launch
2014 and Channel Manager launch 2018; Crunchbase founding date hidden
Headquarters
Cairo, Egypt (Crunchbase, The Org, ZoomInfo). Hotel Tech Report lists Abu Dhabi,
UAE. Facebook page located in Giza. Sales offices/representatives across Europe,
Middle East and Africa (About page)
Headcount
35 (Hotel Tech Report); 11–50 (Crunchbase, The Org, ZoomInfo)
Revenue
Under USD 5 million (ZoomInfo estimate) [unverified]
Funding / investors
None disclosed on Crunchbase; no rounds or investors listed
Mission statement
Make powerful property-management technology accessible to the independent
hospitality operator
Positioning claims
“Fastest-growing cloud-based PMS in MENA”; “used in more than 20 countries”;
“over 800 capabilities” across the ecosystem (Sept 2026 boilerplate); Front Office
“300+ features”; “save 4 hours per day”; “up to 70% reduction in IT expenses”

<!-- page 4 -->
Web traffic
~63,000 monthly visits (Crunchbase estimate); Crunchbase growth score 85, heat
score 59
Social
Facebook 5.6K+ followers (Giza page); Instagram, X/Twitter, LinkedIn
(linkedin.com/company/kwentraecosystem)
Domains
www.kwentra.com (marketing), resources.kwentra.com (blog/news, WordPress),
manage.kwentra.com (production app), test.kwentra.com (test/demo
environment), media.kwentra.com (assets), kwentra.supporthero.io (Help Center,
login-gated)
Contact
info@kwentra.com; partnership/integration enquiries rashi@kwentra.com
(ExploreTECH)
Leadership and named staff
Name
Role
Source / notes
Mai Shalaby
Co-founder & CEO (also listed as COO)
The Org; Kwentra news (HTLF Dubai Feb 2023;
ITB Berlin takeaways blog, Mar 2026)
Ahmed Toulan
Chief Technology Officer
The Org
Loay Sherif
Vice President of Sales
The Org
Rashi Srivastava
Head of Partnership & Distribution, GCC
Kwentra news (HTLF Dubai); ExploreTECH
integration contact
Amr Negm
Listed on The Org profile (role not
captured)
theorg.com/org/kwentra?p=amr-negm
Mahmoud Seleem
Social Media Marketer
ZoomInfo
Youssef Siam
Engineer who built Reflectfy (acquired
Sept 2026)
Kwentra news
Corporate timeline (from public statements)
When
Event
2013–2014
Company founded by hoteliers and technologists; product launch under the CloudInn name
(Android package still net.cloudinn.managementapp)
2018
Channel Manager launched (ExploreTECH)
2020–2021
kwentra Insights mobile app released (iOS copyright 2020–2021)
Jan 2023
“Empowering Hoteliers of Tomorrow” initiative for tourism/hotel students
Feb 2023
CEO and GCC partnerships head speak at Dubai’s first Hospitality Technology Leaders Forum
Mar 2026
CEO attends ITB Berlin; publishes takeaways
Apr 2026
K-AI operations assistant announced (blog 15 & 30 Apr)
Jun–Jul 2026
K-AI workshop series across Sahl Hasheesh, Hurghada and Sharm El-Sheikh (SRNTY, Ivy,
Amphoras, Dreams, EVC)
Aug–Sep 2026
Saudi Arabia roadshow: Fanaya Hotel Jeddah, Sedra Hotels Madinah, Golden Tulip Al Shakreen
Madinah
23 Aug 2026
kwentra Insights app updated on Google Play
7 Sep 2026
Acquisition of Reflectfy (AI reputation management) announced; terms undisclosed

<!-- page 5 -->

## 3. Product suite — core modules
Kwentra sells six product areas plus add-ons. The Front Office module is contractually mandatory;
everything else attaches to it. Feature lists below merge the product page, FAQ, Hotel Tech Report
feature checklist and the ExploreTECH vendor listing.

### 3.1 Front Office (core PMS)
Area
Capabilities described
Room Rack
Drag-style rack for check-in/out, cleaning and maintenance status, add-on packages, deposits,
upgrades; rooms can be set out-of-order (blocks sales on all channels) and back in order
Dashboard
Arrivals/departures, occupancy by room type, revenue and daily rate at a glance (reviewers ask
for a better live-occupancy view)
Reservations
Individual and group bookings, guest preferences/history, rates and upgrades, multiple folios with
split-rate, hourly/day-use, overbooking control, connected rooms, market-segment tracking
Group blocks
Block tracking, rooming-list import, group booking portal, batch charge posting, rolling release
(ExploreTECH listing)
Housekeeping
Room status, housekeeping progress, task assignment
Night audit
Automated night audit (marketed as rare among PMSs); manual reconciliation remains optional
Rates
Dynamic pricing by availability/volume, derived rates, lead-day and length-of-stay restrictions,
weekly/monthly rates, promo codes, geotargeted pricing module
Hostel mode
Sell individual beds as separate reservations while keeping private-room option
Guest journey
Self check-in via tablet/kiosk (Ariane, TABHOTEL), digital registration and e-logbook, passport
scanning (Samsotech, OpenTEC, Acuant, AdriaScan), pre-arrival and post-stay email automation
Offline resilience
Front Office caches activity locally during internet outages and syncs on reconnect
Access control
Per-user screen and report permissions; role-based dashboards; MFA listed by ExploreTECH
Add-on packages
Link activities and supplementary services for cross-sell/up-sell via Front Office, Booking Engine
or Channel Manager

### 3.2 Point of Sale & Recipe Management
• Real-time posting of F&B and outlet charges to the guest folio in Front Office; multiple payment
methods.
• Kitchen instructions and allergy notes passed to the kitchen; touch-screen compatible; works with
any receipt printer (no proprietary hardware).
• Recipe management deducts ingredients from stock automatically; revenue tracked by menu item;
tax and accounting reports generated.
• Automatic offline mode during connectivity loss; cashier-level tracking (client testimonial).

### 3.3 Channel Manager (launched 2018)
• Two-way sync of rates and availability; one setup for all channels; single-click rate updates across
room types; stop-sell, length-of-stay and overbooking controls.
• Direct connections cited: Booking.com (43 languages), Expedia (70+ countries); via SiteMinder 400+
channels; also SmartHOTEL, eZee Centrix (100+ OTAs), STAAH, Book Online Now (550+
integrations), RateGain (Three Corners), YieldPlanet, MyAllocator, eRevMax, Yanolja Cloud.
• Requires Kwentra PMS — not sold standalone. Channel-performance reporting included.

### 3.4 Booking Engine
• Embeddable widget for the hotel website; availability auto-updated from Front Office;
mobile-optimised; SSL.

<!-- page 6 -->
• Promotional codes, sell rooms or beds, pre-arrival add-on services; online payment at booking via
Adyen, Paymob and others.

### 3.5 Inventory Management & Procurement (Back Office)
• Multi-warehouse stock allocation and cross-warehouse availability; documented vs actual
consumption comparison.
• Purchase-order creation with authorisation permissions and warehouse receiving workflow;
procurement automation for high-volume groups (Maysan, Dar Al Eiman).

## 4. Add-ons, K-AI and the Reflectfy acquisition
Add-on
What it is
Notes
Kwentra Sites
Website builder with copywriting, photography and
embedded booking widget
Used by Parkside Avenue, Onatti Beach
Resort
Kwentra Pay
Payment layer on Paymob and Sympl; flexible
methods incl. Buy-Now-Pay-Later
Egypt-centric; used by Amphoras,
Parkside Avenue
General Accounts
AP, reconciliation, invoice management linking
revenue, payments and expenses
Also integrates Xero, QuickBooks, Infor
SunSystems
Multi-Property
One login for all hotels, central reservations
(view/move bookings across properties), central
back office (procurement, financial consolidation,
inventory), cross-property KPIs in Hijri and
Gregorian calendars
Separate database schema per property;
consolidated reporting via service layer;
positioned around Umrah-season peaks
kwentra Insights app
Owner/GM mobile dashboard: occupancy, revenue,
ADR, RevPAR, GOP; single or multi-property
iOS 10.1+/Android; v1.8.1; 52 MB; 500+
downloads; 5.0★ (5 ratings); updated 23
Aug 2026; publisher CLOUDINN FOR
SOFTWARE
Mobile App (front
office)
Listed for several Sinai clients (Tamra Beach, Sharm
Reef, Club Reef, Labranda)
Scope not documented publicly

### 4.1 K-AI — operations assistant (announced April 2026)
K-AI is described as a personal assistant for hotel operations that staff address with plain-language
commands or questions instead of navigating menus. Publicly listed capabilities: instant retrieval and
analysis of operational data; real-time monitoring of inventory, bookings and revenue; detection of
pricing exceptions (e.g. rooms sold below a threshold rate), VIP and returning-guest bookings and
reservations with special conditions; execution of authorised actions such as applying stop-sell,
adjusting pricing/yield controls and escalating issues to management in one click; proactive alerts on
revenue or operational risk. Workshop coverage adds automated report generation and live sentiment
tracking. Scope today is Front Office only; other modules are on the roadmap. No quantified
performance claims are published.
Example prompts Kwentra uses in its own material: checking any date this month with fewer than five rooms available,
or flagging any room booked below EUR 70 today.

### 4.2 Reflectfy acquisition (7 September 2026)
Reflectfy is an AI reputation-management platform combining review aggregation, sentiment analysis
and AI insights, built by engineer Youssef Siam. Kwentra will fold it into the platform to connect
operational performance with guest sentiment. No price or deal structure disclosed. Strategically this
moves Kwentra into territory currently covered by its partner ReviewPro (Shiji) and signals a
build-vs-partner shift toward owning the guest-feedback layer.

## 5. Technical architecture (observed)

<!-- page 7 -->
Fingerprinted from the public login portal (manage.kwentra.com), vendor listings and the FAQ. No
proprietary data was accessed.
Hosting
Google Cloud Platform, containerised deployment (FAQ; ExploreTECH). Company
relies on Google's security standards plus periodic third-party audits
Backend
Python/Django — evidenced by csrfmiddlewaretoken, /account/login/?next=
redirect pattern and /static/ layout on manage.kwentra.com
Web front end
Server-rendered Django templates using the Metronic v4.7.5 admin theme,
Bootstrap 3.0.2, jQuery 2.0.3 and Font Awesome 4.7 from cdnjs; Front Office app
served at /frontoffice/#/home (hash-routed single-page app, framework not
exposed on the login screen). No React, Vue or modern Angular detected
Multi-tenancy
Separate database schema per property; consolidated reporting through an
external service layer; single sign-on across properties (ExploreTECH)
Offline behaviour
Local caching in Front Office; automatic offline mode in POS
Mobile
kwentra Insights — native/hybrid app on both stores; package id
net.cloudinn.managementapp
API
“Open API” for custom integrations is claimed by ExploreTECH; no public developer
portal or documentation found
Security & compliance
claims
GDPR-aligned processing (T&Cs); ExploreTECH lists SOC I & II, MFA, encryption,
vulnerability assessments [unverified — not repeated on kwentra.com]
Scale claim
“Supports 500+ properties” (ExploreTECH) [unverified]
Release cadence
Weekly updates (Multi-Property blog); one reviewer reports package-management
regressions after updates
Environments
manage.kwentra.com (production), test.kwentra.com (test/demo),
testwww.kwentra.com (staging marketing site)
Marketing site
WordPress (resources.kwentra.com); languages English/Arabic; product video at
media.kwentra.com/preview.mp4
Help Center
SupportHero (kwentra.supporthero.io), login-gated; interactive guides and videos
embedded on every screen; 30-minute walkthrough per module

## 6. Pricing model & commercial terms
Kwentra publishes no price list. Every directory (Hotel Tech Report, Capterra, GetApp, Software Advice)
shows “contact vendor”. The FAQ refers to a pricing calculator but none is exposed on the public site;
the Get-Started page is a demo-booking form only (email, country, calendar slot). The terms and
conditions, however, disclose the structure:
Term
Detail (from kwentra.com/terms-and-conditions and FAQs)
Pricing models
(a) Per-room-per-month fixed subscription; (b) occupancy-based — fee varies with guests
actually in-house, marketed for seasonal properties (“only pay based on the number of
guests”). Occupancy-based can result in zero charge for a closed or under-performing period
Minimum scope
Front Office module must be included in every subscription
Implementation fee
Listed by ExploreTECH (amount not disclosed); not mentioned in T&Cs
Switching models
Allowed only when the current subscription term expires
Billing
Card on file charged through the term, or invoice: per-room fees payable net 30 days;
occupancy-based invoiced no later than 45 days after period start. Fees exclude VAT/taxes
Upgrades /
downgrades
Upgrades pro-rated to next billing date; downgrades limited, no refunds, effective at term end
Refunds
All payment obligations non-cancellable; all amounts non-refundable
Cancellation
Written notice 60 days or more before subscription expiry; data permanently deleted from
backups and logs within 30 days of termination
Non-payment
Notice, then suspension possible 10 days later; re-activation fees may apply

<!-- page 8 -->
Term
Detail (from kwentra.com/terms-and-conditions and FAQs)
Vendor termination
Kwentra may suspend or terminate accounts for any reason at any time
SLA / uptime
None. Warranty disclaimer: no guarantee of uninterrupted or error-free operation
Liability
No liability for lost profits or indirect/consequential damages; not responsible for
third-party-caused data loss
Data protection
GDPR-style processing; data retained as long as necessary for the service; five-year
confidentiality
Governing law
ADGM (Abu Dhabi Global Market), UAE; CISG excluded
Free trial
Capterra lists a free trial as available; Software Advice says none — [conflicting]. Demo is free
Market context for what Kwentra likely charges
Industry benchmarks for cloud PMS in 2026 put per-room pricing at roughly USD 4–15 per room per
month, flat-fee tiers at USD 50–95 (entry), 150–300 (mid) and 400–600+ (advanced), setup/onboarding at
USD 500–2,000, and payment processing at 1–3% plus a per-transaction fee. Hotel Tech Report lists
starting prices for Kwentra's main global alternatives at USD 500–1,200 per month (Section 13). Kwentra's
occupancy-based option and its Egyptian-pound client base suggest it prices well below the global tier —
but no Kwentra figure is public.

## 7. Onboarding, support & localisation
Go-live
Ecosystem provisioned within 48 hours of registration; data migration from
previous systems offered
Setup method
Dedicated Experience Manager runs a kick-off and customised plan; template tax
and pricing configurations pre-loaded and editable
Training
Self-serve Help Center with interactive guides and videos on every screen;
30-minute walkthrough per module; one-to-one follow-ups; classroom training
discouraged as disruptive and costly (directories nonetheless list in-person,
webinars, live online)
Support
24/7 support staff; dedicated Experience Manager per client; 24-hour response
commitment; channels: chat, email, phone, knowledge base; regional office-hours
support in Middle East & Africa
Languages
FAQ says seven languages but lists six: English, Arabic, Dutch, French, Spanish,
Portuguese; ExploreTECH lists English and Arabic only; app store: English
Hardware
Browser only (Chrome/Firefox recommended); works on mobile data; POS uses any
receipt printer
Currency & tax
Multi-currency; any currency via chosen payment gateway; highly configurable tax
definitions per country
Reporting calendars
Financial reports in both Hijri and Gregorian calendars

## 8. Regulatory & compliance integrations
This is Kwentra's most defensible differentiator against global PMS vendors, and the area a new entrant
must budget for first.
Market
Requirement
Kwentra implementation
Egypt
Egyptian Tax Authority (ETA)
e-invoicing / e-receipt
“ETA integration” or “ETA compliance” listed for most
Egyptian clients (Mosaique, Tamra, Amphoras, Sharm Reef,
Club Reef, Labranda, Gemma, Caesar Bay, Three Corners)
Egypt
Ministry of Interior / Ministry of Internal
Affairs guest reporting
Automated reporting cited for Three Corners Hotels
Saudi Arabia
ZATCA e-invoicing (Fatoora platform)
Direct integration: instant tax invoices and credit notes at
checkout; instant VAT reports

<!-- page 9 -->
Market
Requirement
Kwentra implementation
Saudi Arabia
Shomoos (security guest-data system)
Automated secure transmission of guest data and reports;
removes manual entry
Saudi Arabia
National Tourism Monitoring Platform
(NTMP), Ministry of Tourism
Real-time automatic submission of guest data and required
reports
Saudi Arabia
ZTCA regulations (as listed for Velar
Inn)
Compliance flagged on client page
Qatar
Border/security and ID
SITA iBorders, Opentec passport scanning, SALTO
communications at The Grand Lux Hotel
Region
Hijri calendar reporting; Arabic UI
Native in Multi-Property reporting and UI
EU
GDPR
Referenced in terms; ReviewPro/DigitalGuest partners are
EU-based

## 9. Integration partner ecosystem (~45 named)
From the Partners page, client pages, Hotel Tech Report (24 listed) and ExploreTECH (19 listed). Hotel
Tech Report counts 18 verified partners versus Hotelogix's 25.
Category
Partners
OTAs & distribution
Booking.com, Expedia, Hotels.com, SiteMinder (400+ channels), SmartHOTEL, eZee
Centrix, STAAH, Book Online Now, RateGain, YieldPlanet, MyAllocator, eRevMax, Yanolja
Cloud Solution
Payments
Adyen, Ingenico, Paymob, Sympl (BNPL), Kashier, DPO Group, CCV
Guest experience, upsell &
reputation
Oaky (by Plusgrade), ReviewPro (Shiji), DigitalGuest, WeBee, MyStay, James & Rita
(restaurant, guest app, guest manager, maintenance); Reflectfy (acquired)
Kiosks & self check-in
Ariane (Allegro v7 cloud), TABHOTEL
Door locks & access
SALTO Systems, Hotek, VingCard (Assa Abloy), dormakaba; electronic locks at Three
Corners
ID / passport scanning
Samsotech, OpenTEC, Acuant, AdriaScan
Telecom, spa, facilities
Mitel, LOGICSWARE (Egypt), TNG spa/fitness
Accounting / ERP
Xero, QuickBooks, Infor SunSystems
Revenue management
Hotel Lab (dynamic pricing, competitor tracking)
Security / government
SITA iBorders (Qatar), ZATCA Fatoora, Shomoos, NTMP, Egyptian Tax Authority

<!-- page 10 -->

## 10. Client base by country
Thirty-seven named clients or groups appear on the Clients page and in 2026 news. Egypt dominates,
concentrated on the Red Sea and Sinai coasts; Saudi Arabia is the growth market (Makkah/Madinah
pilgrimage hotels). Module mix per client shows Front Office is universal, Channel Manager is the most
common attach, and POS/Back Office attach mainly at resorts and groups.
Egypt (18)
Client
Location
Modules / integrations
Three Corners Hotels (4+ resorts,
1,700+ rooms)
Marsa Alam
Front Office, payment gateway, RateGain channel
manager, advanced reporting, electronic locks, ETA +
Ministry of Interior reporting
Tropitel Hotels & Resorts
Sahl Hasheesh,
Dahab, Hurghada
PMS; front-of-house optimisation; 2026 expansion
Amphoras Hotels (Beach, Blu,
Aqua)
Sharm El-Sheikh
Front Office (ETA), Back Office, Channel Manager, Kwentra
Pay; Booking.com, Expedia; K-AI workshop Jul 2026
Strand Beach & Golf Resort
Taba
Front Office, POS, Channel Manager, Oaky, ReviewPro
Mosaique Beach Resort
Taba
Front Office (ETA), POS, Channel Manager, Oaky,
ReviewPro
Tamra Beach Resort
Sharm El-Sheikh
Front Office (ETA), Mobile App
Sharm Reef Hotel
Sharm El-Sheikh
Front Office (ETA), Mobile App
Club Reef Resort
Sharm El-Sheikh
Front Office (ETA), Mobile App
Labranda Sharm Club Resort
Sharm El-Sheikh
Front Office (ETA), Mobile App
Time Coral Nuweiba Resort
Nuweiba
Front Office, Back Office, Channel Manager (SiteMinder),
POS
Gemma Resort
Marsa Alam
Front Office (ETA), Back Office, Channel Manager
Onatti Beach Resort
El Quseir
Front Office, Back Office, POS, direct booking, Channel
Manager, Kwentra Sites
Lagoonie Lodge / Eish Baladi
Hurghada
Front Office, POS, Back Office, Channel Manager
Caesar Bay Resort
Marsa Matrouh
Front Office (ETA), Back Office, Channel Manager
Stay Inn Hotels
Giza
Front Office, Back Office, Channel Manager
Pyramid Edge Al Haram
Giza
Front Office, Channel Manager
Parkside Avenue (serviced
apartments)
Heliopolis, Cairo
Front Office, Back Office, direct booking, Channel Manager
(SiteMinder), POS, Kwentra Pay, Kwentra Sites
Ghrghar Towers (furnished
towers)
Nasr City, Cairo
Front Office
2026 K-AI workshop / partnership prospects in Egypt: SRNTY Hotels (Sahl Hasheesh), Ivy Hotels & Resorts, Dreams
Hotels Group and EVC Resorts (Sharm El-Sheikh) — announced as partnerships or workshops, not confirmed on the
Clients page.
Saudi Arabia (6) — the growth market
Client
Location
Modules / notes
Maysan Group (20 hotels, 5,000+
rooms)
Makkah, Madinah
PMS, POS, Back Office; high-volume services,
inventory automation, financial reporting
Dar Al Eiman Al Haram (SERB Group,
3,000-room portfolio)
Makkah / Madinah
PMS, POS, Back Office; billing, inventory, unified
accounting
Sadaa Hospitality Group (7 properties)
Makkah, Madinah, Riyadh
PMS, Channel Manager
Al Qasr Hotels
Abha, Kingdom-wide
Front Office, Back Office, POS
Rhenium Hotels & Resorts (by Al Qasr)
Riyadh, Jazan, Abha
Front Office, Back Office, POS

<!-- page 11 -->
Client
Location
Modules / notes
Velar Inn
Taif
Front Office, Back Office, POS, online booking,
Channel Manager; ZTCA compliance
2026 roadshow stops (prospects): Fanaya Hotel Jeddah, Sedra Hotels Madinah, Golden Tulip Al Shakreen Madinah.
Qatar (4) and East Africa (2)
Client
Location
Modules / notes
The Grand Lux Hotel
Doha
Front Office, Back Office, Channel Manager;
Opentec passport scanning, SALTO, SITA iBorders
Saraya Corniche Hotel
Doha
Front Office, Channel Manager
Victoria Hotel
Doha
Front Office, Channel Manager
Terminal Inn by Edar City Centre
Doha
Front Office
Ngoma Zanga Lodge
Livingstone, Zambia
Front Office, POS, online booking, Channel
Manager
Greens Nungwi
Zanzibar, Tanzania
Front Office, Channel Manager
Named testimonial givers: Jean Basta (Sales Supervisor, Eish Baladi & Lagoonie Lodge) on POS usability and cashier
tracking; Chantal Jordan (Owner, Ngoma Zanga Lodge) on control; Omar Gabry (GM, Pyramid Edge) on fit to hotelier
needs; Ramy Waheed (MD, Greens Nungwi). Hotel Tech Report reviews also come from Sierra Leone (1) — so the
footprint includes West Africa.

<!-- page 12 -->

## 11. Market reception — ratings & reviews
Directory
Rating
Reviews
Notes
Hotel Tech Report
4.8 / 5 (4.7 on some views);
95% would recommend
7 verified
Ease of use 4.4 · Support 4.3 · Value/ROI 4.3 ·
Implementation 4.4. HT Score 0/100 (insufficient
data). Ranked #57 of 357 PMSs; #54 trending.
Support processes not verified; no Certificate of
Excellence
Capterra / Capterra
India
none
0
Lists 14 features, web + iOS + Android, free trial
available, 24/7 live rep
GetApp
none
0
Same listing family as Capterra
Software Advice
none
0
“Connect with an advisor for pricing”; no free
version
SourceForge /
Slashdot
listed
n/a
Directory entries only
Google Play (Insights
app)
5.0 / 5
5
500+ downloads
Facebook
n/a
5.6K+
followers
Active Arabic and English posts, video content
Who reviews Kwentra
Six of seven Hotel Tech Report reviews are from Egypt and one from Sierra Leone; property sizes split
between 50–74 rooms and 200–499 rooms; roles include owners, general managers, IT managers, chief
accountants and rooms-division managers. Segment recommendation rates: resorts 81%, boutique
67%, luxury/branded/hostel/budget 100% (tiny samples).
What reviewers praise
• 24/7 support and responsive, professional team during pre-opening and live operations.
• Fast implementation and easy onboarding; cloud access from anywhere.
• All-in-one scope — front office, back office, POS, channel manager and website in one bill;
consolidated financial control.
• Comprehensive reporting; smart integrations with channel managers and payment systems.
• Willingness to co-develop and customise features around a client's objectives.
What reviewers criticise
• Dashboard does not show live occupancy the way managers want; limited filtering options.
• One critical review: room-category presentation issues left unresolved; package management broke
after updates.
• Hotel Tech Report's own verdict in head-to-heads (vs Hotelogix, 246 reviews): Kwentra is “suitable for
properties requiring legacy-system integration” but has too little validation data. Category rankings
by size: small #68, mid #50, large #29 — i.e. relatively stronger with large properties.
Differentiators Hotel Tech Report credits to Kwentra over Hotelogix: an on-premise deployment option, lobby-kiosk
functionality, employee messaging and automated reminders.

## 12. Go-to-market, sales channels & marketing
Channel
Mechanics
Direct sales
Free demo booked through a calendar form; VP Sales plus GCC partnerships head; Experience
Managers handle onboarding and retention

<!-- page 13 -->
Channel
Mechanics
Referral programme
USD 300 per closed deal for sharing a personal referral code (hoteliers, consultants,
restaurateurs). Paid quarterly, max four quarterly payments per referred contract, first payment
~30 days after first full quarter; tiered by contracts signed per year
Kwentra Champion
10% commission on first-year revenue for actively pitching properties; larger properties pay
more
Reseller network
Global reseller programme with negotiated commission; onboarding via sales manager
Field marketing
On-site AI/K-AI workshops at hotel groups (Sahl Hasheesh, Hurghada, Sharm El-Sheikh, Jun–Jul
2026); Saudi Arabia roadshow (Jeddah, Madinah, Aug–Sep 2026); “Tech Hospitality for IT
Leaders” workshop
Events
ITB Berlin (2026), Hospitality Technology Leaders Forum Dubai (2023)
Content
Blog (~2 posts/month in 2026: all-in-one PMS, real-time reporting, multi-property, Saudi
compliance, K-AI, sustainability, high-season prep, digital guest journey) and a news feed of
client wins
Education
“Empowering Hoteliers of Tomorrow” programme training tourism/hotel students on cloud PMS
(talent pipeline and future buyers)
Partner listings
Hotel Tech Report, ExploreTECH (UAE marketplace), Ariane, SiteMinder etc. — integration
marketplaces used as lead sources
Messaging pillars
Increased revenue · Operational efficiency · Cost-effectiveness · Guest loyalty; “fastest-growing
cloud PMS in MENA”; “save 4 hours/day”; “up to 70% lower IT cost”

## 13. Competitive landscape & price benchmarks
Hotel Tech Report's alternatives list for Kwentra, with published starting prices. HOTELTIME is named
the Middle East category leader; Cloudbeds leads small hotels globally and Mews leads mid/large.
Vendor
HT Score
Reviews
Starting price
Positioning
Cloudbeds
100
1,265
USD 600 / month
Growth engine for ambitious hoteliers; #1 small
hotels, North America & APAC
Mews
99
890
USD 900 / month
Operating system for modern hotels; leads Europe
and mid/large
Stayntouch
91
391
USD 800 / month
Personalised setup support
HOTELTIME
89
549
USD 600 / month
Mobile cloud access; Middle East leader
Clock PMS+
88
329
USD 600 / month
Multi-operation handling
RMS Cloud
88
322
—
Built-in channel integration
ThinkReservations
87
400
USD 500 / month
Live support, training videos
WebRezPro
82
—
—
Tape chart, fast staff onboarding
Hotelogix
82
246
Contact sales
4.9/5; 25 partners; strong in small/mid; India-based,
active in MENA
RoomRaccoon
79
—
—
Yield rules
Shiji Group
74
36
USD 1,200 /
month
Enterprise, multi-window
Kwentra
0 (n/a)
7
Contact sales
4.8/5; 18 partners; MENA compliance depth
Regional and local competitors relevant to an Egyptian launch
• ComSyS Software (Egypt, founded 1984, ~68 staff): legacy hospitality/restaurant/retail vendor with
cloud and on-premise options, channel manager, booking engine, housekeeping app; integrations M3,
RateGain, Blastness, eRevMax; zero public reviews.
• Oracle OPERA / OPERA Cloud: incumbent in large branded Red Sea resorts; expensive, the system
most independents want to leave.

<!-- page 14 -->
• eZee Absolute / Yanolja Cloud, Hotelogix, Cloudbeds, HotelRunner, Protel, Mews: global
cloud PMSs with MENA presence and published or semi-published pricing; several appear as Kwentra
channel-manager partners (eZee Centrix, Yanolja) — meaning they are both partner and competitor.
• Odoo, Smart Order, Profitroom, HotelRunner: buying Google Ads on Kwentra's own brand
search terms (visible as sponsored results on the query you shared).
Pricing benchmarks (industry, 2026)
Cost element
Typical range
Cloud PMS per room per month
USD 4 – 15 (e.g. 20 rooms at USD 8 = USD 160/month)
Flat-fee tiers
Entry USD 50–95 · Mid USD 150–300 · Advanced USD 400–600+ per month
Setup / onboarding
USD 500 – 2,000; on-site training USD 850–1,500 per day; custom config USD
150–300 per hour
Integration fees
USD 200 – 500 per month
Payment processing
1–3% + USD 0.15–0.30 per transaction
On-premise licence (legacy)
USD 20,000 – 100,000+ upfront; USD 10,000 – 30,000 annual maintenance
Small hotel (<30 rooms) all-in
USD 50 – 200 per month
Mid-size (30–100 rooms) all-in
USD 200 – 800 per month

<!-- page 15 -->

## 14. Gaps and opportunities for your project
Kwentra has proven that Red Sea and Saudi independents will buy a regional cloud PMS. The data
above shows where it is exposed. Each row pairs an observed weakness with the opening it creates.
Observed at Kwentra
Opportunity for a new entrant
Opaque pricing — no public list, quote-only,
non-refundable, 60-day notice, no SLA
Publish transparent per-room and occupancy-based tiers in
EGP/SAR/USD with a real uptime SLA and monthly cancellation. Price
transparency alone is a lead-generation weapon in this segment
Dated front-end stack (Bootstrap 3.0.2, jQuery
2.0.3, Metronic 4.7.5) and a hash-routed legacy
app
Modern responsive web app (React/Vue) with true mobile front-desk
and housekeeping apps — reviewers already ask for better
dashboards and filtering
Dashboard and filtering complaints; regressions
after weekly updates
Invest in a live occupancy/rate dashboard, saved filters and staged
releases with release notes; make stability a selling point
Only 7 public reviews in 12+ years; zero on
Capterra/GetApp
Bake review collection into onboarding and support closure; 30
verified reviews would out-rank Kwentra on every directory
“Open API” claimed but no public developer
docs
Public, documented REST/webhook API from day one; attracts
channel managers, RMS, locks and local fintechs to integrate with
you instead
Training is deliberately online-only; 24-hour
response commitment
Offer optional on-site go-live for resorts (your operational
background is an asset here) and a local-language WhatsApp support
line
Compliance moat: ETA, Ministry of Interior,
ZATCA, Shomoos, NTMP
Non-negotiable to match. Sequence: Egypt ETA e-receipt/e-invoice +
guest reporting first, then Saudi ZATCA/Shomoos/NTMP for the
Umrah market. Hijri/Gregorian dual reporting is expected
Guest-facing layer thin: reputation and upsell
were partner-supplied until the Reflectfy
purchase
Build guest messaging (WhatsApp), digital check-in, upsell and
review requests natively; this is where entertainment/activities
booking — your domain — plugs in as a differentiator
Activities and add-on packages exist but are
basic (link services to reservations)
A real activities/entertainment module: schedules, capacity,
animation-team programmes, guest sign-ups, resort programme
publishing — no MENA PMS does this well
Growth lever is field workshops and referral
commissions (USD 300 / 10%)
Same playbook works: hotel-group workshops on the Red Sea,
referral network among GMs and F&B managers, reseller deals with
local IT integrators (e.g. LOGICSWARE-type firms)
Multi-property is a headline feature, sold to
20-hotel groups
Do multi-property from the start (schema-per-property or row-level
tenancy) so you are not rebuilding for the first group client
POS with recipe costing and procurement is a
genuine strength
Match F&B stock deduction and PO workflow — resorts on
all-inclusive plans treat this as core, not an add-on
Suggested reading order for your team: Section 3 (feature parity checklist), Section 8 (compliance scope),
Section 9 (integrations to prioritise), Section 6 (contract terms to beat), Section 13 (pricing corridor).

<!-- page 16 -->

## 15. Caveats and unverified claims
• Founding year: Kwentra's own boilerplate says 2013; ExploreTECH lists 2014; Crunchbase hides the
date. Treat as 2013–2014.
• Headquarters: Cairo (three directories, app-store publisher, Facebook/Giza) vs Abu Dhabi (Hotel
Tech Report; ADGM legal entity). Most likely Egyptian operations with a UAE contracting company.
• Headcount and revenue: 35 staff and under USD 5m revenue are third-party estimates.
• SOC I & II, MFA, 500+ properties, SLA guarantees: appear only in the ExploreTECH vendor
listing and are contradicted by the T&Cs' lack of any SLA; not on kwentra.com.
• Feature counts: “300+” Front Office features and “800+ capabilities” are marketing figures; the
Hotel Tech Report checklist shows about 16 feature categories.
• Languages: FAQ claims seven but names six; ExploreTECH says two.
• Free trial: Capterra says yes, Software Advice says no.
• 2026 partnerships (Dreams, EVC, SRNTY, Ivy, Fanaya, Sedra, Golden Tulip) are announced as
workshops or K-AI partnerships; they are not on the Clients page and may be prospects.
• Help Center (kwentra.supporthero.io) is login-gated, so detailed screen-level documentation could
not be reviewed; feature depth is inferred from marketing and directory listings.
• Google search page: the shared link's AI Overview and sponsored results were used only to identify
sources; sponsored competitors are noted in Section 13.

## 16. Sources
Kwentra — Home — https://www.kwentra.com/
Kwentra — Products — https://www.kwentra.com/products/
Kwentra — Clients — https://www.kwentra.com/clients/
Kwentra — About us — https://www.kwentra.com/about-us/
Kwentra — Partners — https://www.kwentra.com/partners/
Kwentra — Rewards (referral / Champion / reseller) — https://www.kwentra.com/rewards/
Kwentra — FAQs — https://www.kwentra.com/faqs/
Kwentra — Get started (demo form) — https://www.kwentra.com/get-started/
Kwentra — Terms & Conditions — https://www.kwentra.com/terms-and-conditions/
Kwentra Resources — News index — https://resources.kwentra.com/category/news/
Kwentra Resources — Blog index — https://resources.kwentra.com/category/blog/
Kwentra acquires Reflectfy (7 Sep 2026) —
https://resources.kwentra.com/news/kwentra-acquires-reflectfy-to-advance-the-future-of-intelligent-hospitality/
Smart Hotel Operations with K-AI (30 Apr 2026) — https://resources.kwentra.com/blog/smart-hotel-operations-with-k-ai/
Multi-Property blog (25 May 2026) —
https://resources.kwentra.com/blog/multiple-hotels-one-system-discover-kwentras-multi-property/
Saudi compliance blog (5 May 2026) —
https://resources.kwentra.com/blog/how-can-saudi-hotels-stay-fully-compliant-without-hindering-operations-2/
HTLF Dubai news (Feb 2023) — https://resources.kwentra.com/news/kwentras-ceo-and-head-of-partnership-and-distributio
n-partake-in-dubais-debut-hospitality-technology-leaders-forum-htlf/
Hotel students initiative (Jan 2023) —
https://resources.kwentra.com/news/empowering-hoteliers-of-tomorrow-kwentras-new-initiative-for-hotel-students/
Kwentra login portal (tech fingerprint) — https://manage.kwentra.com/frontoffice/
Kwentra Help Center (login-gated) — https://kwentra.supporthero.io/container/show/front-office
Hotel Tech Report — kwentra profile — https://hoteltechreport.com/operations/property-management-systems/kwentra
Hotel Tech Report — Kwentra alternatives — https://hoteltechreport.com/products/kwentra/alternatives
Hotel Tech Report — Hotelogix vs Kwentra — https://hoteltechreport.com/compare/hotelogix-vs-kwentra
Hotel Tech Report — ComSyS Software —
https://hoteltechreport.com/operations/property-management-systems/comsys-software
Capterra — kwentra — https://www.capterra.com/p/246055/kwentra/
Software Advice — kwentra — https://www.softwareadvice.com/hotel-management/kwentra-profile/
GetApp — kwentra — https://www.getapp.com/hospitality-travel-software/a/kwentra/
ExploreTECH — Kwentra PMS — https://www.exploretech.io/product/kwentra-kwentra-property-management-system
ExploreTECH — Kwentra Channel Manager — https://www.exploretech.io/en/product/kwentra-kwentra-channel-manager

<!-- page 17 -->
Ariane — Kwentra PMS integration — https://www.ariane.com/pms-integrations/kwentra
Crunchbase — kwentra — https://www.crunchbase.com/organization/kwentra
The Org — kwentra leadership — https://theorg.com/org/kwentra
ZoomInfo — CloudInn — https://www.zoominfo.com/c/cloudinn-co/369397951
Google Play — kwentra Insights — https://play.google.com/store/apps/details?id=net.cloudinn.managementapp&hl=en_US
App Store — kwentra Insights — https://apps.apple.com/eg/app/kwentra-insights/id1477196053
Smart Order — Hotel PMS pricing comparison 2026 (benchmarks) —
https://www.smartorder.ai/resources/blog/hotel-pms-pricing-comparison-2026/
Google search shared by the user — https://www.google.com/search?q=kwentra+system+pms
