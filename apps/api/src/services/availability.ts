import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays, eachNight, formatDay } from '../lib/dates.js';

export interface RoomTypeAvailability {
  roomTypeId: string;
  code: string;
  name: string;
  sellMode: string;
  physical: number; // sellable units (rooms, or beds in hostel mode) after out-of-order
  days: { date: string; available: number; booked: number; outOfOrder: number }[];
  minAvailable: number;
}

const ACTIVE_STATUSES = ['CONFIRMED', 'CHECKED_IN'];

/**
 * Availability = sellable units minus units booked per night.
 * Out-of-order rooms are removed from inventory on every channel (Kwentra parity), while
 * out-of-service rooms remain sellable. In hostel mode each room sells as `bedsPerRoom` beds.
 */
export async function availability(property: Property, from: Date, to: Date): Promise<RoomTypeAvailability[]> {
  const nights = eachNight(from, to);
  const roomTypes = await prisma.roomType.findMany({
    where: { propertyId: property.id },
    orderBy: { sortOrder: 'asc' },
    include: { rooms: true },
  });
  const reservations = await prisma.reservation.findMany({
    where: {
      propertyId: property.id,
      status: { in: ACTIVE_STATUSES },
      arrival: { lt: to },
      departure: { gt: from },
    },
    select: { roomTypeId: true, arrival: true, departure: true, dayUse: true, bedsRequested: true },
  });
  const blocks = await prisma.groupBlock.findMany({
    where: { propertyId: property.id, status: { in: ['TENTATIVE', 'DEFINITE'] }, arrival: { lt: to }, departure: { gt: from } },
    include: { lines: true, reservations: { where: { status: { in: ACTIVE_STATUSES } }, select: { roomTypeId: true } } },
  });

  return roomTypes.map((rt) => {
    const unitsPerRoom = rt.sellMode === 'BED' ? rt.bedsPerRoom : 1;
    const ooo = rt.rooms.filter((r) => r.status === 'OUT_OF_ORDER').length;
    const physical = (rt.rooms.length - ooo) * unitsPerRoom;
    const days = nights.map((night) => {
      const nextDay = addDays(night, 1);
      let booked = 0;
      for (const r of reservations) {
        if (r.roomTypeId !== rt.id) continue;
        const stays = r.dayUse ? r.arrival.getTime() === night.getTime() : r.arrival < nextDay && r.departure > night;
        if (stays) booked += rt.sellMode === 'BED' ? r.bedsRequested : 1;
      }
      // Unpicked group-block rooms are held out of general inventory until release date.
      for (const b of blocks) {
        if (b.releaseDate && b.releaseDate < night) continue;
        if (!(b.arrival <= night && b.departure > night)) continue;
        const line = b.lines.find((l) => l.roomTypeId === rt.id);
        if (!line) continue;
        const pickedUp = b.reservations.filter((x) => x.roomTypeId === rt.id).length;
        booked += Math.max(0, line.quantity - pickedUp);
      }
      return { date: formatDay(night), available: Math.max(0, physical - booked), booked, outOfOrder: ooo };
    });
    return {
      roomTypeId: rt.id,
      code: rt.code,
      name: rt.name,
      sellMode: rt.sellMode,
      physical,
      days,
      minAvailable: days.length ? Math.min(...days.map((d) => d.available)) : physical,
    };
  });
}

/** Rooms of a type that have no overlapping assignment across the stay. */
export async function freeRooms(property: Property, roomTypeId: string, arrival: Date, departure: Date, excludeReservationId?: string) {
  const rooms = await prisma.room.findMany({
    where: { propertyId: property.id, roomTypeId, status: { not: 'OUT_OF_ORDER' } },
    orderBy: { number: 'asc' },
  });
  const overlapping = await prisma.reservation.findMany({
    where: {
      propertyId: property.id,
      roomId: { not: null },
      status: { in: ACTIVE_STATUSES },
      arrival: { lt: departure },
      departure: { gt: arrival },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
    select: { roomId: true },
  });
  const taken = new Set(overlapping.map((r) => r.roomId));
  return rooms.filter((r) => !taken.has(r.id));
}
