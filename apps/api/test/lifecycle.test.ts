import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app.js';
import { prisma } from '../src/db.js';
import { parseDay, toHijri } from '../src/lib/dates.js';
import { API_KEY, BUSINESS_DATE, READONLY_KEY, seedFixture, type Fixture } from './fixture.js';

let app: App;
let f: Fixture;
const H = { 'x-api-key': API_KEY, 'content-type': 'application/json' };

beforeAll(async () => {
  f = await seedFixture();
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const api = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = H) =>
  app.inject({ method, url, headers, ...(body !== undefined ? { payload: JSON.stringify(body) } : {}) }).then((r) => ({ status: r.statusCode, body: r.json() }));

describe('authentication', () => {
  it('rejects missing and read-only keys appropriately, allows public routes', async () => {
    expect((await api('GET', '/api/properties', undefined, {})).status).toBe(401);
    expect((await api('GET', '/api/properties', undefined, { 'x-api-key': READONLY_KEY })).status).toBe(200);
    expect((await api('POST', `/api/properties/${f.property.id}/night-audit`, {}, { 'x-api-key': READONLY_KEY, 'content-type': 'application/json' })).status).toBe(403);
    expect((await api('GET', '/api/public/pricing/plans', undefined, {})).status).toBe(200);
    expect((await api('GET', '/health', undefined, {})).body.ok).toBe(true);
  });
  it('serves an OpenAPI document', async () => {
    const r = await api('GET', '/openapi.json', undefined, {});
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.paths).length).toBeGreaterThan(80);
  });
});

describe('stay lifecycle', () => {
  const P = () => `/api/properties/${f.property.id}`;
  let reservationId: string;
  let folioId: string;
  let roomId: string;

  it('creates a reservation with a quote and promo, and schedules the guest journey', async () => {
    const r = await api('POST', `${P()}/reservations`, {
      guest: { firstName: 'Test', lastName: 'Guest', phone: '+2012', nationality: 'EG', documentNumber: 'X1' },
      roomTypeId: f.std.id,
      ratePlanId: f.bar.id,
      arrival: BUSINESS_DATE,
      departure: '2026-10-03',
      promoCode: 'TEN',
      source: 'WALK_IN',
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('CONFIRMED');
    expect(r.body.totalAmount).toBe(1800);
    expect(r.body.nights.map((n: { rate: number }) => n.rate)).toEqual([900, 900]);
    expect(r.body.folios).toHaveLength(1);
    reservationId = r.body.id;
    folioId = r.body.folios[0].id;
    const msgs = await api('GET', `${P()}/messages?status=QUEUED`);
    expect(msgs.body.map((m: { template: string }) => m.template)).toEqual(expect.arrayContaining(['PRE_ARRIVAL', 'DIGITAL_CHECKIN', 'UPSELL', 'POST_STAY_REVIEW']));
  });

  it('enforces rate-plan restrictions and availability (overbooking control)', async () => {
    const short = await api('POST', `${P()}/reservations`, { guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.promoPlan.id, arrival: BUSINESS_DATE, departure: '2026-10-02' });
    expect(short.status).toBe(409);
    expect(short.body.error.details).toEqual(expect.arrayContaining(['Minimum stay 3 nights', 'Book at least 21 days ahead']));
    // fill the remaining two standard rooms, third booking must fail
    for (let i = 0; i < 2; i++) expect((await api('POST', `${P()}/reservations`, { guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: BUSINESS_DATE, departure: '2026-10-02' })).status).toBe(201);
    const full = await api('POST', `${P()}/reservations`, { guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: BUSINESS_DATE, departure: '2026-10-02' });
    expect(full.status).toBe(409);
    expect(full.body.error.details.minAvailable).toBe(0);
    const forced = await api('POST', `${P()}/reservations`, { guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: BUSINESS_DATE, departure: '2026-10-02', allowOverbooking: true });
    expect(forced.status).toBe(201);
    await api('POST', `${P()}/reservations/${forced.body.id}/cancel`, { reason: 'test' });
  });

  it('checks in, auto-assigning a clean room and queuing guest reporting', async () => {
    const r = await api('POST', `${P()}/reservations/${reservationId}/check-in`, {});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CHECKED_IN');
    expect(r.body.room.number).toBe('101');
    roomId = r.body.roomId;
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.status).toBe('OCCUPIED');
    const c = await api('GET', `${P()}/compliance?status=PENDING`);
    expect(c.body.required.onCheckIn).toEqual(['MOI_GUEST_REPORT']);
    expect(c.body.submissions.some((s: { type: string; entityId: string }) => s.type === 'MOI_GUEST_REPORT' && s.entityId === reservationId)).toBe(true);
  });

  it('posts a POS order to the room and deducts recipe stock', async () => {
    const o = await api('POST', `${P()}/pos/orders`, { outletId: f.outlet.id, roomId, lines: [{ menuItemId: f.dish.id, quantity: 2 }], allergyNotes: 'nuts' });
    expect(o.status).toBe(201);
    expect(o.body.subtotal).toBe(600);
    expect(o.body.total).toBe(766.08);
    const posted = await api('POST', `${P()}/pos/orders/${o.body.id}/post-to-room`, {});
    expect(posted.status).toBe(200);
    expect(posted.body.order.status).toBe('POSTED_TO_ROOM');
    expect(posted.body.folioLine.amount).toBe(600);
    const stock = await prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_ingredientId: { warehouseId: f.warehouse.id, ingredientId: f.chicken.id } } });
    expect(stock.quantity).toBe(9.5);
    const costing = await api('GET', `${P()}/outlets/${f.outlet.id}/costing`);
    expect(costing.body[0]).toMatchObject({ cost: 50, foodCostPct: 16.67 });
  });

  it('signs the guest up for a paid activity, posting to the folio, and waitlists when full', async () => {
    const s1 = await api('POST', `${P()}/sessions/${f.session.id}/signups`, { reservationId, pax: 2 });
    expect(s1.status).toBe(201);
    expect(s1.body.status).toBe('BOOKED');
    expect(s1.body.folioLineId).toBeTruthy();
    const s2 = await api('POST', `${P()}/sessions/${f.session.id}/signups`, { guestId: f.guest.id, pax: 1 });
    expect(s2.body.status).toBe('WAITLIST');
    const prog = await api('GET', `${P()}/programme?days=1`);
    expect(prog.body[0].sessions[0]).toMatchObject({ booked: 2, remaining: 0, status: 'FULL' });
  });

  it('runs the night audit: posts room charges, KPIs, no-shows, housekeeping, rolls the date', async () => {
    const before = await api('GET', `${P()}/dashboard`);
    expect(before.body.businessDate.gregorian).toBe(BUSINESS_DATE);
    expect(before.body.kpis.occupancyPct).toBe(25); // 1 of 4 physical rooms (3 STD + 1 dorm)
    const run = await api('POST', `${P()}/night-audit`, {});
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ roomsAvailable: 4, roomsOccupied: 1, roomChargesPosted: 1, roomRevenue: 900, fnbRevenue: 600, otherRevenue: 200, noShows: 2, occupancyPct: 25, adr: 900, revpar: 225 });
    const rolled = await prisma.property.findUniqueOrThrow({ where: { id: f.property.id } });
    expect(rolled.businessDate.toISOString().slice(0, 10)).toBe('2026-10-02');
    // A second run audits the next business date (a missed night can be caught up), never the same date twice.
    const again = await api('POST', `${P()}/night-audit`, {});
    expect(again.status).toBe(200);
    expect(again.body.businessDate.slice(0, 10)).toBe('2026-10-02');
    expect(again.body.roomChargesPosted).toBe(1);
    const prop = await prisma.property.findUniqueOrThrow({ where: { id: f.property.id } });
    expect(prop.businessDate.toISOString().slice(0, 10)).toBe('2026-10-03');
    expect(await prisma.nightAuditRun.count({ where: { propertyId: f.property.id } })).toBe(2);
    const tasks = await api('GET', `${P()}/housekeeping/tasks?date=2026-10-02`);
    expect(tasks.body.some((t: { type: string; room: { number: string } }) => t.type === 'CLEAN' && t.room.number === '101')).toBe(true);
    const folio = await api('GET', `${P()}/folios/${folioId}`);
    expect(folio.body.totals).toMatchObject({ net: 2600, service: 312, tax: 407.68, gross: 3319.68, balance: 3319.68 });
  });

  it('blocks check-out with a balance, then settles, closes the folio and queues the e-invoice', async () => {
    const blocked = await api('POST', `${P()}/reservations/${reservationId}/check-out`, {});
    expect(blocked.status).toBe(409);
    const pay = await api('POST', `${P()}/folios/${folioId}/payments`, { amount: 3319.68, method: 'CARD' });
    expect(pay.status).toBe(201);
    const out = await api('POST', `${P()}/reservations/${reservationId}/check-out`, {});
    expect(out.status).toBe(200);
    expect(out.body.status).toBe('CHECKED_OUT');
    const folio = await prisma.folio.findUniqueOrThrow({ where: { id: folioId } });
    expect(folio.status).toBe('CLOSED');
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room).toMatchObject({ status: 'VACANT', hkStatus: 'DIRTY' });

    await api('POST', `${P()}/compliance`, { type: 'ETA_EINVOICE', entityType: 'FOLIO', entityId: folioId });
    const processed = await api('POST', `${P()}/compliance/process`, {});
    expect(processed.status).toBe(200);
    const inv = processed.body.find((s: { type: string }) => s.type === 'ETA_EINVOICE');
    expect(inv.status).toBe('ACCEPTED');
    expect(inv.externalRef).toMatch(/^ETA-/);
    const detail = await api('GET', `${P()}/compliance?type=ETA_EINVOICE`);
    expect(detail.body.submissions[0].payload.totals.gross).toBe(3319.68);
  });

  it('completes a housekeeping task and returns the room to clean', async () => {
    const tasks = await api('GET', `${P()}/housekeeping/tasks?status=PENDING`);
    const t = tasks.body.find((x: { room: { number: string }; type: string }) => x.room.number === '101' && x.type === 'CLEAN');
    const done = await api('PATCH', `${P()}/housekeeping/tasks/${t.id}`, { status: 'DONE' });
    expect(done.status).toBe(200);
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.hkStatus).toBe('CLEAN');
  });

  it('records an audit trail and webhook deliveries', async () => {
    const log = await api('GET', '/api/audit-log?take=50');
    const actions = log.body.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['reservation.create', 'reservation.check_in', 'night_audit.run', 'reservation.check_out']));
    const sub = await api('POST', '/api/webhooks', { url: 'https://example.invalid/hook', events: ['reservation.created'] });
    expect(sub.status).toBe(201);
    await api('POST', `${P()}/reservations`, { guestId: f.guest.id, roomTypeId: f.dorm.id, ratePlanId: f.bar.id, arrival: '2026-10-20', departure: '2026-10-22', bedsRequested: 2 });
    const deliveries = await api('GET', `/api/webhooks/${sub.body.id}/deliveries`);
    expect(deliveries.body).toHaveLength(1);
    expect(deliveries.body[0].event).toBe('reservation.created');
  });
});

describe('procurement and inventory', () => {
  const P = () => `/api/properties/${f.property.id}`;
  it('creates, approves and receives a purchase order, updating stock and cost', async () => {
    const po = await api('POST', `${P()}/purchase-orders`, { supplierId: f.supplier.id, warehouseId: f.warehouse.id, lines: [{ ingredientId: f.chicken.id, quantity: 20, unitCost: 210 }] });
    expect(po.status).toBe(201);
    expect(po.body).toMatchObject({ status: 'PENDING_APPROVAL', total: 4200 });
    expect((await api('POST', `${P()}/purchase-orders/${po.body.id}/receive`, { receipts: [{ lineId: po.body.lines[0].id, quantity: 5 }] })).status).toBe(409);
    expect((await api('POST', `${P()}/purchase-orders/${po.body.id}/approve`, {})).body.status).toBe('APPROVED');
    const partial = await api('POST', `${P()}/purchase-orders/${po.body.id}/receive`, { receipts: [{ lineId: po.body.lines[0].id, quantity: 5 }] });
    expect(partial.body.status).toBe('PARTIALLY_RECEIVED');
    const full = await api('POST', `${P()}/purchase-orders/${po.body.id}/receive`, { receipts: [{ lineId: po.body.lines[0].id, quantity: 15 }] });
    expect(full.body.status).toBe('RECEIVED');
    const stock = await api('GET', `${P()}/stock`);
    const chicken = stock.body[0].items.find((i: { sku: string }) => i.sku === 'CHK');
    expect(chicken.quantity).toBe(29.5);
    expect(chicken.belowPar).toBe(false);
    const ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: f.chicken.id } });
    expect(ing.costPerUnit).toBe(210);
  });
});

describe('public booking engine and pricing', () => {
  it('returns availability with quotes, hides plans whose restrictions fail, and books', async () => {
    const a = await api('GET', `/api/public/booking-engine/${f.property.id}/availability?arrival=2026-10-10&departure=2026-10-12&promoCode=TEN`, undefined, {});
    expect(a.status).toBe(200);
    const std = a.body.roomTypes.find((r: { code: string }) => r.code === 'STD');
    expect(std.offers.map((o: { code: string }) => o.code)).toEqual(['BAR']); // EARLY needs 3 nights & 21 days lead
    expect(std.offers[0].promoApplied.code).toBe('TEN');
    const book = await api('POST', `/api/public/booking-engine/${f.property.id}/book`, { roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: '2026-10-10', departure: '2026-10-12', guest: { firstName: 'Web', lastName: 'Guest', email: 'web@example.com' } }, { 'content-type': 'application/json' });
    expect(book.status).toBe(201);
    expect(book.body.confirmationNumber).toMatch(/^TST-/);
    const far = await api('GET', `/api/public/booking-engine/${f.property.id}/availability?arrival=2026-11-10&departure=2026-11-14`, undefined, {});
    expect(far.body.roomTypes.find((r: { code: string }) => r.code === 'STD').offers.map((o: { code: string }) => o.code)).toEqual(['EARLY', 'BAR']);
  });
  it('estimates every published plan and recommends the cheapest', async () => {
    const e = await api('GET', '/api/public/pricing/estimate?roomCount=30&averageOccupancyPct=30&months=12', undefined, {});
    expect(e.status).toBe(200);
    expect(e.body.estimates).toHaveLength(2);
    expect(e.body.recommended).toBe('SEASONAL');
    expect(e.body.benchmarks.perRoomPerMonthUsd).toEqual([4, 15]);
  });
});

describe('multi-property reporting', () => {
  it('consolidates night-audit KPIs across properties with Hijri dates', async () => {
    const r = await api('GET', '/api/reports/portfolio?from=2026-10-01&to=2026-10-02');
    expect(r.status).toBe(200);
    expect(r.body.period.from.hijri).toBe(toHijri(parseDay('2026-10-01')).formatted);
    expect(r.body.properties[0]).toMatchObject({ code: 'TST', days: 2, occupancyPct: 25, adr: 900, revpar: 225, roomRevenue: 1800 });
    expect(r.body.properties[0].daily.map((d: { hijri: string }) => d.hijri)).toEqual([toHijri(parseDay('2026-10-01')).formatted, toHijri(parseDay('2026-10-02')).formatted]);
  });
});
