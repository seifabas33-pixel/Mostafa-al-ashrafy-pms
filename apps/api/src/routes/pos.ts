import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { propertyAndId, propertyParam } from '../lib/schemas.js';
import { notFound } from '../lib/errors.js';
import { ownedIngredient, ownedWarehouse } from '../lib/ownership.js';
import { createOrder, menuCosting, payOrder, postToRoom, voidOrder } from '../services/pos.js';

export async function posRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/outlets', { schema: { tags: ['pos'], params: propertyParam } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.outlet.findMany({ where: { propertyId: p.id }, include: { warehouse: true, menuItems: { where: { active: true }, include: { recipe: { include: { ingredient: true } } }, orderBy: { name: 'asc' } } } });
  });

  app.post('/properties/:propertyId/outlets', { schema: { tags: ['pos'], params: propertyParam, body: z.object({ code: z.string(), name: z.string(), type: z.enum(['RESTAURANT', 'BAR', 'POOL_BAR', 'ROOM_SERVICE', 'SPA', 'SHOP', 'MINIBAR']).default('RESTAURANT'), warehouseId: z.string().optional() }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    if (req.body.warehouseId) await ownedWarehouse(p, req.body.warehouseId);
    return reply.status(201).send(await prisma.outlet.create({ data: { ...req.body, propertyId: p.id } }));
  });

  app.post('/properties/:propertyId/outlets/:id/menu-items', { schema: { tags: ['pos'], params: propertyAndId, body: z.object({ name: z.string(), category: z.enum(['FOOD', 'BEVERAGE', 'ALCOHOL', 'RETAIL', 'SERVICE']).default('FOOD'), price: z.number().min(0), taxable: z.boolean().default(true), recipe: z.array(z.object({ ingredientId: z.string(), quantity: z.number().positive() })).default([]) }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    const outlet = await prisma.outlet.findUnique({ where: { id: req.params.id } });
    if (!outlet || outlet.propertyId !== p.id) throw notFound('Outlet', req.params.id);
    const { recipe, ...rest } = req.body;
    for (const line of recipe) await ownedIngredient(p, line.ingredientId);
    return reply.status(201).send(await prisma.menuItem.create({ data: { ...rest, outletId: outlet.id, recipe: { create: recipe } }, include: { recipe: true } }));
  });

  app.get('/properties/:propertyId/outlets/:id/costing', { schema: { tags: ['pos'], params: propertyAndId, description: 'Recipe cost, margin and food-cost % per menu item' } }, async (req) => menuCosting(await requireProperty(req, req.params.propertyId), req.params.id));

  app.get('/properties/:propertyId/pos/orders', { schema: { tags: ['pos'], params: propertyParam, querystring: z.object({ status: z.string().optional(), outletId: z.string().optional(), take: z.coerce.number().int().max(500).default(100) }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.posOrder.findMany({ where: { propertyId: p.id, ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.outletId ? { outletId: req.query.outletId } : {}) }, include: { lines: { include: { menuItem: true } }, outlet: true, room: true }, orderBy: { createdAt: 'desc' }, take: req.query.take });
  });

  app.post('/properties/:propertyId/pos/orders', { schema: { tags: ['pos'], params: propertyParam, body: z.object({ outletId: z.string(), roomId: z.string().optional(), cashier: z.string().optional(), covers: z.number().int().min(1).default(1), kitchenNotes: z.string().default(''), allergyNotes: z.string().default(''), lines: z.array(z.object({ menuItemId: z.string(), quantity: z.number().int().min(1), notes: z.string().optional() })).min(1) }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await createOrder(p, { ...req.body, cashier: req.body.cashier ?? req.auth?.name }));
  });

  app.post('/properties/:propertyId/pos/orders/:id/post-to-room', { schema: { tags: ['pos'], params: propertyAndId, body: z.object({ roomId: z.string().optional() }).default({}), description: 'Post the order to the in-house guest folio and deduct recipe ingredients from stock' } }, async (req) => postToRoom(await requireProperty(req, req.params.propertyId), req.params.id, req.body.roomId));
  app.post('/properties/:propertyId/pos/orders/:id/pay', { schema: { tags: ['pos'], params: propertyAndId, body: z.object({ method: z.enum(['CASH', 'CARD', 'BNPL']) }) } }, async (req) => payOrder(await requireProperty(req, req.params.propertyId), req.params.id, req.body.method));
  app.post('/properties/:propertyId/pos/orders/:id/void', { schema: { tags: ['pos'], params: propertyAndId } }, async (req) => voidOrder(await requireProperty(req, req.params.propertyId), req.params.id));
}
