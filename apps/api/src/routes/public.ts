import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { dayString, propertyParam } from '../lib/schemas.js';
import { addDays, parseDay } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import { availability } from '../services/availability.js';
import { checkRestrictions, quoteStay, resolveNightlyRate } from '../services/rates.js';
import { createReservation } from '../services/reservations.js';
import { estimateAll } from '../services/pricing.js';
import { programme } from '../services/activities.js';

/**
 * Routes without an API key: published pricing, the embeddable booking engine, and the
 * guest-facing activities programme.
 */
export async function publicRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/pricing/plans', { schema: { tags: ['public'], security: [], description: 'Published subscription plans' } }, async () => prisma.pricingPlan.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } }).then((ps) => ps.map((p) => ({ ...p, includedModules: p.includedModules.split(',') }))));

  app.get('/pricing/estimate', { schema: { tags: ['public'], security: [], querystring: z.object({ roomCount: z.coerce.number().int().min(1), averageOccupancyPct: z.coerce.number().min(0).max(100).optional(), months: z.coerce.number().int().min(1).max(36).default(12) }), description: 'Cost estimate across all plans for a property size, with industry benchmarks' } }, async (req) => estimateAll(req.query));

  app.get('/booking-engine/:propertyId', { schema: { tags: ['public'], security: [], params: propertyParam } }, async (req) => {
    const p = await prisma.property.findUnique({ where: { id: req.params.propertyId }, include: { roomTypes: { orderBy: { sortOrder: 'asc' } }, ratePlans: { where: { active: true, bookingEngine: true } } } });
    if (!p) throw notFound('Property', req.params.propertyId);
    return { id: p.id, name: p.name, city: p.city, country: p.country, currency: p.currency, checkInTime: p.checkInTime, checkOutTime: p.checkOutTime, roomTypes: p.roomTypes.map((r) => ({ id: r.id, code: r.code, name: r.name, description: r.description, maxAdults: r.maxAdults, maxChildren: r.maxChildren, sellMode: r.sellMode })), ratePlans: p.ratePlans.map((r) => ({ id: r.id, code: r.code, name: r.name, mealPlan: r.mealPlan, minLos: r.minLos })) };
  });

  app.get('/booking-engine/:propertyId/availability', { schema: { tags: ['public'], security: [], params: propertyParam, querystring: z.object({ arrival: dayString, departure: dayString, ratePlanId: z.string().optional(), promoCode: z.string().optional() }), description: 'Available room types with a quote for the stay' } }, async (req) => {
    const p = await prisma.property.findUnique({ where: { id: req.params.propertyId } });
    if (!p) throw notFound('Property', req.params.propertyId);
    const arrival = parseDay(req.query.arrival);
    const departure = parseDay(req.query.departure);
    const plans = await prisma.ratePlan.findMany({ where: { propertyId: p.id, active: true, bookingEngine: true, ...(req.query.ratePlanId ? { id: req.query.ratePlanId } : {}) } });
    const avail = await availability(p, arrival, departure);
    const restrictions = await prisma.restriction.findMany({ where: { propertyId: p.id, date: { gte: arrival, lte: departure } } });
    const out = [];
    for (const a of avail) {
      if (a.minAvailable < 1) continue;
      const offers = [];
      for (const plan of plans) {
        const applicable = restrictions.filter((r) => (!r.roomTypeId || r.roomTypeId === a.roomTypeId) && (!r.ratePlanId || r.ratePlanId === plan.id));
        if (checkRestrictions(applicable, plan, arrival, departure, p.businessDate).length) continue;
        try {
          const q = await quoteStay(p, { roomTypeId: a.roomTypeId, ratePlanId: plan.id, arrival, departure, promoCode: req.query.promoCode });
          offers.push({ ratePlanId: plan.id, code: plan.code, name: plan.name, mealPlan: plan.mealPlan, total: q.total, subtotal: q.subtotal, nights: q.nights, promoApplied: q.promoApplied });
        } catch {
          /* plan not sellable for this stay */
        }
      }
      out.push({ roomTypeId: a.roomTypeId, code: a.code, name: a.name, available: a.minAvailable, offers: offers.sort((x, y) => x.total - y.total) });
    }
    return { arrival: req.query.arrival, departure: req.query.departure, currency: p.currency, roomTypes: out };
  });

  app.get('/booking-engine/:propertyId/calendar', { schema: { tags: ['public'], security: [], params: propertyParam, querystring: z.object({ from: dayString, days: z.coerce.number().int().min(1).max(90).default(30), roomTypeId: z.string().optional() }), description: 'Lowest available rate per day (for a calendar picker)' } }, async (req) => {
    const p = await prisma.property.findUnique({ where: { id: req.params.propertyId } });
    if (!p) throw notFound('Property', req.params.propertyId);
    const from = parseDay(req.query.from);
    const bar = await prisma.ratePlan.findFirst({ where: { propertyId: p.id, active: true, bookingEngine: true, derivedFromId: null } });
    if (!bar) return [];
    const avail = await availability(p, from, addDays(from, req.query.days));
    const days = [];
    for (let i = 0; i < req.query.days; i++) {
      const date = addDays(from, i);
      let best: number | null = null;
      let open = 0;
      for (const a of avail) {
        if (req.query.roomTypeId && a.roomTypeId !== req.query.roomTypeId) continue;
        const d = a.days[i];
        if (!d || d.available < 1) continue;
        open += d.available;
        const rate = await resolveNightlyRate(bar, a.roomTypeId, date);
        best = best === null ? rate : Math.min(best, rate);
      }
      days.push({ date: date.toISOString().slice(0, 10), available: open, fromRate: best });
    }
    return days;
  });

  app.post('/booking-engine/:propertyId/book', { schema: { tags: ['public'], security: [], params: propertyParam, body: z.object({ roomTypeId: z.string(), ratePlanId: z.string(), arrival: dayString, departure: dayString, adults: z.number().int().min(1).default(2), children: z.number().int().min(0).default(0), promoCode: z.string().optional(), specialRequests: z.string().default(''), guest: z.object({ firstName: z.string(), lastName: z.string(), email: z.string().email(), phone: z.string().optional(), nationality: z.string().length(2).optional() }) }), description: 'Direct booking from the website widget' } }, async (req, reply) => {
    const p = await prisma.property.findUnique({ where: { id: req.params.propertyId } });
    if (!p) throw notFound('Property', req.params.propertyId);
    const r = await createReservation(p, { ...req.body, source: 'BOOKING_ENGINE', actor: 'booking-engine' });
    return reply.status(201).send({ confirmationNumber: r.confirmationNumber, arrival: r.arrival, departure: r.departure, roomType: r.roomType.name, ratePlan: r.ratePlan.name, total: r.totalAmount, currency: p.currency });
  });

  app.get('/programme/:propertyId', { schema: { tags: ['public'], security: [], params: propertyParam, querystring: z.object({ from: dayString.optional(), days: z.coerce.number().int().min(1).max(14).default(7) }), description: 'Published guest entertainment programme (lobby screens, guest app)' } }, async (req) => {
    const p = await prisma.property.findUnique({ where: { id: req.params.propertyId } });
    if (!p) throw notFound('Property', req.params.propertyId);
    return programme(p, req.query.from ? parseDay(req.query.from) : p.businessDate, req.query.days, { publishedOnly: true });
  });
}
