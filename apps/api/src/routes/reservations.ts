import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { dayString, propertyAndId, propertyParam, reservationSource, reservationStatus } from '../lib/schemas.js';
import { parseDay } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import { assignRoom, cancelReservation, checkIn, checkOut, createReservation, getReservation, listReservations, markNoShow } from '../services/reservations.js';

const createBody = z.object({
  guestId: z.string().optional(),
  guest: z.object({ firstName: z.string(), lastName: z.string(), email: z.string().email().optional(), phone: z.string().optional(), nationality: z.string().length(2).optional(), documentType: z.string().optional(), documentNumber: z.string().optional() }).optional(),
  roomTypeId: z.string(),
  ratePlanId: z.string(),
  arrival: dayString,
  departure: dayString,
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  dayUse: z.boolean().default(false),
  bedsRequested: z.number().int().min(1).default(1),
  promoCode: z.string().optional(),
  source: reservationSource.default('DIRECT'),
  channel: z.string().optional(),
  externalRef: z.string().optional(),
  marketSegmentId: z.string().optional(),
  groupBlockId: z.string().optional(),
  specialRequests: z.string().default(''),
  roomId: z.string().optional(),
  allowOverbooking: z.boolean().default(false),
});

export async function reservationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/properties/:propertyId/reservations',
    { schema: { tags: ['reservations'], params: propertyParam, querystring: z.object({ status: reservationStatus.optional(), from: dayString.optional(), to: dayString.optional(), arrivalOn: dayString.optional(), departureOn: dayString.optional(), inHouseOn: dayString.optional(), search: z.string().optional(), take: z.coerce.number().int().max(1000).optional() }) } },
    async (req) => listReservations(await requireProperty(req, req.params.propertyId), req.query),
  );

  app.post('/properties/:propertyId/reservations', { schema: { tags: ['reservations'], params: propertyParam, body: createBody, description: 'Create a reservation. Checks restrictions and availability (overbooking control) and quotes the stay from the rate plan, derived rates and promo codes.' } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await createReservation(p, { ...req.body, actor: req.auth?.name }));
  });

  app.get('/properties/:propertyId/reservations/:id', { schema: { tags: ['reservations'], params: propertyAndId } }, async (req) => getReservation(await requireProperty(req, req.params.propertyId), req.params.id));

  app.patch('/properties/:propertyId/reservations/:id', { schema: { tags: ['reservations'], params: propertyAndId, body: z.object({ specialRequests: z.string().optional(), adults: z.number().int().min(1).optional(), children: z.number().int().min(0).optional(), marketSegmentId: z.string().nullable().optional(), externalRef: z.string().optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    await getReservation(p, req.params.id);
    return prisma.reservation.update({ where: { id: req.params.id }, data: req.body, include: { guest: true, roomType: true, room: true, ratePlan: true, nights: true, folios: true } });
  });

  app.post('/properties/:propertyId/reservations/:id/assign-room', { schema: { tags: ['reservations'], params: propertyAndId, body: z.object({ roomId: z.string().nullable() }) } }, async (req) => assignRoom(await requireProperty(req, req.params.propertyId), req.params.id, req.body.roomId));
  app.post('/properties/:propertyId/reservations/:id/check-in', { schema: { tags: ['reservations'], params: propertyAndId, body: z.object({ roomId: z.string().optional() }).default({}) } }, async (req) => checkIn(await requireProperty(req, req.params.propertyId), req.params.id, { roomId: req.body.roomId, actor: req.auth?.name }));
  app.post('/properties/:propertyId/reservations/:id/check-out', { schema: { tags: ['reservations'], params: propertyAndId, body: z.object({ force: z.boolean().default(false) }).default({}) } }, async (req) => checkOut(await requireProperty(req, req.params.propertyId), req.params.id, { force: req.body.force, actor: req.auth?.name }));
  app.post('/properties/:propertyId/reservations/:id/cancel', { schema: { tags: ['reservations'], params: propertyAndId, body: z.object({ reason: z.string().optional() }).default({}) } }, async (req) => cancelReservation(await requireProperty(req, req.params.propertyId), req.params.id, { reason: req.body.reason, actor: req.auth?.name }));
  app.post('/properties/:propertyId/reservations/:id/no-show', { schema: { tags: ['reservations'], params: propertyAndId } }, async (req) => markNoShow(await requireProperty(req, req.params.propertyId), req.params.id, { actor: req.auth?.name }));

  // Group blocks
  app.get('/properties/:propertyId/group-blocks', { schema: { tags: ['reservations'], params: propertyParam } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const blocks = await prisma.groupBlock.findMany({ where: { propertyId: p.id }, include: { lines: { include: { roomType: true } }, reservations: { select: { id: true, roomTypeId: true, status: true } } }, orderBy: { arrival: 'asc' } });
    return blocks.map((b) => ({ ...b, pickup: b.lines.map((l) => ({ roomTypeId: l.roomTypeId, blocked: l.quantity, pickedUp: b.reservations.filter((r) => r.roomTypeId === l.roomTypeId && r.status !== 'CANCELLED').length })) }));
  });

  app.post('/properties/:propertyId/group-blocks', { schema: { tags: ['reservations'], params: propertyParam, body: z.object({ name: z.string(), arrival: dayString, departure: dayString, releaseDate: dayString.optional(), status: z.enum(['TENTATIVE', 'DEFINITE']).default('TENTATIVE'), contact: z.string().default(''), notes: z.string().default(''), lines: z.array(z.object({ roomTypeId: z.string(), quantity: z.number().int().min(1), rate: z.number().min(0) })).min(1) }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    const { lines, arrival, departure, releaseDate, ...rest } = req.body;
    const block = await prisma.groupBlock.create({ data: { ...rest, propertyId: p.id, arrival: parseDay(arrival), departure: parseDay(departure), releaseDate: releaseDate ? parseDay(releaseDate) : undefined, lines: { create: lines } }, include: { lines: true } });
    return reply.status(201).send(block);
  });

  app.post(
    '/properties/:propertyId/group-blocks/:id/rooming-list',
    { schema: { tags: ['reservations'], params: propertyAndId, body: z.object({ ratePlanId: z.string(), guests: z.array(z.object({ firstName: z.string(), lastName: z.string(), roomTypeId: z.string(), adults: z.number().int().min(1).default(1), children: z.number().int().min(0).default(0), nationality: z.string().length(2).optional(), documentNumber: z.string().optional() })).min(1) }), description: 'Import a rooming list: creates one reservation per guest inside the block' } },
    async (req, reply) => {
      const p = await requireProperty(req, req.params.propertyId);
      const block = await prisma.groupBlock.findUnique({ where: { id: req.params.id } });
      if (!block || block.propertyId !== p.id) throw notFound('Group block', req.params.id);
      const created = [];
      for (const g of req.body.guests) {
        created.push(await createReservation(p, { guest: { firstName: g.firstName, lastName: g.lastName, nationality: g.nationality, documentNumber: g.documentNumber }, roomTypeId: g.roomTypeId, ratePlanId: req.body.ratePlanId, arrival: block.arrival.toISOString().slice(0, 10), departure: block.departure.toISOString().slice(0, 10), adults: g.adults, children: g.children, source: 'GROUP', groupBlockId: block.id, allowOverbooking: true, actor: req.auth?.name }));
      }
      return reply.status(201).send(created);
    },
  );
}
