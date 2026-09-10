import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { parseDay } from '../src/lib/dates.js';
import { availability, freeRooms } from '../src/services/availability.js';
import { quoteStay, resolveNightlyRate, setRateAmounts } from '../src/services/rates.js';
import { seedFixture, type Fixture } from './fixture.js';

let f: Fixture;
beforeAll(async () => {
  f = await seedFixture();
});
afterAll(() => prisma.$disconnect());

describe('availability', () => {
  it('counts physical rooms and beds, removing out-of-order rooms from sale', async () => {
    const before = await availability(f.property, parseDay('2026-10-05'), parseDay('2026-10-07'));
    expect(before.find((a) => a.code === 'STD')!.physical).toBe(3);
    expect(before.find((a) => a.code === 'DORM')!.physical).toBe(4);

    await prisma.room.update({ where: { id: f.rooms[2].id }, data: { status: 'OUT_OF_ORDER' } });
    const after = await availability(f.property, parseDay('2026-10-05'), parseDay('2026-10-07'));
    const std = after.find((a) => a.code === 'STD')!;
    expect(std.physical).toBe(2);
    expect(std.days.every((d) => d.outOfOrder === 1)).toBe(true);
    await prisma.room.update({ where: { id: f.rooms[2].id }, data: { status: 'VACANT' } });
  });

  it('reduces availability by overlapping reservations and beds requested', async () => {
    await prisma.reservation.create({
      data: { propertyId: f.property.id, confirmationNumber: 'A1', guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: parseDay('2026-10-05'), departure: parseDay('2026-10-07'), status: 'CONFIRMED' },
    });
    await prisma.reservation.create({
      data: { propertyId: f.property.id, confirmationNumber: 'A2', guestId: f.guest.id, roomTypeId: f.dorm.id, ratePlanId: f.bar.id, arrival: parseDay('2026-10-06'), departure: parseDay('2026-10-07'), status: 'CONFIRMED', bedsRequested: 3 },
    });
    const a = await availability(f.property, parseDay('2026-10-04'), parseDay('2026-10-08'));
    const std = a.find((x) => x.code === 'STD')!;
    expect(std.days.map((d) => d.available)).toEqual([3, 2, 2, 3]);
    const dorm = a.find((x) => x.code === 'DORM')!;
    expect(dorm.days.map((d) => d.available)).toEqual([4, 4, 1, 4]);
    expect(dorm.minAvailable).toBe(1);
  });

  it('holds unpicked group-block rooms until the release date', async () => {
    await prisma.groupBlock.create({
      data: { propertyId: f.property.id, name: 'Block', arrival: parseDay('2026-11-01'), departure: parseDay('2026-11-03'), releaseDate: parseDay('2026-11-01'), status: 'DEFINITE', lines: { create: [{ roomTypeId: f.std.id, quantity: 2, rate: 800 }] } },
    });
    const a = await availability(f.property, parseDay('2026-11-01'), parseDay('2026-11-03'));
    expect(a.find((x) => x.code === 'STD')!.days.map((d) => d.available)).toEqual([1, 3]);
  });

  it('lists free rooms excluding those assigned to overlapping stays', async () => {
    await prisma.reservation.create({
      data: { propertyId: f.property.id, confirmationNumber: 'A3', guestId: f.guest.id, roomTypeId: f.std.id, ratePlanId: f.bar.id, roomId: f.rooms[0].id, arrival: parseDay('2026-12-01'), departure: parseDay('2026-12-03'), status: 'CONFIRMED' },
    });
    const free = await freeRooms(f.property, f.std.id, parseDay('2026-12-02'), parseDay('2026-12-04'));
    expect(free.map((r) => r.number)).toEqual(['102', '103']);
    const freeLater = await freeRooms(f.property, f.std.id, parseDay('2026-12-03'), parseDay('2026-12-05'));
    expect(freeLater.map((r) => r.number)).toEqual(['101', '102', '103']);
  });
});

describe('rates', () => {
  it('resolves explicit amounts, derived plans and the base-rate fallback', async () => {
    const d = parseDay('2026-10-10');
    expect(await resolveNightlyRate(f.bar, f.std.id, d)).toBe(1000); // fallback to room type base rate
    await setRateAmounts(f.bar.id, f.std.id, d, d, 1500);
    expect(await resolveNightlyRate(f.bar, f.std.id, d)).toBe(1500);
    expect(await resolveNightlyRate(f.promoPlan, f.std.id, d)).toBe(1200); // -20% derived
  });

  it('quotes a stay night by night and applies promo codes', async () => {
    const q = await quoteStay(f.property, { roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: parseDay('2026-10-09'), departure: parseDay('2026-10-11'), promoCode: 'ten' });
    expect(q.nights.map((n) => n.rate)).toEqual([1000, 1500]);
    expect(q.subtotal).toBe(2500);
    expect(q.promoApplied).toEqual({ code: 'TEN', discount: 250 });
    expect(q.total).toBe(2250);
  });

  it('charges half rate for day use', async () => {
    const q = await quoteStay(f.property, { roomTypeId: f.std.id, ratePlanId: f.bar.id, arrival: parseDay('2026-10-10'), departure: parseDay('2026-10-10'), dayUse: true });
    expect(q.nights).toHaveLength(1);
    expect(q.total).toBe(750);
  });
});
