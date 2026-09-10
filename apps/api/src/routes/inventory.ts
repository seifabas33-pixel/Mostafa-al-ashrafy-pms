import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireProperty } from '../plugins/auth.js';
import { dayString, propertyAndId, propertyParam } from '../lib/schemas.js';
import { parseDay } from '../lib/dates.js';
import { adjustStock, approvePurchaseOrder, consumptionVariance, createPurchaseOrder, receivePurchaseOrder, stockOverview, transferStock } from '../services/inventory.js';

export async function inventoryRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/properties/:propertyId/ingredients', { schema: { tags: ['inventory'], params: propertyParam } }, async (req) => prisma.ingredient.findMany({ where: { propertyId: (await requireProperty(req, req.params.propertyId)).id }, orderBy: { name: 'asc' } }));
  app.post('/properties/:propertyId/ingredients', { schema: { tags: ['inventory'], params: propertyParam, body: z.object({ sku: z.string(), name: z.string(), unit: z.string().default('unit'), costPerUnit: z.number().min(0).default(0), parLevel: z.number().min(0).default(0) }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await prisma.ingredient.create({ data: { ...req.body, propertyId: p.id } }));
  });

  app.get('/properties/:propertyId/warehouses', { schema: { tags: ['inventory'], params: propertyParam } }, async (req) => prisma.warehouse.findMany({ where: { propertyId: (await requireProperty(req, req.params.propertyId)).id } }));
  app.post('/properties/:propertyId/warehouses', { schema: { tags: ['inventory'], params: propertyParam, body: z.object({ code: z.string(), name: z.string() }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await prisma.warehouse.create({ data: { ...req.body, propertyId: p.id } }));
  });

  app.get('/properties/:propertyId/stock', { schema: { tags: ['inventory'], params: propertyParam, description: 'Stock on hand per warehouse with par-level flags and value' } }, async (req) => stockOverview(await requireProperty(req, req.params.propertyId)));
  app.post('/properties/:propertyId/stock/adjust', { schema: { tags: ['inventory'], params: propertyParam, body: z.object({ warehouseId: z.string(), ingredientId: z.string(), quantity: z.number(), reason: z.enum(['ADJUSTMENT', 'WASTAGE', 'STOCK_COUNT', 'PO_RECEIPT']).default('ADJUSTMENT'), note: z.string().optional() }) } }, async (req, reply) => reply.status(201).send(await adjustStock(await requireProperty(req, req.params.propertyId), req.body)));
  app.post('/properties/:propertyId/stock/transfer', { schema: { tags: ['inventory'], params: propertyParam, body: z.object({ fromWarehouseId: z.string(), toWarehouseId: z.string(), ingredientId: z.string(), quantity: z.number().positive() }) } }, async (req, reply) => reply.status(201).send(await transferStock(await requireProperty(req, req.params.propertyId), req.body)));
  app.get('/properties/:propertyId/stock/movements', { schema: { tags: ['inventory'], params: propertyParam, querystring: z.object({ take: z.coerce.number().int().max(1000).default(200) }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.stockMovement.findMany({ where: { warehouse: { propertyId: p.id } }, include: { ingredient: true, warehouse: true }, orderBy: { createdAt: 'desc' }, take: req.query.take });
  });
  app.get('/properties/:propertyId/stock/variance', { schema: { tags: ['inventory'], params: propertyParam, querystring: z.object({ from: dayString, to: dayString }), description: 'Documented (recipe-theoretical) vs actual consumption' } }, async (req) => consumptionVariance(await requireProperty(req, req.params.propertyId), parseDay(req.query.from), new Date(parseDay(req.query.to).getTime() + 86_399_999)));

  app.get('/properties/:propertyId/suppliers', { schema: { tags: ['inventory'], params: propertyParam } }, async (req) => prisma.supplier.findMany({ where: { propertyId: (await requireProperty(req, req.params.propertyId)).id } }));
  app.post('/properties/:propertyId/suppliers', { schema: { tags: ['inventory'], params: propertyParam, body: z.object({ name: z.string(), contact: z.string().default(''), taxId: z.string().default('') }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    return reply.status(201).send(await prisma.supplier.create({ data: { ...req.body, propertyId: p.id } }));
  });

  app.get('/properties/:propertyId/purchase-orders', { schema: { tags: ['inventory'], params: propertyParam, querystring: z.object({ status: z.string().optional() }) } }, async (req) => {
    const p = await requireProperty(req, req.params.propertyId);
    return prisma.purchaseOrder.findMany({ where: { propertyId: p.id, ...(req.query.status ? { status: req.query.status } : {}) }, include: { lines: { include: { ingredient: true } }, supplier: true, warehouse: true }, orderBy: { createdAt: 'desc' } });
  });
  app.post('/properties/:propertyId/purchase-orders', { schema: { tags: ['inventory'], params: propertyParam, body: z.object({ supplierId: z.string(), warehouseId: z.string(), expectedAt: dayString.optional(), notes: z.string().optional(), lines: z.array(z.object({ ingredientId: z.string(), quantity: z.number().positive(), unitCost: z.number().min(0) })).min(1) }) } }, async (req, reply) => {
    const p = await requireProperty(req, req.params.propertyId);
    const { expectedAt, ...rest } = req.body;
    return reply.status(201).send(await createPurchaseOrder(p, { ...rest, requestedBy: req.auth?.name, expectedAt: expectedAt ? parseDay(expectedAt) : undefined }));
  });
  app.post('/properties/:propertyId/purchase-orders/:id/approve', { schema: { tags: ['inventory'], params: propertyAndId } }, async (req) => approvePurchaseOrder(await requireProperty(req, req.params.propertyId), req.params.id, req.auth?.name ?? 'api'));
  app.post('/properties/:propertyId/purchase-orders/:id/receive', { schema: { tags: ['inventory'], params: propertyAndId, body: z.object({ receipts: z.array(z.object({ lineId: z.string(), quantity: z.number().min(0) })).min(1) }), description: 'Warehouse receiving; partial receipts allowed' } }, async (req) => receivePurchaseOrder(await requireProperty(req, req.params.propertyId), req.params.id, req.body.receipts));
}
