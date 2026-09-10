import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { chargeCategory, paymentMethod, propertyAndId, propertyParam } from '../lib/schemas.js';
import { notFound } from '../lib/errors.js';
import { closeFolio, folioTotals, postCharge, postPayment, splitFolio } from '../services/folios.js';
import { queueInvoice } from '../services/compliance.js';

export async function folioRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/folios', { schema: { tags: ['folios'], params: propertyParam, querystring: z.object({ status: z.enum(['OPEN', 'CLOSED']).optional(), reservationId: z.string().optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.folio.findMany({ where: { propertyId: p.id, ...req.query }, include: { guest: true, reservation: { select: { confirmationNumber: true, room: { select: { number: true } } } } }, orderBy: { createdAt: 'desc' }, take: 300 });
  });

  app.get('/properties/:propertyId/folios/:id', { schema: { tags: ['folios'], params: propertyAndId } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const f = await prisma.folio.findUnique({ where: { id: req.params.id }, include: { guest: true, reservation: { include: { room: true, roomType: true } } } });
    if (!f || f.propertyId !== p.id) throw notFound('Folio', req.params.id);
    return { ...f, totals: await folioTotals(f.id) };
  });

  app.post('/properties/:propertyId/folios/:id/charges', { schema: { tags: ['folios'], params: propertyAndId, body: z.object({ category: chargeCategory, description: z.string(), unitAmount: z.number(), quantity: z.number().positive().default(1), taxable: z.boolean().default(true), serviceable: z.boolean().default(true) }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await postCharge(p, req.params.id, { ...req.body, postedBy: req.auth?.name }));
  });

  app.post('/properties/:propertyId/folios/:id/payments', { schema: { tags: ['folios'], params: propertyAndId, body: z.object({ amount: z.number().positive(), method: paymentMethod, description: z.string().optional(), referenceId: z.string().optional() }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await postPayment(p, req.params.id, { ...req.body, postedBy: req.auth?.name }));
  });

  app.post('/properties/:propertyId/folios/:id/split', { schema: { tags: ['folios'], params: propertyAndId, body: z.object({ lineIds: z.array(z.string()).min(1) }), description: 'Move lines onto a new split folio (e.g. company pays room, guest pays extras)' } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await splitFolio(p, req.params.id, req.body.lineIds));
  });

  app.post('/properties/:propertyId/folios/:id/close', { schema: { tags: ['folios'], params: propertyAndId, description: 'Close a settled folio and queue the fiscal e-invoice (ETA or ZATCA) for it' } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    const f = await prisma.folio.findUnique({ where: { id: req.params.id } });
    if (!f || f.propertyId !== p.id) throw notFound('Folio', req.params.id);
    const closed = await closeFolio(p, f.id);
    const queued = await queueInvoice(p, f.id);
    return { folio: closed, complianceQueued: queued };
  });
}
