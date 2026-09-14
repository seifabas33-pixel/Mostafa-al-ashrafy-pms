import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { complianceType, propertyAndId, propertyParam } from '../lib/schemas.js';
import { notFound } from '../lib/errors.js';
import { ownedComplianceEntity } from '../lib/ownership.js';
import { adapters, process as processSubmission, processPending, queue, requiredTypes } from '../services/compliance.js';

export async function complianceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/compliance/adapters', { schema: { tags: ['compliance'], description: 'Supported regulatory integrations' } }, async () => Object.values(adapters).map((a) => ({ type: a.type, market: a.market, mode: 'SANDBOX' })));

  app.get('/properties/:propertyId/compliance', { schema: { tags: ['compliance'], params: propertyParam, querystring: z.object({ status: z.enum(['PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED']).optional(), type: complianceType.optional(), take: z.coerce.number().int().max(500).default(100) }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const rows = await prisma.complianceSubmission.findMany({ where: { propertyId: p.id, ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.type ? { type: req.query.type } : {}) }, orderBy: { createdAt: 'desc' }, take: req.query.take });
    return { required: { onCheckIn: requiredTypes(p, 'CHECK_IN'), onFolioClose: requiredTypes(p, 'FOLIO_CLOSED') }, submissions: rows.map((r) => ({ ...r, payload: JSON.parse(r.payload), response: JSON.parse(r.response) })) };
  });

  app.post('/properties/:propertyId/compliance', { schema: { tags: ['compliance'], params: propertyParam, body: z.object({ type: complianceType, entityType: z.enum(['FOLIO', 'RESERVATION']), entityId: z.string() }), description: 'Queue a submission manually (e.g. a credit note). The entity must belong to this property.' } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    await ownedComplianceEntity(p, req.body.entityType, req.body.entityId);
    return reply.status(201).send(await queue(p, req.body.type, req.body.entityType, req.body.entityId));
  });

  app.post('/properties/:propertyId/compliance/process', { schema: { tags: ['compliance'], params: propertyParam, description: 'Process all PENDING submissions through their adapters' } }, async (req) => processPending(await requireProperty(req, req.params.propertyId)));

  app.post('/properties/:propertyId/compliance/:id/retry', { schema: { tags: ['compliance'], params: propertyAndId } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const s = await prisma.complianceSubmission.findUnique({ where: { id: req.params.id } });
    if (!s || s.propertyId !== p.id) throw notFound('Submission', req.params.id);
    return processSubmission(p, s);
  });
}
