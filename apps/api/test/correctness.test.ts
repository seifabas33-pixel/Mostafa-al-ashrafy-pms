import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app.js';
import { prisma } from '../src/db.js';
import { parseDay, formatDay } from '../src/lib/dates.js';
import { availability, freeRooms } from '../src/services/availability.js';
import { API_KEY, BUSINESS_DATE, seedFixture, type Fixture } from './fixture.js';

/** Regression tests for the inventory and folio defects found in the pre-merge audit. */

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

const api = (method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) =>
  app.inject({ method, url, headers: H, ...(body !== undefined ? { payload: JSON.stringify(body) } : {}) }).then((r) => ({ status: r.statusCode, body: r.json() }));

const P = () => `/api/properties/${f.property.id}`;

describe('day use', () => {
  it('is accepted against a rate plan with the default one-night minimum', async () => {
    const r = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id,
      arrival: BUSINESS_DATE, departure: BUSINESS_DATE, dayUse: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.dayUse).toBe(true);
    expect(r.body.nights).toHaveLength(1);
  });

  it('counts against inventory on its own date, including the window the booking path uses', async () => {
    const date = parseDay('2026-11-20');
    for (let i = 0; i < 3; i++) {
      const r = await api('POST', `${P()}/reservations`, {
        guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id,
        arrival: '2026-11-20', departure: '2026-11-20', dayUse: true,
      });
      expect(r.status, `booking ${i + 1}`).toBe(201);
    }
    // Three standard rooms, three day-use stays: the same-day window must show them all.
    const sameDay = await availability(f.property, date, parseDay('2026-11-21'));
    const std = sameDay.find((a) => a.code === 'STD')!;
    expect(std.days[0]).toMatchObject({ date: '2026-11-20', booked: 3, available: 0 });

    // A fourth is refused rather than silently overbooked.
    const fourth = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id,
      arrival: '2026-11-20', departure: '2026-11-20', dayUse: true,
    });
    expect(fourth.status).toBe(409);
  });

  it('blocks the room it is assigned to for that date', async () => {
    const date = parseDay('2026-11-25');
    const before = await freeRooms(f.property, f.std.id, date, parseDay('2026-11-26'));
    expect(before).toHaveLength(3);

    const r = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id,
      arrival: '2026-11-25', departure: '2026-11-25', dayUse: true, roomId: f.rooms[0].id,
    });
    expect(r.status).toBe(201);

    // The assigned room is no longer offered for the same date.
    const after = await freeRooms(f.property, f.std.id, date, parseDay('2026-11-26'));
    expect(after.map((x) => x.number)).toEqual(['102', '103']);
  });
});

describe('room assignment', () => {
  it('refuses to check a second guest into an occupied room', async () => {
    const mk = async () =>
      (await api('POST', `${P()}/reservations`, { guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: BUSINESS_DATE, departure: '2026-10-04' })).body;
    const first = await mk();
    const second = await mk();
    const roomId = f.rooms[0].id;

    expect((await api('POST', `${P()}/reservations/${first.id}/check-in`, { roomId })).status).toBe(200);
    const clash = await api('POST', `${P()}/reservations/${second.id}/check-in`, { roomId });
    expect(clash.status).toBe(409);
    expect(clash.body.error.message).toMatch(/occupied/i);

    const inRoom = await prisma.reservation.count({ where: { roomId, status: 'CHECKED_IN' } });
    expect(inRoom).toBe(1);
  });

  it('lets every bed of a hostel dorm check in, not just the first', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await api('POST', `${P()}/reservations`, {
        guestId: f.guest.id, roomTypeId: f.dorm.id, ratePlanId: f.bar.id,
        arrival: BUSINESS_DATE, departure: '2026-10-03', bedsRequested: 1,
      });
      expect(r.status).toBe(201);
      ids.push(r.body.id);
    }
    for (const [i, id] of ids.entries()) {
      const c = await api('POST', `${P()}/reservations/${id}/check-in`, {});
      expect(c.status, `bed ${i + 1}`).toBe(200);
      expect(c.body.room.number).toBe('D1');
    }
    // The dorm holds four beds; a fourth bed fits, a fifth does not.
    const free = await freeRooms(f.property, f.dorm.id, parseDay(BUSINESS_DATE), parseDay('2026-10-03'), undefined, 1);
    expect(free).toHaveLength(1);
    const overflow = await freeRooms(f.property, f.dorm.id, parseDay(BUSINESS_DATE), parseDay('2026-10-03'), undefined, 2);
    expect(overflow).toHaveLength(0);
  });
});

describe('group blocks', () => {
  it('holds contracted rooms on the nights a partial pick-up does not cover', async () => {
    const block = await prisma.groupBlock.create({
      data: {
        propertyId: f.property.id, name: 'Partial pickup', status: 'DEFINITE',
        arrival: parseDay('2026-12-01'), departure: parseDay('2026-12-04'),
        lines: { create: [{ roomTypeId: f.std.id, quantity: 3, rate: 800 }] },
      },
    });
    // One guest picks up a single night in the middle of the block.
    const pick = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id,
      arrival: '2026-12-03', departure: '2026-12-04', groupBlockId: block.id, allowOverbooking: true,
    });
    expect(pick.status).toBe(201);

    const days = (await availability(f.property, parseDay('2026-12-01'), parseDay('2026-12-04'))).find((a) => a.code === 'STD')!.days;
    // 3 rooms, 3 held: nothing free on any night. The pick-up replaces a held room only on
    // the night it actually occupies, rather than releasing one on every night.
    expect(days.map((d) => d.booked)).toEqual([3, 3, 3]);
    expect(days.map((d) => d.available)).toEqual([0, 0, 0]);
  });
});

describe('restrictions', () => {
  it('does not apply a stop-sell on the departure date, which is not a sold night', async () => {
    await api('POST', `${P()}/restrictions`, { from: '2026-11-10', to: '2026-11-10', stopSell: true });
    // Departing on the restricted date is fine: only 11-08 and 11-09 are sold.
    const ok = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: '2026-11-08', departure: '2026-11-10',
    });
    expect(ok.status).toBe(201);
    // Staying THROUGH the restricted night is still refused.
    const blocked = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: '2026-11-09', departure: '2026-11-11',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details).toContain('Stop-sell on 2026-11-10');
  });
});

describe('revenue capture', () => {
  it('charges the room night when a guest checks out before the night audit runs', async () => {
    const res = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: BUSINESS_DATE, departure: '2026-10-02',
      allowOverbooking: true, // earlier cases in this file already filled the standard rooms
    });
    expect(res.status).toBe(201);
    const folioId = res.body.folios[0].id;
    await api('POST', `${P()}/reservations/${res.body.id}/check-in`, { roomId: f.rooms[2].id });

    // Same-day departure, before any audit has run for the business date.
    const early = await api('POST', `${P()}/reservations/${res.body.id}/check-out`, {});
    expect(early.status).toBe(409); // the arrival night is now owed, so checkout is blocked
    const folio = await api('GET', `${P()}/folios/${folioId}`);
    const roomLines = folio.body.totals.lines.filter((l: { category: string }) => l.category === 'ROOM');
    expect(roomLines).toHaveLength(1);
    expect(roomLines[0].amount).toBe(1000);
    expect(roomLines[0].businessDate.slice(0, 10)).toBe(BUSINESS_DATE);

    const night = await prisma.reservationNight.findFirst({ where: { reservationId: res.body.id } });
    expect(night?.posted).toBe(true);

    // Settle and the checkout goes through, with the revenue captured.
    await api('POST', `${P()}/folios/${folioId}/payments`, { amount: folio.body.totals.balance, method: 'CARD' });
    expect((await api('POST', `${P()}/reservations/${res.body.id}/check-out`, {})).status).toBe(200);
  });

  it('does not double-post a night the audit already charged', async () => {
    const before = await prisma.folioLine.count({ where: { category: 'ROOM' } });
    const res = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: BUSINESS_DATE, departure: '2026-10-02',
      allowOverbooking: true, // earlier cases in this file already filled the standard rooms
    });
    await api('POST', `${P()}/reservations/${res.body.id}/check-in`, { roomId: f.rooms[1].id });
    await prisma.reservationNight.updateMany({ where: { reservationId: res.body.id }, data: { posted: true } });
    await api('POST', `${P()}/reservations/${res.body.id}/check-out`, { force: true });
    expect(await prisma.folioLine.count({ where: { category: 'ROOM' } })).toBe(before);
  });
});

describe('reservation listing', () => {
  it('includes a day-use stay in a window that starts on its own date (the room rack)', async () => {
    const r = await api('POST', `${P()}/reservations`, {
      guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id,
      arrival: '2026-12-20', departure: '2026-12-20', dayUse: true,
    });
    expect(r.status).toBe(201);
    const sameDay = await api('GET', `${P()}/reservations?from=2026-12-20&to=2026-12-21`);
    expect(sameDay.body.map((x: { id: string }) => x.id)).toContain(r.body.id);
  });
});

describe('purchase-order receiving', () => {
  it('refuses to receive more than was ordered', async () => {
    const po = await api('POST', `${P()}/purchase-orders`, {
      supplierId: f.supplier.id, warehouseId: f.warehouse.id,
      lines: [{ ingredientId: f.chicken.id, quantity: 10, unitCost: 100 }],
    });
    expect(po.status).toBe(201);
    await api('POST', `${P()}/purchase-orders/${po.body.id}/approve`, {});
    const lineId = po.body.lines[0].id;

    const before = await prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_ingredientId: { warehouseId: f.warehouse.id, ingredientId: f.chicken.id } } });
    const tooMany = await api('POST', `${P()}/purchase-orders/${po.body.id}/receive`, { receipts: [{ lineId, quantity: 11 }] });
    expect(tooMany.status).toBe(400);
    const after = await prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_ingredientId: { warehouseId: f.warehouse.id, ingredientId: f.chicken.id } } });
    expect(after.quantity).toBe(before.quantity); // rejected, not partially applied

    // Receiving in two valid instalments still works, and the second over-receipt is caught.
    expect((await api('POST', `${P()}/purchase-orders/${po.body.id}/receive`, { receipts: [{ lineId, quantity: 6 }] })).body.status).toBe('PARTIALLY_RECEIVED');
    expect((await api('POST', `${P()}/purchase-orders/${po.body.id}/receive`, { receipts: [{ lineId, quantity: 5 }] })).status).toBe(400);
    expect((await api('POST', `${P()}/purchase-orders/${po.body.id}/receive`, { receipts: [{ lineId, quantity: 4 }] })).body.status).toBe('RECEIVED');
  });
});

describe('dates', () => {
  it('keeps the business date and stay window in one calendar', async () => {
    expect(formatDay(parseDay(BUSINESS_DATE))).toBe(BUSINESS_DATE);
  });
});
