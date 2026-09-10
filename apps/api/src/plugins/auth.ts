import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../db.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: { orgId: string; keyId: string; scopes: string[]; name: string } | null;
  }
}

const PUBLIC_PREFIXES = ['/health', '/docs', '/api/public', '/openapi.json'];

/**
 * API-key authentication. Every private route needs `x-api-key` (or `Authorization: Bearer`).
 * Keys belong to an organisation; property-scoped routes verify the property belongs to it.
 * This is deliberately simple and documented, which is the point the research report makes:
 * a public, documented API beats an undocumented "open API" claim.
 */
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (req) => {
    if (PUBLIC_PREFIXES.some((p) => req.url.startsWith(p))) return;
    const header = req.headers['x-api-key'] ?? req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) throw unauthorized();
    const apiKey = await prisma.apiKey.findUnique({ where: { key } });
    if (!apiKey || !apiKey.active) throw unauthorized();
    req.auth = { orgId: apiKey.orgId, keyId: apiKey.id, scopes: apiKey.scopes.split(','), name: apiKey.name };
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.auth.scopes.includes('write') && !req.auth.scopes.includes('admin')) {
      throw forbidden('API key has no write scope');
    }
    // fire and forget
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  });
});

/** Load a property and assert it belongs to the caller's organisation. */
export async function requireProperty(req: FastifyRequest, propertyId: string) {
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) throw notFound('Property', propertyId);
  if (req.auth && property.orgId !== req.auth.orgId) throw forbidden('Property belongs to another organisation');
  return property;
}

export function requireOrg(req: FastifyRequest): string {
  if (!req.auth) throw unauthorized();
  return req.auth.orgId;
}
