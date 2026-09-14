import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { dayString, propertyAndId, propertyParam } from '../lib/schemas.js';
import { parseDay } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import { ownedRoom } from '../lib/ownership.js';
import { emit } from '../services/webhooks.js';

export async function housekeepingRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/housekeeping/tasks', { schema: { tags: ['housekeeping'], params: propertyParam, querystring: z.object({ date: dayString.optional(), status: z.string().optional(), assignedTo: z.string().optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.housekeepingTask.findMany({
      where: { propertyId: p.id, ...(req.query.date ? { dueDate: parseDay(req.query.date) } : {}), ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.assignedTo ? { assignedTo: req.query.assignedTo } : {}) },
      include: { room: { include: { roomType: true } } },
      orderBy: [{ priority: 'desc' }, { room: { number: 'asc' } }],
    });
  });

  app.post('/properties/:propertyId/housekeeping/tasks', { schema: { tags: ['housekeeping'], params: propertyParam, body: z.object({ roomId: z.string(), type: z.enum(['CLEAN', 'INSPECT', 'TURNDOWN', 'MAINTENANCE', 'DEEP_CLEAN']).default('CLEAN'), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'RUSH']).default('NORMAL'), assignedTo: z.string().optional(), notes: z.string().default(''), dueDate: dayString.optional() }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    const { dueDate, ...rest } = req.body;
    await ownedRoom(p, rest.roomId);
    return reply.status(201).send(await prisma.housekeepingTask.create({ data: { ...rest, propertyId: p.id, dueDate: dueDate ? parseDay(dueDate) : p.businessDate } }));
  });

  app.patch(
    '/properties/:propertyId/housekeeping/tasks/:id',
    { schema: { tags: ['housekeeping'], params: propertyAndId, body: z.object({ status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(), assignedTo: z.string().nullable().optional(), notes: z.string().optional(), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'RUSH']).optional() }), description: 'Update a task; completing a CLEAN task marks the room CLEAN, completing INSPECT marks it INSPECTED, MAINTENANCE done puts an out-of-order room back in service' } },
    async (req) => {
      const p = await requireProperty(req, req.params.propertyId);
      const t = await prisma.housekeepingTask.findUnique({ where: { id: req.params.id }, include: { room: true } });
      if (!t || t.propertyId !== p.id) throw notFound('Task', req.params.id);
      const data: Record<string, unknown> = { ...req.body };
      if (req.body.status === 'IN_PROGRESS') data.startedAt = new Date();
      if (req.body.status === 'DONE') data.doneAt = new Date();
      const updated = await prisma.housekeepingTask.update({ where: { id: t.id }, data });
      // Scope the room writes to this property as well as the task, so a task row that
      // predates the ownership check above can never reach another property's room.
      if (req.body.status === 'IN_PROGRESS' && t.type !== 'MAINTENANCE') await prisma.room.updateMany({ where: { id: t.roomId, propertyId: p.id }, data: { hkStatus: 'IN_PROGRESS' } });
      if (req.body.status === 'DONE') {
        const roomData: Record<string, unknown> = {};
        if (t.type === 'CLEAN' || t.type === 'DEEP_CLEAN' || t.type === 'TURNDOWN') roomData.hkStatus = 'CLEAN';
        if (t.type === 'INSPECT') roomData.hkStatus = 'INSPECTED';
        if (t.type === 'MAINTENANCE' && t.room.status === 'OUT_OF_ORDER') roomData.status = 'VACANT';
        if (Object.keys(roomData).length) {
          await prisma.room.updateMany({ where: { id: t.roomId, propertyId: p.id }, data: roomData });
          const room = await prisma.room.findUnique({ where: { id: t.roomId } });
          if (room) void emit(p.orgId, 'room.status_changed', { roomId: room.id, status: room.status, hkStatus: room.hkStatus });
        }
        void emit(p.orgId, 'housekeeping.task_done', { taskId: t.id, roomId: t.roomId, type: t.type });
      }
      return updated;
    },
  );

  app.get('/properties/:propertyId/housekeeping/board', { schema: { tags: ['housekeeping'], params: propertyParam, description: 'Room status board: every room with occupancy, housekeeping status, today\'s task and next arrival/departure' } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const rooms = await prisma.room.findMany({
      where: { propertyId: p.id },
      include: {
        roomType: true,
        hkTasks: { where: { dueDate: p.businessDate, status: { not: 'CANCELLED' } } },
        reservations: { where: { status: { in: ['CHECKED_IN', 'CONFIRMED'] }, departure: { gte: p.businessDate } }, include: { guest: true }, orderBy: { arrival: 'asc' }, take: 2 },
      },
      orderBy: { number: 'asc' },
    });
    return rooms.map((r) => {
      const inHouse = r.reservations.find((x) => x.status === 'CHECKED_IN');
      const nextArrival = r.reservations.find((x) => x.status === 'CONFIRMED');
      return {
        roomId: r.id,
        number: r.number,
        floor: r.floor,
        roomType: r.roomType.code,
        status: r.status,
        hkStatus: r.hkStatus,
        tasks: r.hkTasks.map((t) => ({ id: t.id, type: t.type, status: t.status, priority: t.priority, assignedTo: t.assignedTo })),
        guest: inHouse ? `${inHouse.guest.firstName} ${inHouse.guest.lastName}` : null,
        departsToday: inHouse ? inHouse.departure.getTime() === p.businessDate.getTime() : false,
        arrivalToday: nextArrival ? nextArrival.arrival.getTime() === p.businessDate.getTime() : false,
      };
    });
  });
}
