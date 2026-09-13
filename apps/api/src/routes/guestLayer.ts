import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { propertyAndId, propertyParam } from '../lib/schemas.js';
import { notFound } from '../lib/errors.js';
import { ownedGuest, ownedReservation } from '../lib/ownership.js';
import { dispatchDue } from '../services/guestJourney.js';
import { addReview, reputationSummary } from '../services/reviews.js';

export async function guestLayerRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/messages', { schema: { tags: ['guest-layer'], params: propertyParam, querystring: z.object({ status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED']).optional(), take: z.coerce.number().int().max(500).default(100) }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.guestMessage.findMany({ where: { propertyId: p.id, ...(req.query.status ? { status: req.query.status } : {}) }, include: { guest: true, reservation: { select: { confirmationNumber: true } } }, orderBy: [{ scheduledFor: 'asc' }], take: req.query.take });
  });

  app.post('/properties/:propertyId/messages', { schema: { tags: ['guest-layer'], params: propertyParam, body: z.object({ guestId: z.string(), reservationId: z.string().optional(), channel: z.enum(['WHATSAPP', 'EMAIL', 'SMS']).default('WHATSAPP'), body: z.string().min(1) }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    await ownedGuest(p, req.body.guestId);
    if (req.body.reservationId) await ownedReservation(p, req.body.reservationId);
    return reply.status(201).send(await prisma.guestMessage.create({ data: { ...req.body, propertyId: p.id, template: 'CUSTOM', scheduledFor: new Date() } }));
  });

  app.post('/properties/:propertyId/messages/dispatch', { schema: { tags: ['guest-layer'], params: propertyParam, description: 'Send every queued message whose schedule has passed (call from a cron or a provider worker)' } }, async (req) => dispatchDue(await requireProperty(req, req.params.propertyId)));

  app.get('/properties/:propertyId/reputation', { schema: { tags: ['guest-layer'], params: propertyParam, description: 'Review aggregation, sentiment and topic breakdown' } }, async (req) => reputationSummary(await requireProperty(req, req.params.propertyId)));

  app.post('/properties/:propertyId/reviews', { schema: { tags: ['guest-layer'], params: propertyParam, body: z.object({ reservationId: z.string().optional(), source: z.enum(['DIRECT', 'GOOGLE', 'BOOKING_COM', 'TRIPADVISOR', 'EXPEDIA']).default('DIRECT'), rating: z.number().min(1).max(5), title: z.string().optional(), body: z.string().optional() }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    if (req.body.reservationId) await ownedReservation(p, req.body.reservationId);
    return reply.status(201).send(await addReview(p, req.body));
  });

  app.post('/properties/:propertyId/reviews/:id/respond', { schema: { tags: ['guest-layer'], params: propertyAndId } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const r = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!r || r.propertyId !== p.id) throw notFound('Review', req.params.id);
    return prisma.review.update({ where: { id: r.id }, data: { respondedAt: new Date() } });
  });
}
