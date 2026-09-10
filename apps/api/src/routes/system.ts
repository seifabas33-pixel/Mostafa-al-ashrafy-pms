import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { prisma } from '../db.js';
import { requireOrg } from '../plugins/auth.js';

export async function systemRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/health', { schema: { tags: ['system'], security: [] } }, async () => ({ ok: true, time: new Date().toISOString() }));

  app.get('/api/me', { schema: { tags: ['system'], description: 'Organisation and properties visible to this API key' } }, async (req) => {
    const orgId = requireOrg(req);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, include: { properties: { orderBy: { name: 'asc' } } } });
    return { organization: { id: org.id, name: org.name, slug: org.slug, currency: org.currency }, apiKey: { name: req.auth?.name, scopes: req.auth?.scopes }, properties: org.properties };
  });
}
