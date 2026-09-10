import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { dayString, propertyAndId, propertyParam } from '../lib/schemas.js';
import { addDays, eachNight, formatDay, parseDay } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import { quoteStay, resolveNightlyRate, setRateAmounts } from '../services/rates.js';
import { availability, freeRooms } from '../services/availability.js';

const ratePlanBody = z.object({
  code: z.string().min(1).max(12),
  name: z.string(),
  currency: z.string().length(3).default('EGP'),
  derivedFromId: z.string().nullable().optional(),
  derivedPct: z.number().default(0),
  derivedAmount: z.number().default(0),
  minLos: z.number().int().min(1).default(1),
  maxLos: z.number().int().min(0).default(0),
  minLeadDays: z.number().int().min(0).default(0),
  maxLeadDays: z.number().int().min(0).default(0),
  mealPlan: z.enum(['RO', 'BB', 'HB', 'FB', 'AI']).default('RO'),
  active: z.boolean().default(true),
  bookingEngine: z.boolean().default(true),
});

export async function rateRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/rate-plans', { schema: { tags: ['rates'], params: propertyParam } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.ratePlan.findMany({ where: { propertyId: p.id }, orderBy: { code: 'asc' }, include: { derivedFrom: { select: { code: true } } } });
  });

  app.post('/properties/:propertyId/rate-plans', { schema: { tags: ['rates'], params: propertyParam, body: ratePlanBody } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await prisma.ratePlan.create({ data: { ...req.body, propertyId: p.id } }));
  });

  app.patch('/properties/:propertyId/rate-plans/:id', { schema: { tags: ['rates'], params: propertyAndId, body: ratePlanBody.partial() } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const rp = await prisma.ratePlan.findUnique({ where: { id: req.params.id } });
    if (!rp || rp.propertyId !== p.id) throw notFound('Rate plan', req.params.id);
    return prisma.ratePlan.update({ where: { id: rp.id }, data: req.body });
  });

  app.put(
    '/properties/:propertyId/rate-plans/:id/amounts',
    { schema: { tags: ['rates'], params: propertyAndId, body: z.object({ roomTypeId: z.string(), from: dayString, to: dayString, amount: z.number().min(0) }), description: 'Set the nightly amount for a date range (inclusive)' } },
    async (req) => {
      const p = await requireProperty(req, req.params.propertyId);
      const rp = await prisma.ratePlan.findUnique({ where: { id: req.params.id } });
      if (!rp || rp.propertyId !== p.id) throw notFound('Rate plan', req.params.id);
      const days = await setRateAmounts(rp.id, req.body.roomTypeId, parseDay(req.body.from), parseDay(req.body.to), req.body.amount);
      return { updated: days };
    },
  );

  app.get(
    '/properties/:propertyId/rate-grid',
    { schema: { tags: ['rates'], params: propertyParam, querystring: z.object({ from: dayString, days: z.coerce.number().int().min(1).max(60).default(14) }), description: 'Resolved nightly rate per rate plan and room type, including derived plans' } },
    async (req) => {
      const p = await requireProperty(req, req.params.propertyId);
      const from = parseDay(req.query.from);
      const dates = eachNight(from, addDays(from, req.query.days));
      const plans = await prisma.ratePlan.findMany({ where: { propertyId: p.id, active: true } });
      const roomTypes = await prisma.roomType.findMany({ where: { propertyId: p.id }, orderBy: { sortOrder: 'asc' } });
      const grid = [];
      for (const plan of plans) {
        for (const rt of roomTypes) {
          const cells = [];
          for (const d of dates) cells.push({ date: formatDay(d), amount: await resolveNightlyRate(plan, rt.id, d) });
          grid.push({ ratePlanId: plan.id, ratePlanCode: plan.code, roomTypeId: rt.id, roomTypeCode: rt.code, cells });
        }
      }
      return { dates: dates.map(formatDay), grid };
    },
  );

  // Restrictions
  app.get('/properties/:propertyId/restrictions', { schema: { tags: ['rates'], params: propertyParam, querystring: z.object({ from: dayString, to: dayString }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.restriction.findMany({ where: { propertyId: p.id, date: { gte: parseDay(req.query.from), lte: parseDay(req.query.to) } }, orderBy: { date: 'asc' } });
  });

  app.post(
    '/properties/:propertyId/restrictions',
    { schema: { tags: ['rates'], params: propertyParam, body: z.object({ from: dayString, to: dayString, roomTypeId: z.string().optional(), ratePlanId: z.string().optional(), stopSell: z.boolean().default(false), cta: z.boolean().default(false), ctd: z.boolean().default(false), minLos: z.number().int().min(0).default(0), maxLos: z.number().int().min(0).default(0) }), description: 'Apply stop-sell / CTA / CTD / LOS restrictions to a date range (inclusive)' } },
    async (req, reply) => {
      const p = await requireProperty(req, req.params.propertyId);
      const { from, to, ...rest } = req.body;
      const dates = eachNight(parseDay(from), addDays(parseDay(to), 1));
      const created = await prisma.$transaction(dates.map((date) => prisma.restriction.create({ data: { ...rest, propertyId: p.id, date } })));
      return reply.status(201).send(created);
    },
  );

  app.delete('/properties/:propertyId/restrictions/:id', { schema: { tags: ['rates'], params: propertyAndId } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const r = await prisma.restriction.findUnique({ where: { id: req.params.id } });
    if (!r || r.propertyId !== p.id) throw notFound('Restriction', req.params.id);
    await prisma.restriction.delete({ where: { id: r.id } });
    return { deleted: true };
  });

  // Promo codes
  app.get('/properties/:propertyId/promo-codes', { schema: { tags: ['rates'], params: propertyParam } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.promoCode.findMany({ where: { propertyId: p.id } });
  });
  app.post('/properties/:propertyId/promo-codes', { schema: { tags: ['rates'], params: propertyParam, body: z.object({ code: z.string().min(2), ratePlanId: z.string().optional(), percentOff: z.number().min(0).max(100).default(0), amountOff: z.number().min(0).default(0), validFrom: dayString.optional(), validTo: dayString.optional() }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    const { validFrom, validTo, ...rest } = req.body;
    return reply.status(201).send(await prisma.promoCode.create({ data: { ...rest, code: rest.code.toUpperCase(), propertyId: p.id, validFrom: validFrom ? parseDay(validFrom) : undefined, validTo: validTo ? parseDay(validTo) : undefined } }));
  });

  // Availability & quotes
  app.get('/properties/:propertyId/availability', { schema: { tags: ['availability'], params: propertyParam, querystring: z.object({ from: dayString, to: dayString }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return availability(p, parseDay(req.query.from), parseDay(req.query.to));
  });

  app.get('/properties/:propertyId/free-rooms', { schema: { tags: ['availability'], params: propertyParam, querystring: z.object({ roomTypeId: z.string(), arrival: dayString, departure: dayString, excludeReservationId: z.string().optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return freeRooms(p, req.query.roomTypeId, parseDay(req.query.arrival), parseDay(req.query.departure), req.query.excludeReservationId);
  });

  app.post('/properties/:propertyId/quote', { schema: { tags: ['availability'], params: propertyParam, body: z.object({ roomTypeId: z.string(), ratePlanId: z.string(), arrival: dayString, departure: dayString, promoCode: z.string().optional(), dayUse: z.boolean().optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return quoteStay(p, { ...req.body, arrival: parseDay(req.body.arrival), departure: parseDay(req.body.departure) });
  });
}
