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
      // A day-use stay is stored with departure === arrival, so `departure > from` drops it
      // from any window that starts on its own date — exactly the window the booking path
      // queries. Match it on arrival instead.
      OR: [{ departure: { gt: from } }, { dayUse: true, arrival: { gte: from } }],
    },
    select: { roomTypeId: true, arrival: true, departure: true, dayUse: true, bedsRequested: true },
  });
  const blocks = await prisma.groupBlock.findMany({
    where: { propertyId: property.id, status: { in: ['TENTATIVE', 'DEFINITE'] }, arrival: { lt: to }, departure: { gt: from } },
    include: { lines: true, reservations: { where: { status: { in: ACTIVE_STATUSES } }, select: { roomTypeId: true, arrival: true, departure: true } } },
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
        // Count pick-up for THIS night only. Counting it across the whole block released a
        // contracted room on every night a partial pick-up did not cover.
        const pickedUp = b.reservations.filter((x) => x.roomTypeId === rt.id && x.arrival <= night && x.departure > night).length;
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

/**
 * Rooms of a type that can still take this stay.
 *
 * In ROOM mode a room is free when nothing overlaps it. In BED mode (hostel dorms) a room
 * holds `bedsPerRoom` separately-sold beds, so it stays selectable until the beds already
 * committed across the stay plus the beds now requested would exceed that capacity.
 */
export async function freeRooms(
  property: Property,
  roomTypeId: string,
  arrival: Date,
  departure: Date,
  excludeReservationId?: string,
  bedsRequested = 1,
) {
  const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
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
      OR: [{ departure: { gt: arrival } }, { dayUse: true, arrival: { gte: arrival } }],
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
    select: { roomId: true, bedsRequested: true },
  });

  if (roomType?.sellMode !== 'BED') {
    const taken = new Set(overlapping.map((r) => r.roomId));
    return rooms.filter((r) => !taken.has(r.id));
  }

  const capacity = roomType.bedsPerRoom;
  const usedByRoom = new Map<string, number>();
  for (const r of overlapping) {
    if (!r.roomId) continue;
    usedByRoom.set(r.roomId, (usedByRoom.get(r.roomId) ?? 0) + r.bedsRequested);
  }
  return rooms.filter((r) => (usedByRoom.get(r.id) ?? 0) + bedsRequested <= capacity);
}
