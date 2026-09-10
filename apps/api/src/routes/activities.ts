import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { dayString, propertyAndId, propertyParam } from '../lib/schemas.js';
import { parseDay } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import { generateSessions, programme, signUp, updateSignupStatus } from '../services/activities.js';

const activityBody = z.object({
  code: z.string(),
  name: z.string(),
  category: z.enum(['ANIMATION', 'SPORT', 'KIDS', 'EXCURSION', 'SHOW', 'SPA', 'WELLNESS', 'DINING_EVENT']).default('ANIMATION'),
  description: z.string().default(''),
  location: z.string().default(''),
  price: z.number().min(0).default(0),
  durationMin: z.number().int().min(5).default(60),
  capacity: z.number().int().min(1).default(20),
  team: z.string().default(''),
  minAge: z.number().int().min(0).default(0),
  published: z.boolean().default(true),
  active: z.boolean().default(true),
});

export async function activityRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/activities', { schema: { tags: ['activities'], params: propertyParam } }, async (req) => prisma.activity.findMany({ where: { propertyId: (await requireProperty(req, req.params.propertyId)).id }, orderBy: { name: 'asc' }, include: { _count: { select: { sessions: true } } } }));
  app.post('/properties/:propertyId/activities', { schema: { tags: ['activities'], params: propertyParam, body: activityBody } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await prisma.activity.create({ data: { ...req.body, propertyId: p.id } }));
  });
  app.patch('/properties/:propertyId/activities/:id', { schema: { tags: ['activities'], params: propertyAndId, body: activityBody.partial() } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const a = await prisma.activity.findUnique({ where: { id: req.params.id } });
    if (!a || a.propertyId !== p.id) throw notFound('Activity', req.params.id);
    return prisma.activity.update({ where: { id: a.id }, data: req.body });
  });

  app.post('/properties/:propertyId/activities/:id/sessions', { schema: { tags: ['activities'], params: propertyAndId, body: z.object({ from: dayString, days: z.number().int().min(1).max(90).default(7), startTime: z.string().regex(/^\d{2}:\d{2}$/), weekdays: z.array(z.number().int().min(0).max(6)).optional(), host: z.string().optional() }), description: 'Generate daily sessions for an activity (optionally only on given weekdays, 0=Sunday)' } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await generateSessions(p, req.params.id, { ...req.body, from: parseDay(req.body.from) }));
  });

  app.get('/properties/:propertyId/programme', { schema: { tags: ['activities'], params: propertyParam, querystring: z.object({ from: dayString.optional(), days: z.coerce.number().int().min(1).max(31).default(7) }), description: 'Daily entertainment programme with capacity and bookings' } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return programme(p, req.query.from ? parseDay(req.query.from) : p.businessDate, req.query.days);
  });

  app.post('/properties/:propertyId/sessions/:id/signups', { schema: { tags: ['activities'], params: propertyAndId, body: z.object({ guestId: z.string().optional(), reservationId: z.string().optional(), pax: z.number().int().min(1).default(1), postToFolio: z.boolean().default(true) }), description: 'Sign a guest up; waitlists when full; posts the price to the folio for in-house guests' } }, async (req, reply) => reply.status(201).send(await signUp(await requireProperty(req, req.params.propertyId), req.params.id, req.body)));

  app.get('/properties/:propertyId/sessions/:id/signups', { schema: { tags: ['activities'], params: propertyAndId } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.activitySignup.findMany({ where: { sessionId: req.params.id, session: { activity: { propertyId: p.id } } }, include: { guest: true, reservation: { select: { confirmationNumber: true, room: { select: { number: true } } } } }, orderBy: { createdAt: 'asc' } });
  });

  app.patch('/properties/:propertyId/signups/:id', { schema: { tags: ['activities'], params: propertyAndId, body: z.object({ status: z.enum(['BOOKED', 'ATTENDED', 'NO_SHOW', 'CANCELLED']) }) } }, async (req) => updateSignupStatus(await requireProperty(req, req.params.propertyId), req.params.id, req.body.status));

  app.patch('/properties/:propertyId/sessions/:id', { schema: { tags: ['activities'], params: propertyAndId, body: z.object({ status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']).optional(), host: z.string().optional(), capacity: z.number().int().min(1).optional(), notes: z.string().optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const s = await prisma.activitySession.findUnique({ where: { id: req.params.id }, include: { activity: true } });
    if (!s || s.activity.propertyId !== p.id) throw notFound('Session', req.params.id);
    return prisma.activitySession.update({ where: { id: s.id }, data: req.body });
  });
}
