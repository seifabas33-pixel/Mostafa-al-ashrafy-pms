import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireOrg, requireProperty } from '../plugins/auth.js';
import { dayString, propertyAndId, propertyParam } from '../lib/schemas.js';
import { parseDay, todayUtc } from '../lib/dates.js';
import { conflict, notFound } from '../lib/errors.js';
import { emit } from '../services/webhooks.js';

const propertyBody = z.object({
  code: z.string().min(2).max(8),
  name: z.string().min(1),
  city: z.string(),
  country: z.string().length(2),
  timezone: z.string().default('Africa/Cairo'),
  currency: z.string().length(3).default('EGP'),
  calendar: z.enum(['GREGORIAN', 'HIJRI', 'BOTH']).default('GREGORIAN'),
  taxRegime: z.enum(['EG_ETA', 'SA_ZATCA', 'QA', 'NONE']).default('EG_ETA'),
  vatRate: z.number().min(0).max(100).default(14),
  serviceRate: z.number().min(0).max(100).default(12),
  businessDate: dayString.optional(),
  checkInTime: z.string().default('14:00'),
  checkOutTime: z.string().default('12:00'),
});

const roomTypeBody = z.object({
  code: z.string().min(1).max(10),
  name: z.string(),
  description: z.string().default(''),
  maxAdults: z.number().int().min(1).default(2),
  maxChildren: z.number().int().min(0).default(1),
  sellMode: z.enum(['ROOM', 'BED']).default('ROOM'),
  bedsPerRoom: z.number().int().min(1).default(1),
  baseRate: z.number().min(0).default(0),
  sortOrder: z.number().int().default(0),
});

const roomBody = z.object({
  roomTypeId: z.string(),
  number: z.string(),
  floor: z.string().default(''),
  connectedRoomId: z.string().optional(),
  notes: z.string().default(''),
});

export async function propertyRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties', { schema: { tags: ['properties'] } }, async (req) => {
    return prisma.property.findMany({ where: { orgId: requireOrg(req) }, orderBy: { name: 'asc' }, include: { _count: { select: { rooms: true, roomTypes: true } } } });
  });

  app.post('/properties', { schema: { tags: ['properties'], body: propertyBody } }, async (req, reply) => {
    const { businessDate, ...rest } = req.body;
    const p = await prisma.property.create({ data: { ...rest, orgId: requireOrg(req), businessDate: businessDate ? parseDay(businessDate) : todayUtc() } });
    return reply.status(201).send(p);
  });

  app.get('/properties/:propertyId', { schema: { tags: ['properties'], params: propertyParam } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.property.findUniqueOrThrow({ where: { id: p.id }, include: { roomTypes: { orderBy: { sortOrder: 'asc' } }, subscription: { include: { pricingPlan: true } }, _count: { select: { rooms: true } } } });
  });

  app.patch('/properties/:propertyId', { schema: { tags: ['properties'], params: propertyParam, body: propertyBody.partial() } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const { businessDate, ...rest } = req.body;
    return prisma.property.update({ where: { id: p.id }, data: { ...rest, ...(businessDate ? { businessDate: parseDay(businessDate) } : {}) } });
  });

  // Room types
  app.get('/properties/:propertyId/room-types', { schema: { tags: ['properties'], params: propertyParam } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.roomType.findMany({ where: { propertyId: p.id }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { rooms: true } } } });
  });

  app.post('/properties/:propertyId/room-types', { schema: { tags: ['properties'], params: propertyParam, body: roomTypeBody } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await prisma.roomType.create({ data: { ...req.body, propertyId: p.id } }));
  });

  app.patch('/properties/:propertyId/room-types/:id', { schema: { tags: ['properties'], params: propertyAndId, body: roomTypeBody.partial() } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const rt = await prisma.roomType.findUnique({ where: { id: req.params.id } });
    if (!rt || rt.propertyId !== p.id) throw notFound('Room type', req.params.id);
    return prisma.roomType.update({ where: { id: rt.id }, data: req.body });
  });

  // Rooms
  app.get('/properties/:propertyId/rooms', { schema: { tags: ['properties'], params: propertyParam, querystring: z.object({ roomTypeId: z.string().optional(), status: z.string().optional(), hkStatus: z.string().optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const rooms = await prisma.room.findMany({
      where: { propertyId: p.id, ...(req.query.roomTypeId ? { roomTypeId: req.query.roomTypeId } : {}), ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.hkStatus ? { hkStatus: req.query.hkStatus } : {}) },
      include: { roomType: true, reservations: { where: { status: 'CHECKED_IN' }, include: { guest: true }, take: 1 } },
      orderBy: { number: 'asc' },
    });
    return rooms.map((r) => ({ ...r, currentGuest: r.reservations[0] ? { reservationId: r.reservations[0].id, name: `${r.reservations[0].guest.firstName} ${r.reservations[0].guest.lastName}`, departure: r.reservations[0].departure, vip: r.reservations[0].guest.vip } : null, reservations: undefined }));
  });

  app.post('/properties/:propertyId/rooms', { schema: { tags: ['properties'], params: propertyParam, body: roomBody } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await prisma.room.create({ data: { ...req.body, propertyId: p.id } }));
  });

  app.post('/properties/:propertyId/rooms/bulk', { schema: { tags: ['properties'], params: propertyParam, body: z.object({ roomTypeId: z.string(), numbers: z.array(z.string()).min(1), floor: z.string().default('') }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    const created = await prisma.$transaction(req.body.numbers.map((number) => prisma.room.create({ data: { propertyId: p.id, roomTypeId: req.body.roomTypeId, number, floor: req.body.floor } })));
    return reply.status(201).send(created);
  });

  app.patch(
    '/properties/:propertyId/rooms/:id',
    { schema: { tags: ['properties'], params: propertyAndId, body: z.object({ status: z.enum(['VACANT', 'OUT_OF_ORDER', 'OUT_OF_SERVICE']).optional(), hkStatus: z.enum(['CLEAN', 'DIRTY', 'INSPECTED', 'IN_PROGRESS']).optional(), notes: z.string().optional(), floor: z.string().optional(), connectedRoomId: z.string().nullable().optional() }), description: 'Set a room out of order (removes it from sale on every channel), back in order, or update housekeeping status' } },
    async (req) => {
      const p = await requireProperty(req, req.params.propertyId);
      const room = await prisma.room.findUnique({ where: { id: req.params.id } });
      if (!room || room.propertyId !== p.id) throw notFound('Room', req.params.id);
      if (req.body.status && room.status === 'OCCUPIED') throw conflict('Room is occupied; check the guest out or move them first');
      const updated = await prisma.room.update({ where: { id: room.id }, data: req.body });
      if (req.body.status || req.body.hkStatus) void emit(p.orgId, 'room.status_changed', { roomId: room.id, status: updated.status, hkStatus: updated.hkStatus });
      return updated;
    },
  );

  // Users (staff directory; authentication for the web app is a follow-up)
  app.get('/users', { schema: { tags: ['properties'] } }, async (req) => prisma.user.findMany({ where: { orgId: requireOrg(req) }, orderBy: { name: 'asc' } }));
  app.post('/users', { schema: { tags: ['properties'], body: z.object({ email: z.string().email(), name: z.string(), role: z.enum(['OWNER', 'GM', 'FRONT_DESK', 'HOUSEKEEPING', 'FNB', 'ACCOUNTING', 'ANIMATION', 'READONLY']).default('FRONT_DESK') }) } }, async (req, reply) => {
    return reply.status(201).send(await prisma.user.create({ data: { ...req.body, orgId: requireOrg(req) } }));
  });
}
