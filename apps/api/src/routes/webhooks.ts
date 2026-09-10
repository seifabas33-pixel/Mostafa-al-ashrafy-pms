import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireOrg } from '../plugins/auth.js';
import { idParam } from '../lib/schemas.js';
import { apiKeyString } from '../lib/ids.js';
import { notFound } from '../lib/errors.js';
import { attemptDelivery, WEBHOOK_EVENTS } from '../services/webhooks.js';

export async function webhookRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/webhooks/events', { schema: { tags: ['webhooks'], description: 'Event names a subscription can listen to' } }, async () => WEBHOOK_EVENTS);

  app.get('/webhooks', { schema: { tags: ['webhooks'] } }, async (req) => {
    const subs = await prisma.webhookSubscription.findMany({ where: { orgId: requireOrg(req) }, include: { _count: { select: { deliveries: true } } } });
    return subs.map((s) => ({ ...s, secret: undefined, events: s.events.split(',') }));
  });

  app.post('/webhooks', { schema: { tags: ['webhooks'], body: z.object({ url: z.string().url(), events: z.array(z.string()).min(1) }), description: 'Create a subscription; the returned secret signs every delivery (HMAC-SHA256 in x-pms-signature)' } }, async (req, reply) => {
    const sub = await prisma.webhookSubscription.create({ data: { orgId: requireOrg(req), url: req.body.url, events: req.body.events.join(','), secret: randomBytes(24).toString('hex') } });
    return reply.status(201).send({ ...sub, events: req.body.events });
  });

  app.delete('/webhooks/:id', { schema: { tags: ['webhooks'], params: idParam } }, async (req) => {
    const s = await prisma.webhookSubscription.findUnique({ where: { id: req.params.id } });
    if (!s || s.orgId !== requireOrg(req)) throw notFound('Subscription', req.params.id);
    await prisma.webhookSubscription.update({ where: { id: s.id }, data: { active: false } });
    return { deactivated: true };
  });

  app.get('/webhooks/:id/deliveries', { schema: { tags: ['webhooks'], params: idParam, querystring: z.object({ take: z.coerce.number().int().max(500).default(50) }) } }, async (req) => {
    const s = await prisma.webhookSubscription.findUnique({ where: { id: req.params.id } });
    if (!s || s.orgId !== requireOrg(req)) throw notFound('Subscription', req.params.id);
    const rows = await prisma.webhookDelivery.findMany({ where: { subscriptionId: s.id }, orderBy: { createdAt: 'desc' }, take: req.query.take });
    return rows.map((d) => ({ ...d, payload: JSON.parse(d.payload) }));
  });

  app.post('/webhooks/deliveries/:id/retry', { schema: { tags: ['webhooks'], params: idParam } }, async (req) => {
    const d = await prisma.webhookDelivery.findUnique({ where: { id: req.params.id }, include: { subscription: true } });
    if (!d || d.subscription.orgId !== requireOrg(req)) throw notFound('Delivery', req.params.id);
    return attemptDelivery(d.id);
  });

  // API keys (admin scope)
  app.get('/api-keys', { schema: { tags: ['webhooks'] } }, async (req) => {
    const keys = await prisma.apiKey.findMany({ where: { orgId: requireOrg(req) } });
    return keys.map((k) => ({ ...k, key: `${k.key.slice(0, 8)}…` }));
  });
  app.post('/api-keys', { schema: { tags: ['webhooks'], body: z.object({ name: z.string(), scopes: z.array(z.enum(['read', 'write', 'admin'])).default(['read', 'write']) }) } }, async (req, reply) => {
    const k = await prisma.apiKey.create({ data: { orgId: requireOrg(req), name: req.body.name, scopes: req.body.scopes.join(','), key: apiKeyString() } });
    return reply.status(201).send(k);
  });
}
