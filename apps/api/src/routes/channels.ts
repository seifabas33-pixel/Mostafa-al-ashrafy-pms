import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { dayString, propertyAndId, propertyParam } from '../lib/schemas.js';
import { parseDay } from '../lib/dates.js';
import { ownedChannelConnection } from '../lib/ownership.js';
import { buildAri, pushAri } from '../services/channels.js';
import { createReservation } from '../services/reservations.js';

export async function channelRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/channels', { schema: { tags: ['channels'], params: propertyParam } }, async (req) => prisma.channelConnection.findMany({ where: { propertyId: (await requireProperty(req, req.params.propertyId)).id }, include: { syncLogs: { orderBy: { createdAt: 'desc' }, take: 5 } } }));

  app.post('/properties/:propertyId/channels', { schema: { tags: ['channels'], params: propertyParam, body: z.object({ channel: z.enum(['BOOKING_COM', 'EXPEDIA', 'SITEMINDER', 'STAAH', 'EZEE_CENTRIX', 'RATEGAIN', 'DIRECT_API']), externalPropertyId: z.string().default('') }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await prisma.channelConnection.create({ data: { ...req.body, propertyId: p.id } }));
  });

  app.get('/properties/:propertyId/channels/ari', { schema: { tags: ['channels'], params: propertyParam, querystring: z.object({ from: dayString.optional(), days: z.coerce.number().int().min(1).max(365).default(30), ratePlan: z.string().default('BAR') }), description: 'Availability, rates and restrictions payload as pushed to channels' } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return buildAri(p, req.query.from ? parseDay(req.query.from) : p.businessDate, req.query.days, req.query.ratePlan);
  });

  app.post('/properties/:propertyId/channels/:id/push', { schema: { tags: ['channels'], params: propertyAndId, body: z.object({ days: z.number().int().min(1).max(365).default(90) }).default({}) } }, async (req) => pushAri(await requireProperty(req, req.params.propertyId), req.params.id, req.body.days));

  app.post(
    '/properties/:propertyId/channels/:id/reservations',
    { schema: { tags: ['channels'], params: propertyAndId, body: z.object({ externalRef: z.string(), guest: z.object({ firstName: z.string(), lastName: z.string(), email: z.string().optional(), phone: z.string().optional(), nationality: z.string().length(2).optional() }), roomTypeCode: z.string(), ratePlanCode: z.string().default('BAR'), arrival: dayString, departure: dayString, adults: z.number().int().min(1).default(2), children: z.number().int().min(0).default(0), specialRequests: z.string().default('') }), description: 'Inbound OTA reservation delivered by a channel manager' } },
    async (req, reply) => {
      const p = await requireProperty(req, req.params.propertyId);
      const conn = await ownedChannelConnection(p, req.params.id);
      const rt = await prisma.roomType.findUniqueOrThrow({ where: { propertyId_code: { propertyId: p.id, code: req.body.roomTypeCode } } });
      const rp = await prisma.ratePlan.findUniqueOrThrow({ where: { propertyId_code: { propertyId: p.id, code: req.body.ratePlanCode } } });
      const r = await createReservation(p, { ...req.body, roomTypeId: rt.id, ratePlanId: rp.id, source: 'OTA', channel: conn.channel, allowOverbooking: true, actor: `channel:${conn.channel}` });
      await prisma.channelSyncLog.create({ data: { connectionId: conn.id, direction: 'PULL_RESERVATIONS', status: 'OK', summary: `Imported ${req.body.externalRef} as ${r.confirmationNumber}` } });
      return reply.status(201).send(r);
    },
  );
}
