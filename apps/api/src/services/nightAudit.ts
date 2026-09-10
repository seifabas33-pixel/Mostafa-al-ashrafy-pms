import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays, formatDay } from '../lib/dates.js';
import { conflict } from '../lib/errors.js';
import { round2 } from '../lib/money.js';
import { postCharge } from './folios.js';
import { markNoShow } from './reservations.js';
import { emit } from './webhooks.js';
import { audit } from './audit.js';
import { ensureTask } from './housekeeping.js';

/**
 * Automated night audit (Kwentra markets this as rare; we make it a one-click and cron-able
 * operation). For the property's current business date it:
 *  1. Posts the room charge for every in-house reservation night not yet posted.
 *  2. Marks un-arrived CONFIRMED reservations for the date as NO_SHOW.
 *  3. Computes the day's KPIs (occupancy, ADR, RevPAR, revenue split) and stores the run.
 *  4. Creates housekeeping tasks for occupied rooms (daily clean) and departures tomorrow.
 *  5. Rolls the business date forward.
 */
export async function runNightAudit(property: Property, opts: { actor?: string } = {}) {
  const businessDate = property.businessDate;
  const existing = await prisma.nightAuditRun.findUnique({ where: { propertyId_businessDate: { propertyId: property.id, businessDate } } });
  if (existing) throw conflict(`Night audit already run for ${formatDay(businessDate)}`);

  // 1. Room charges
  const inHouse = await prisma.reservation.findMany({
    where: { propertyId: property.id, status: 'CHECKED_IN', arrival: { lte: businessDate }, departure: { gt: businessDate } },
    include: { nights: true, folios: { where: { kind: 'MASTER', status: 'OPEN' } }, room: true, ratePlan: true },
  });
  let roomChargesPosted = 0;
  let roomRevenue = 0;
  for (const r of inHouse) {
    const night = r.nights.find((n) => n.date.getTime() === businessDate.getTime());
    if (!night || night.posted) continue;
    const folio = r.folios[0];
    if (!folio) continue;
    await postCharge(property, folio.id, {
      category: 'ROOM',
      description: `Room ${r.room?.number ?? ''} ${r.ratePlan.code} ${formatDay(businessDate)}`.trim(),
      unitAmount: night.rate,
      businessDate,
      source: 'NIGHT_AUDIT',
      referenceId: r.id,
    });
    await prisma.reservationNight.update({ where: { id: night.id }, data: { posted: true } });
    roomChargesPosted++;
    roomRevenue += night.rate;
  }
  // Day-use reservations checked in today
  const dayUse = await prisma.reservation.findMany({
    where: { propertyId: property.id, status: 'CHECKED_IN', dayUse: true, arrival: businessDate },
    include: { nights: true, folios: { where: { kind: 'MASTER', status: 'OPEN' } } },
  });
  for (const r of dayUse) {
    const night = r.nights[0];
    if (!night || night.posted || !r.folios[0]) continue;
    await postCharge(property, r.folios[0].id, { category: 'ROOM', description: `Day use ${formatDay(businessDate)}`, unitAmount: night.rate, businessDate, source: 'NIGHT_AUDIT', referenceId: r.id });
    await prisma.reservationNight.update({ where: { id: night.id }, data: { posted: true } });
    roomChargesPosted++;
    roomRevenue += night.rate;
  }

  // 2. No-shows
  const unarrived = await prisma.reservation.findMany({ where: { propertyId: property.id, status: 'CONFIRMED', arrival: { lte: businessDate } } });
  for (const r of unarrived) await markNoShow(property, r.id, { actor: 'night-audit' });

  // 3. KPIs
  const rooms = await prisma.room.findMany({ where: { propertyId: property.id } });
  const roomsOoo = rooms.filter((r) => r.status === 'OUT_OF_ORDER').length;
  const roomsAvailable = rooms.length - roomsOoo;
  const roomsOccupied = inHouse.filter((r) => !r.dayUse).length;
  const dayLines = await prisma.folioLine.findMany({ where: { businessDate, kind: 'CHARGE', folio: { propertyId: property.id } } });
  const fnbRevenue = round2(dayLines.filter((l) => l.category === 'FNB').reduce((s, l) => s + l.amount, 0));
  const roomRevenueAll = round2(dayLines.filter((l) => l.category === 'ROOM').reduce((s, l) => s + l.amount, 0));
  const otherRevenue = round2(dayLines.filter((l) => !['FNB', 'ROOM'].includes(l.category)).reduce((s, l) => s + l.amount, 0));
  const totalRevenue = round2(roomRevenueAll + fnbRevenue + otherRevenue);
  const occupancyPct = roomsAvailable ? round2((roomsOccupied / roomsAvailable) * 100) : 0;
  const adr = roomsOccupied ? round2(roomRevenueAll / roomsOccupied) : 0;
  const revpar = roomsAvailable ? round2(roomRevenueAll / roomsAvailable) : 0;
  const arrivals = await prisma.reservation.count({ where: { propertyId: property.id, arrival: businessDate, status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } } });
  const departures = await prisma.reservation.count({ where: { propertyId: property.id, departure: businessDate, status: 'CHECKED_OUT' } });

  // 4. Housekeeping for tomorrow
  const tomorrow = addDays(businessDate, 1);
  for (const r of inHouse) {
    if (!r.roomId) continue;
    const type = r.departure.getTime() === tomorrow.getTime() ? 'INSPECT' : 'CLEAN';
    await ensureTask({ propertyId: property.id, roomId: r.roomId, type, dueDate: tomorrow, notes: type === 'INSPECT' ? 'Departure tomorrow' : 'Stay-over clean' });
  }

  const run = await prisma.nightAuditRun.create({
    data: {
      propertyId: property.id,
      businessDate,
      ranBy: opts.actor,
      roomsAvailable,
      roomsOccupied,
      roomsOoo,
      roomChargesPosted,
      roomRevenue: roomRevenueAll,
      fnbRevenue,
      otherRevenue,
      totalRevenue,
      occupancyPct,
      adr,
      revpar,
      noShows: unarrived.length,
      arrivals,
      departures,
    },
  });

  // 5. Roll date
  await prisma.property.update({ where: { id: property.id }, data: { businessDate: tomorrow } });
  await audit(property.orgId, 'night_audit.run', 'NightAuditRun', run.id, { businessDate: formatDay(businessDate) }, { propertyId: property.id, actor: opts.actor });
  void emit(property.orgId, 'night_audit.completed', { propertyId: property.id, businessDate: formatDay(businessDate), occupancyPct, adr, revpar, totalRevenue });
  return run;
}
