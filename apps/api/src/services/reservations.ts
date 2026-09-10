import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { eachNight, parseDay, formatDay } from '../lib/dates.js';
import { confirmationNumber } from '../lib/ids.js';
import { availability, freeRooms } from './availability.js';
import { checkRestrictions, quoteStay } from './rates.js';
import { closeFolio, createFolio, recomputeBalance } from './folios.js';
import { emit } from './webhooks.js';
import { audit } from './audit.js';
import { queueGuestReporting } from './compliance.js';
import { scheduleJourney } from './guestJourney.js';
import { ensureTask } from './housekeeping.js';

export interface CreateReservationInput {
  guestId?: string;
  guest?: { firstName: string; lastName: string; email?: string; phone?: string; nationality?: string; documentType?: string; documentNumber?: string };
  roomTypeId: string;
  ratePlanId: string;
  arrival: string;
  departure: string;
  adults?: number;
  children?: number;
  dayUse?: boolean;
  bedsRequested?: number;
  promoCode?: string;
  source?: string;
  channel?: string;
  externalRef?: string;
  marketSegmentId?: string;
  groupBlockId?: string;
  specialRequests?: string;
  roomId?: string;
  allowOverbooking?: boolean;
  actor?: string;
}

const reservationInclude = {
  guest: true,
  roomType: true,
  room: true,
  ratePlan: true,
  nights: { orderBy: { date: 'asc' as const } },
  folios: true,
} as const;

export async function createReservation(property: Property, input: CreateReservationInput) {
  const arrival = parseDay(input.arrival);
  const departure = input.dayUse ? arrival : parseDay(input.departure);
  if (!input.dayUse && departure <= arrival) throw badRequest('Departure must be after arrival');

  const roomType = await prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
  if (!roomType || roomType.propertyId !== property.id) throw notFound('Room type', input.roomTypeId);
  const ratePlan = await prisma.ratePlan.findUnique({ where: { id: input.ratePlanId } });
  if (!ratePlan || ratePlan.propertyId !== property.id) throw notFound('Rate plan', input.ratePlanId);

  // Restrictions (stop-sell, CTA/CTD, LOS, lead time)
  const stayEnd = input.dayUse ? new Date(arrival.getTime() + 1) : departure;
  const restrictions = await prisma.restriction.findMany({
    where: {
      propertyId: property.id,
      date: { gte: arrival, lte: departure },
      OR: [{ roomTypeId: null }, { roomTypeId: roomType.id }],
      AND: [{ OR: [{ ratePlanId: null }, { ratePlanId: ratePlan.id }] }],
    },
  });
  const problems = checkRestrictions(restrictions, ratePlan, arrival, input.dayUse ? arrival : departure, property.businessDate);
  if (problems.length && !input.allowOverbooking) throw conflict('Stay violates restrictions', problems);

  // Availability with overbooking control
  const avail = await availability(property, arrival, input.dayUse ? new Date(arrival.getTime() + 86_400_000) : departure);
  const rtAvail = avail.find((a) => a.roomTypeId === roomType.id);
  const need = roomType.sellMode === 'BED' ? input.bedsRequested ?? 1 : 1;
  if (rtAvail && rtAvail.minAvailable < need && !input.allowOverbooking) {
    throw conflict('No availability for the requested dates', { roomType: roomType.code, minAvailable: rtAvail.minAvailable });
  }

  const quote = await quoteStay(property, {
    roomTypeId: roomType.id,
    ratePlanId: ratePlan.id,
    arrival,
    departure: input.dayUse ? arrival : departure,
    promoCode: input.promoCode,
    dayUse: input.dayUse,
  });
  void stayEnd;

  const created = await prisma.$transaction(async (tx) => {
    let guestId = input.guestId;
    if (!guestId) {
      if (!input.guest) throw badRequest('guestId or guest is required');
      const g = await tx.guest.create({ data: { orgId: property.orgId, ...input.guest } });
      guestId = g.id;
    } else {
      const g = await tx.guest.findUnique({ where: { id: guestId } });
      if (!g || g.orgId !== property.orgId) throw notFound('Guest', guestId);
    }
    if (input.roomId) {
      const free = await freeRooms(property, roomType.id, arrival, input.dayUse ? new Date(arrival.getTime() + 86_400_000) : departure);
      if (!free.some((r) => r.id === input.roomId)) throw conflict('Requested room is not free for these dates');
    }
    const discountPerNight = quote.promoApplied ? quote.promoApplied.discount / quote.nights.length : 0;
    const reservation = await tx.reservation.create({
      data: {
        propertyId: property.id,
        confirmationNumber: confirmationNumber(property.code),
        guestId,
        roomTypeId: roomType.id,
        roomId: input.roomId,
        ratePlanId: ratePlan.id,
        groupBlockId: input.groupBlockId,
        marketSegmentId: input.marketSegmentId,
        source: input.source ?? 'DIRECT',
        channel: input.channel,
        externalRef: input.externalRef,
        arrival,
        departure: input.dayUse ? arrival : departure,
        adults: input.adults ?? 1,
        children: input.children ?? 0,
        dayUse: input.dayUse ?? false,
        bedsRequested: input.bedsRequested ?? 1,
        promoCode: quote.promoApplied?.code,
        specialRequests: input.specialRequests ?? '',
        totalAmount: quote.total,
        nights: {
          create: quote.nights.map((n) => ({ date: parseDay(n.date), rate: Math.round((n.rate - discountPerNight) * 100) / 100 })),
        },
      },
      include: reservationInclude,
    });
    await createFolio(property, { reservationId: reservation.id, guestId }, tx);
    await audit(property.orgId, 'reservation.create', 'Reservation', reservation.id, { confirmationNumber: reservation.confirmationNumber }, { propertyId: property.id, actor: input.actor }, tx);
    return tx.reservation.findUniqueOrThrow({ where: { id: reservation.id }, include: reservationInclude });
  });
  void emit(property.orgId, 'reservation.created', { reservationId: created.id, confirmationNumber: created.confirmationNumber, arrival: formatDay(arrival), departure: formatDay(created.departure) });
  await scheduleJourney(property, created.id);
  return created;
}

export async function getReservation(property: Property, id: string) {
  const r = await prisma.reservation.findUnique({ where: { id }, include: reservationInclude });
  if (!r || r.propertyId !== property.id) throw notFound('Reservation', id);
  return r;
}

export async function assignRoom(property: Property, id: string, roomId: string | null) {
  const r = await getReservation(property, id);
  if (roomId) {
    const free = await freeRooms(property, r.roomTypeId, r.arrival, r.dayUse ? new Date(r.arrival.getTime() + 86_400_000) : r.departure, r.id);
    const room = free.find((x) => x.id === roomId);
    if (!room) throw conflict('Room is not free for the stay, or is of a different type');
  }
  const updated = await prisma.reservation.update({ where: { id }, data: { roomId }, include: reservationInclude });
  void emit(property.orgId, 'reservation.modified', { reservationId: id, roomId });
  return updated;
}

export async function checkIn(property: Property, id: string, opts: { roomId?: string; actor?: string } = {}) {
  const r = await getReservation(property, id);
  if (r.status !== 'CONFIRMED') throw conflict(`Cannot check in a reservation in status ${r.status}`);
  if (r.arrival > property.businessDate) throw conflict(`Arrival ${formatDay(r.arrival)} is after business date ${formatDay(property.businessDate)}`);
  let roomId = opts.roomId ?? r.roomId;
  if (!roomId) {
    const free = await freeRooms(property, r.roomTypeId, r.arrival, r.dayUse ? new Date(r.arrival.getTime() + 86_400_000) : r.departure, r.id);
    const clean = free.find((x) => x.hkStatus === 'CLEAN' || x.hkStatus === 'INSPECTED') ?? free[0];
    if (!clean) throw conflict('No free room of this type to check into');
    roomId = clean.id;
  }
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.roomTypeId !== r.roomTypeId) throw conflict('Room does not match the reservation room type');
  if (room.status === 'OUT_OF_ORDER') throw conflict('Room is out of order');
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.reservation.update({
      where: { id },
      data: { status: 'CHECKED_IN', roomId, checkedInAt: new Date() },
      include: reservationInclude,
    });
    await tx.room.update({ where: { id: roomId! }, data: { status: 'OCCUPIED' } });
    await audit(property.orgId, 'reservation.check_in', 'Reservation', id, { roomId }, { propertyId: property.id, actor: opts.actor }, tx);
    return res;
  });
  void emit(property.orgId, 'reservation.checked_in', { reservationId: id, roomId, roomNumber: room.number });
  void emit(property.orgId, 'room.status_changed', { roomId, status: 'OCCUPIED' });
  // Guest reporting to the authorities (Egypt MoI, Saudi Shomoos/NTMP) is triggered by check-in.
  void queueGuestReporting(property, updated.id);
  return updated;
}

export async function checkOut(property: Property, id: string, opts: { actor?: string; force?: boolean } = {}) {
  const r = await getReservation(property, id);
  if (r.status !== 'CHECKED_IN') throw conflict(`Cannot check out a reservation in status ${r.status}`);
  for (const f of r.folios) {
    const fresh = await recomputeBalance(f.id);
    if (Math.abs(fresh.balance) > 0.005 && !opts.force) throw conflict(`Folio ${f.number} has an open balance of ${fresh.balance}`, { folioId: f.id, balance: fresh.balance });
  }
  const updated = await prisma.$transaction(async (tx) => {
    for (const f of r.folios) {
      if (opts.force) await tx.folio.update({ where: { id: f.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      else await closeFolio(property, f.id, tx);
    }
    const res = await tx.reservation.update({ where: { id }, data: { status: 'CHECKED_OUT', checkedOutAt: new Date() }, include: reservationInclude });
    if (r.roomId) {
      await tx.room.update({ where: { id: r.roomId }, data: { status: 'VACANT', hkStatus: 'DIRTY' } });
      await ensureTask({ propertyId: property.id, roomId: r.roomId, type: 'CLEAN', priority: 'HIGH', dueDate: property.businessDate, notes: `Departure ${r.confirmationNumber}` }, tx);
    }
    await audit(property.orgId, 'reservation.check_out', 'Reservation', id, {}, { propertyId: property.id, actor: opts.actor }, tx);
    return res;
  });
  for (const f of r.folios) void emit(property.orgId, 'folio.closed', { folioId: f.id });
  void emit(property.orgId, 'reservation.checked_out', { reservationId: id, roomId: r.roomId });
  if (r.roomId) void emit(property.orgId, 'room.status_changed', { roomId: r.roomId, status: 'VACANT', hkStatus: 'DIRTY' });
  return updated;
}

export async function cancelReservation(property: Property, id: string, opts: { reason?: string; actor?: string } = {}) {
  const r = await getReservation(property, id);
  if (r.status !== 'CONFIRMED') throw conflict(`Cannot cancel a reservation in status ${r.status}`);
  const updated = await prisma.reservation.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() }, include: reservationInclude });
  await audit(property.orgId, 'reservation.cancel', 'Reservation', id, { reason: opts.reason }, { propertyId: property.id, actor: opts.actor });
  void emit(property.orgId, 'reservation.cancelled', { reservationId: id, reason: opts.reason });
  return updated;
}

export async function markNoShow(property: Property, id: string, opts: { actor?: string } = {}) {
  const r = await getReservation(property, id);
  if (r.status !== 'CONFIRMED') throw conflict(`Cannot mark no-show for status ${r.status}`);
  const updated = await prisma.reservation.update({ where: { id }, data: { status: 'NO_SHOW' }, include: reservationInclude });
  await audit(property.orgId, 'reservation.no_show', 'Reservation', id, {}, { propertyId: property.id, actor: opts.actor });
  void emit(property.orgId, 'reservation.no_show', { reservationId: id });
  return updated;
}

export async function listReservations(
  property: Property,
  q: { status?: string; from?: string; to?: string; arrivalOn?: string; departureOn?: string; inHouseOn?: string; search?: string; take?: number },
) {
  const where: Record<string, unknown> = { propertyId: property.id };
  if (q.status) where.status = q.status;
  if (q.arrivalOn) where.arrival = parseDay(q.arrivalOn);
  if (q.departureOn) where.departure = parseDay(q.departureOn);
  if (q.inHouseOn) {
    const d = parseDay(q.inHouseOn);
    where.arrival = { lte: d };
    where.departure = { gt: d };
  }
  if (q.from && q.to) {
    where.arrival = { lt: parseDay(q.to) };
    where.departure = { gt: parseDay(q.from) };
  }
  if (q.search) {
    where.OR = [
      { confirmationNumber: { contains: q.search } },
      { guest: { lastName: { contains: q.search } } },
      { guest: { firstName: { contains: q.search } } },
      { externalRef: { contains: q.search } },
    ];
  }
  return prisma.reservation.findMany({ where, include: reservationInclude, orderBy: [{ arrival: 'asc' }], take: q.take ?? 200 });
}

export function reservationNightsSummary(arrival: Date, departure: Date) {
  return eachNight(arrival, departure).map(formatDay);
}
