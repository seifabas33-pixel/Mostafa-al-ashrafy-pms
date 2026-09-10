import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays, formatDay } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import { availability } from './availability.js';
import { resolveNightlyRate } from './rates.js';

/**
 * Channel manager bridge. Builds the ARI (availability, rates, inventory) payload that a
 * connector (SiteMinder, STAAH, eZee Centrix, RateGain, or a direct Booking.com/Expedia
 * connection) pushes, and logs each sync. Out-of-order rooms and stop-sells are already
 * reflected in availability, so every channel sees the same numbers as the front desk.
 */
export async function buildAri(property: Property, from: Date, days: number, ratePlanCode = 'BAR') {
  const to = addDays(from, days);
  const ratePlan = await prisma.ratePlan.findUnique({ where: { propertyId_code: { propertyId: property.id, code: ratePlanCode } } });
  if (!ratePlan) throw notFound('Rate plan', ratePlanCode);
  const avail = await availability(property, from, to);
  const restrictions = await prisma.restriction.findMany({ where: { propertyId: property.id, date: { gte: from, lt: to } } });
  const roomTypes = [];
  for (const a of avail) {
    const days = [];
    for (const d of a.days) {
      const date = new Date(`${d.date}T00:00:00Z`);
      const rate = await resolveNightlyRate(ratePlan, a.roomTypeId, date);
      const rs = restrictions.filter((r) => formatDay(r.date) === d.date && (!r.roomTypeId || r.roomTypeId === a.roomTypeId) && (!r.ratePlanId || r.ratePlanId === ratePlan.id));
      days.push({
        date: d.date,
        available: rs.some((r) => r.stopSell) ? 0 : d.available,
        rate,
        currency: ratePlan.currency,
        stopSell: rs.some((r) => r.stopSell),
        closedToArrival: rs.some((r) => r.cta),
        closedToDeparture: rs.some((r) => r.ctd),
        minLos: Math.max(ratePlan.minLos, ...rs.map((r) => r.minLos)),
      });
    }
    roomTypes.push({ roomTypeId: a.roomTypeId, code: a.code, name: a.name, days });
  }
  return { propertyId: property.id, propertyCode: property.code, ratePlan: ratePlan.code, generatedAt: new Date().toISOString(), roomTypes };
}

export async function pushAri(property: Property, connectionId: string, days = 90) {
  const conn = await prisma.channelConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.propertyId !== property.id) throw notFound('Channel connection', connectionId);
  const ari = await buildAri(property, property.businessDate, days);
  // Real connectors call the partner API here. We log the push and mark the connection active.
  const log = await prisma.channelSyncLog.create({ data: { connectionId: conn.id, direction: 'PUSH_ARI', status: 'OK', summary: `${ari.roomTypes.length} room types x ${days} days` } });
  await prisma.channelConnection.update({ where: { id: conn.id }, data: { status: 'ACTIVE', lastSyncAt: new Date(), lastError: '' } });
  return { log, ari };
}
