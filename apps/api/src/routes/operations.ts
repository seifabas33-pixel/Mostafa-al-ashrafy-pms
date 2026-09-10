import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireOrg, requireProperty } from '../plugins/auth.js';
import { dayString, propertyParam } from '../lib/schemas.js';
import { dualCalendar, parseDay, toHijri } from '../lib/dates.js';
import { runNightAudit } from '../services/nightAudit.js';
import { alerts, dashboard, occupancyForecast, portfolioReport } from '../services/kpis.js';

export async function operationsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/dashboard', { schema: { tags: ['operations'], params: propertyParam, description: 'Live front-office dashboard: occupancy, ADR, RevPAR, arrivals, departures, housekeeping, 14-day forecast' } }, async (req) => dashboard(await requireProperty(req, req.params.propertyId)));

  app.get('/properties/:propertyId/alerts', { schema: { tags: ['operations'], params: propertyParam, querystring: z.object({ floorRate: z.coerce.number().optional(), lowAvailability: z.coerce.number().int().optional() }), description: 'Rule-based operational alerts (rate below floor, low availability, VIP/returning arrivals, low stock, pending POs, compliance rejections, departure balances)' } }, async (req) => alerts(await requireProperty(req, req.params.propertyId), req.query));

  app.get('/properties/:propertyId/forecast', { schema: { tags: ['operations'], params: propertyParam, querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) } }, async (req) => occupancyForecast(await requireProperty(req, req.params.propertyId), req.query.days));

  app.post('/properties/:propertyId/night-audit', { schema: { tags: ['operations'], params: propertyParam, description: 'Run the automated night audit for the current business date and roll the date forward' } }, async (req) => runNightAudit(await requireProperty(req, req.params.propertyId), { actor: req.auth?.name }));

  app.get('/properties/:propertyId/night-audit', { schema: { tags: ['operations'], params: propertyParam, querystring: z.object({ from: dayString.optional(), to: dayString.optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const runs = await prisma.nightAuditRun.findMany({ where: { propertyId: p.id, ...(req.query.from ? { businessDate: { gte: parseDay(req.query.from), ...(req.query.to ? { lte: parseDay(req.query.to) } : {}) } } : {}) }, orderBy: { businessDate: 'desc' }, take: 90 });
    return runs.map((r) => ({ ...r, calendar: dualCalendar(r.businessDate) }));
  });

  app.get('/reports/portfolio', { schema: { tags: ['operations'], querystring: z.object({ from: dayString, to: dayString }), description: 'Cross-property KPIs (occupancy, ADR, RevPAR, revenue) with Hijri and Gregorian dates' } }, async (req) => portfolioReport(requireOrg(req), parseDay(req.query.from), parseDay(req.query.to)));

  app.get('/calendar/convert', { schema: { tags: ['operations'], querystring: z.object({ date: dayString }) } }, async (req) => ({ gregorian: req.query.date, hijri: toHijri(parseDay(req.query.date)) }));

  app.get('/audit-log', { schema: { tags: ['operations'], querystring: z.object({ propertyId: z.string().optional(), take: z.coerce.number().int().max(500).default(100) }) } }, async (req) => {
    const rows = await prisma.auditLog.findMany({ where: { orgId: requireOrg(req), ...(req.query.propertyId ? { propertyId: req.query.propertyId } : {}) }, orderBy: { createdAt: 'desc' }, take: req.query.take });
    return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
  });
}
