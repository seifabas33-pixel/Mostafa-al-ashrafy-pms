import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireOrg } from '../plugins/auth.js';
import { dayString, idParam } from '../lib/schemas.js';
import { parseDay } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';

const guestBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  nationality: z.string().length(2).optional(),
  documentType: z.enum(['PASSPORT', 'NATIONAL_ID', 'RESIDENCE']).optional(),
  documentNumber: z.string().optional(),
  dateOfBirth: dayString.optional(),
  vip: z.boolean().default(false),
  preferences: z.record(z.any()).default({}),
  notes: z.string().default(''),
});

export async function guestRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/guests', { schema: { tags: ['guests'], querystring: z.object({ search: z.string().optional(), vip: z.coerce.boolean().optional(), take: z.coerce.number().int().min(1).max(500).default(100) }) } }, async (req) => {
    const orgId = requireOrg(req);
    const { search, vip, take } = req.query;
    return prisma.guest.findMany({
      where: {
        orgId,
        ...(vip !== undefined ? { vip } : {}),
        ...(search ? { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }, { documentNumber: { contains: search } }] } : {}),
      },
      orderBy: { lastName: 'asc' },
      take,
      include: { _count: { select: { reservations: true } } },
    });
  });

  app.post('/guests', { schema: { tags: ['guests'], body: guestBody } }, async (req, reply) => {
    const { dateOfBirth, preferences, ...rest } = req.body;
    const g = await prisma.guest.create({ data: { ...rest, orgId: requireOrg(req), dateOfBirth: dateOfBirth ? parseDay(dateOfBirth) : undefined, preferences: JSON.stringify(preferences) } });
    return reply.status(201).send(g);
  });

  app.get('/guests/:id', { schema: { tags: ['guests'], params: idParam, description: 'Guest profile with stay history' } }, async (req) => {
    const g = await prisma.guest.findUnique({ where: { id: req.params.id }, include: { reservations: { include: { property: { select: { name: true, code: true } }, roomType: true }, orderBy: { arrival: 'desc' } }, messages: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!g || g.orgId !== requireOrg(req)) throw notFound('Guest', req.params.id);
    return { ...g, preferences: JSON.parse(g.preferences) };
  });

  app.patch('/guests/:id', { schema: { tags: ['guests'], params: idParam, body: guestBody.partial() } }, async (req) => {
    const g = await prisma.guest.findUnique({ where: { id: req.params.id } });
    if (!g || g.orgId !== requireOrg(req)) throw notFound('Guest', req.params.id);
    const { dateOfBirth, preferences, ...rest } = req.body;
    return prisma.guest.update({ where: { id: g.id }, data: { ...rest, ...(dateOfBirth ? { dateOfBirth: parseDay(dateOfBirth) } : {}), ...(preferences ? { preferences: JSON.stringify(preferences) } : {}) } });
  });
}
