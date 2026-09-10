import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays, dualCalendar, formatDay } from '../lib/dates.js';
import { round2 } from '../lib/money.js';
import { availability } from './availability.js';

/**
 * Live dashboard. The report's most repeated reviewer complaint about Kwentra is that the
 * dashboard "does not show live occupancy the way managers want" and has limited filtering.
 * Everything here is computed from current rows, not from the last audit.
 */
export async function dashboard(property: Property) {
  const today = property.businessDate;
  const [rooms, inHouse, arrivals, departures, todayLines, hk, pendingPo, pendingCompliance] = await Promise.all([
    prisma.room.findMany({ where: { propertyId: property.id }, include: { roomType: true } }),
    prisma.reservation.findMany({ where: { propertyId: property.id, status: 'CHECKED_IN' }, include: { nights: true, roomType: true, guest: true, room: true } }),
    prisma.reservation.findMany({ where: { propertyId: property.id, arrival: today, status: { in: ['CONFIRMED', 'CHECKED_IN'] } }, include: { guest: true, roomType: true, room: true } }),
    prisma.reservation.findMany({ where: { propertyId: property.id, departure: today, status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } }, include: { guest: true, roomType: true, room: true, folios: true } }),
    prisma.folioLine.findMany({ where: { businessDate: today, kind: 'CHARGE', folio: { propertyId: property.id } } }),
    prisma.housekeepingTask.groupBy({ by: ['status'], where: { propertyId: property.id, dueDate: today }, _count: { _all: true } }),
    prisma.purchaseOrder.count({ where: { propertyId: property.id, status: 'PENDING_APPROVAL' } }),
    prisma.complianceSubmission.count({ where: { propertyId: property.id, status: { in: ['PENDING', 'REJECTED'] } } }),
  ]);

  const ooo = rooms.filter((r) => r.status === 'OUT_OF_ORDER').length;
  const sellable = rooms.length - ooo;
  const occupied = inHouse.filter((r) => !r.dayUse).length;
  const occupancyPct = sellable ? round2((occupied / sellable) * 100) : 0;
  const todaysRoomRevenue = round2(inHouse.reduce((s, r) => s + (r.nights.find((n) => n.date.getTime() === today.getTime())?.rate ?? 0), 0));
  const adr = occupied ? round2(todaysRoomRevenue / occupied) : 0;
  const revpar = sellable ? round2(todaysRoomRevenue / sellable) : 0;
  const postedRevenue = round2(todayLines.reduce((s, l) => s + l.amount, 0));
  const fnbRevenue = round2(todayLines.filter((l) => l.category === 'FNB').reduce((s, l) => s + l.amount, 0));

  const byRoomType = Object.values(
    rooms.reduce<Record<string, { roomTypeId: string; code: string; name: string; total: number; occupied: number; ooo: number; dirty: number }>>((acc, r) => {
      const k = r.roomTypeId;
      acc[k] ??= { roomTypeId: k, code: r.roomType.code, name: r.roomType.name, total: 0, occupied: 0, ooo: 0, dirty: 0 };
      acc[k].total++;
      if (r.status === 'OCCUPIED') acc[k].occupied++;
      if (r.status === 'OUT_OF_ORDER') acc[k].ooo++;
      if (r.hkStatus === 'DIRTY') acc[k].dirty++;
      return acc;
    }, {}),
  ).map((x) => ({ ...x, occupancyPct: x.total - x.ooo ? round2((x.occupied / (x.total - x.ooo)) * 100) : 0 }));

  const forecast = await occupancyForecast(property, 14);

  return {
    businessDate: dualCalendar(today),
    property: { id: property.id, name: property.name, currency: property.currency, taxRegime: property.taxRegime },
    rooms: { total: rooms.length, sellable, occupied, outOfOrder: ooo, vacantClean: rooms.filter((r) => r.status === 'VACANT' && r.hkStatus !== 'DIRTY').length, vacantDirty: rooms.filter((r) => r.status === 'VACANT' && r.hkStatus === 'DIRTY').length },
    kpis: { occupancyPct, adr, revpar, roomRevenue: todaysRoomRevenue, postedRevenue, fnbRevenue, inHouseGuests: inHouse.reduce((s, r) => s + r.adults + r.children, 0) },
    arrivals: arrivals.map((r) => ({ id: r.id, confirmationNumber: r.confirmationNumber, guest: `${r.guest.firstName} ${r.guest.lastName}`, vip: r.guest.vip, roomType: r.roomType.code, room: r.room?.number ?? null, status: r.status, adults: r.adults, children: r.children })),
    departures: departures.map((r) => ({ id: r.id, confirmationNumber: r.confirmationNumber, guest: `${r.guest.firstName} ${r.guest.lastName}`, roomType: r.roomType.code, room: r.room?.number ?? null, status: r.status, balance: round2(r.folios.reduce((s, f) => s + f.balance, 0)) })),
    housekeeping: Object.fromEntries(hk.map((h) => [h.status, h._count._all])),
    byRoomType,
    forecast,
    attention: { purchaseOrdersPendingApproval: pendingPo, complianceOpen: pendingCompliance },
  };
}

export async function occupancyForecast(property: Property, days: number) {
  const from = property.businessDate;
  const to = addDays(from, days);
  const avail = await availability(property, from, to);
  const totalPhysical = avail.reduce((s, a) => s + a.physical, 0);
  return Array.from({ length: days }, (_, i) => {
    const date = formatDay(addDays(from, i));
    const booked = avail.reduce((s, a) => s + (a.days[i]?.booked ?? 0), 0);
    return { date, booked, available: totalPhysical - booked, occupancyPct: totalPhysical ? round2((booked / totalPhysical) * 100) : 0 };
  });
}

export interface Alert {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  code: string;
  message: string;
  entity?: { type: string; id: string };
}

/**
 * Rule-based operational alerts, the deterministic core of a K-AI-style assistant:
 * rooms sold below a floor rate, low-availability dates, VIP arrivals, low stock,
 * POs awaiting approval, compliance rejections, departures with balances.
 */
export async function alerts(property: Property, opts: { floorRate?: number; lowAvailability?: number } = {}): Promise<Alert[]> {
  const out: Alert[] = [];
  const today = property.businessDate;
  const floor = opts.floorRate ?? 0;
  const low = opts.lowAvailability ?? 5;

  if (floor > 0) {
    const cheap = await prisma.reservationNight.findMany({
      where: { rate: { lt: floor }, date: { gte: today }, reservation: { propertyId: property.id, status: { in: ['CONFIRMED', 'CHECKED_IN'] } } },
      include: { reservation: { include: { guest: true } } },
      take: 20,
    });
    for (const n of cheap) out.push({ severity: 'WARNING', code: 'RATE_BELOW_FLOOR', message: `${n.reservation.confirmationNumber} (${n.reservation.guest.lastName}) sold at ${n.rate} on ${formatDay(n.date)}, below floor ${floor}`, entity: { type: 'Reservation', id: n.reservationId } });
  }

  const forecast = await occupancyForecast(property, 30);
  for (const f of forecast) if (f.available <= low && f.available >= 0) out.push({ severity: 'INFO', code: 'LOW_AVAILABILITY', message: `${f.date}: only ${f.available} units left (${f.occupancyPct}% booked)` });

  const vips = await prisma.reservation.findMany({ where: { propertyId: property.id, arrival: today, status: 'CONFIRMED', guest: { vip: true } }, include: { guest: true } });
  for (const v of vips) out.push({ severity: 'INFO', code: 'VIP_ARRIVAL', message: `VIP arrival today: ${v.guest.firstName} ${v.guest.lastName} (${v.confirmationNumber})`, entity: { type: 'Reservation', id: v.id } });

  const returning = await prisma.reservation.findMany({ where: { propertyId: property.id, arrival: today, status: 'CONFIRMED' }, include: { guest: { include: { reservations: { where: { status: 'CHECKED_OUT' }, select: { id: true } } } } } });
  for (const r of returning) if (r.guest.reservations.length > 0 && !r.guest.vip) out.push({ severity: 'INFO', code: 'RETURNING_GUEST', message: `Returning guest arriving: ${r.guest.firstName} ${r.guest.lastName} (${r.guest.reservations.length} previous stays)`, entity: { type: 'Reservation', id: r.id } });

  const lowStock = await prisma.stockLevel.findMany({ where: { ingredient: { propertyId: property.id, parLevel: { gt: 0 } } }, include: { ingredient: true, warehouse: true } });
  for (const s of lowStock) if (s.quantity < s.ingredient.parLevel) out.push({ severity: 'WARNING', code: 'LOW_STOCK', message: `${s.ingredient.name} in ${s.warehouse.name}: ${s.quantity} ${s.ingredient.unit} (par ${s.ingredient.parLevel})`, entity: { type: 'Ingredient', id: s.ingredientId } });

  const pos = await prisma.purchaseOrder.findMany({ where: { propertyId: property.id, status: 'PENDING_APPROVAL' } });
  for (const p of pos) out.push({ severity: 'INFO', code: 'PO_PENDING_APPROVAL', message: `Purchase order ${p.number} awaiting approval (${p.total})`, entity: { type: 'PurchaseOrder', id: p.id } });

  const rejected = await prisma.complianceSubmission.findMany({ where: { propertyId: property.id, status: 'REJECTED' } });
  for (const c of rejected) out.push({ severity: 'CRITICAL', code: 'COMPLIANCE_REJECTED', message: `${c.type} for ${c.entityType} ${c.entityId} rejected: ${c.lastError || 'see response'}`, entity: { type: 'ComplianceSubmission', id: c.id } });

  const departing = await prisma.reservation.findMany({ where: { propertyId: property.id, departure: today, status: 'CHECKED_IN' }, include: { folios: true, guest: true } });
  for (const d of departing) {
    const bal = round2(d.folios.reduce((s, f) => s + f.balance, 0));
    if (bal > 0.005) out.push({ severity: 'WARNING', code: 'DEPARTURE_BALANCE', message: `${d.guest.lastName} departs today with balance ${bal}`, entity: { type: 'Reservation', id: d.id } });
  }
  return out;
}

/** Consolidated multi-property KPIs from stored night-audit runs, in both calendars. */
export async function portfolioReport(orgId: string, from: Date, to: Date) {
  const properties = await prisma.property.findMany({ where: { orgId }, include: { nightAudits: { where: { businessDate: { gte: from, lte: to } }, orderBy: { businessDate: 'asc' } } } });
  const rows = properties.map((p) => {
    const runs = p.nightAudits;
    const roomNights = runs.reduce((s, r) => s + r.roomsAvailable, 0);
    const occupiedNights = runs.reduce((s, r) => s + r.roomsOccupied, 0);
    const roomRevenue = round2(runs.reduce((s, r) => s + r.roomRevenue, 0));
    const totalRevenue = round2(runs.reduce((s, r) => s + r.totalRevenue, 0));
    return {
      propertyId: p.id,
      code: p.code,
      name: p.name,
      country: p.country,
      currency: p.currency,
      days: runs.length,
      occupancyPct: roomNights ? round2((occupiedNights / roomNights) * 100) : 0,
      adr: occupiedNights ? round2(roomRevenue / occupiedNights) : 0,
      revpar: roomNights ? round2(roomRevenue / roomNights) : 0,
      roomRevenue,
      fnbRevenue: round2(runs.reduce((s, r) => s + r.fnbRevenue, 0)),
      totalRevenue,
      daily: runs.map((r) => ({ ...dualCalendar(r.businessDate), occupancyPct: r.occupancyPct, adr: r.adr, revpar: r.revpar, totalRevenue: r.totalRevenue })),
    };
  });
  return { period: { from: dualCalendar(from), to: dualCalendar(to) }, properties: rows };
}
