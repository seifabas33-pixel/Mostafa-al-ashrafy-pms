import type { Property } from '@prisma/client';
import { prisma, type Tx } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ownedIngredient, ownedSupplier, ownedWarehouse } from '../lib/ownership.js';
import { round2 } from '../lib/money.js';
import { emit } from './webhooks.js';

export async function stockOverview(property: Property) {
  const warehouses = await prisma.warehouse.findMany({ where: { propertyId: property.id }, include: { stock: { include: { ingredient: true } } } });
  return warehouses.map((w) => ({
    warehouseId: w.id,
    code: w.code,
    name: w.name,
    items: w.stock.map((s) => ({ ingredientId: s.ingredientId, sku: s.ingredient.sku, name: s.ingredient.name, unit: s.ingredient.unit, quantity: s.quantity, parLevel: s.ingredient.parLevel, value: round2(s.quantity * s.ingredient.costPerUnit), belowPar: s.ingredient.parLevel > 0 && s.quantity < s.ingredient.parLevel })),
    value: round2(w.stock.reduce((s, x) => s + x.quantity * x.ingredient.costPerUnit, 0)),
  }));
}

export async function adjustStock(property: Property, args: { warehouseId: string; ingredientId: string; quantity: number; reason: string; note?: string }, tx: Tx | typeof prisma = prisma) {
  const wh = await tx.warehouse.findUnique({ where: { id: args.warehouseId } });
  if (!wh || wh.propertyId !== property.id) throw notFound('Warehouse', args.warehouseId);
  const ing = await tx.ingredient.findUnique({ where: { id: args.ingredientId } });
  if (!ing || ing.propertyId !== property.id) throw notFound('Ingredient', args.ingredientId);
  await tx.stockLevel.upsert({
    where: { warehouseId_ingredientId: { warehouseId: args.warehouseId, ingredientId: args.ingredientId } },
    update: { quantity: { increment: args.quantity } },
    create: { warehouseId: args.warehouseId, ingredientId: args.ingredientId, quantity: args.quantity },
  });
  return tx.stockMovement.create({ data: { warehouseId: args.warehouseId, ingredientId: args.ingredientId, quantity: args.quantity, reason: args.reason, note: args.note ?? '' } });
}

export async function transferStock(property: Property, args: { fromWarehouseId: string; toWarehouseId: string; ingredientId: string; quantity: number }) {
  if (args.quantity <= 0) throw badRequest('Quantity must be positive');
  return prisma.$transaction(async (tx) => {
    const out = await adjustStock(property, { warehouseId: args.fromWarehouseId, ingredientId: args.ingredientId, quantity: -args.quantity, reason: 'TRANSFER_OUT' }, tx);
    const inn = await adjustStock(property, { warehouseId: args.toWarehouseId, ingredientId: args.ingredientId, quantity: args.quantity, reason: 'TRANSFER_IN' }, tx);
    return { out, in: inn };
  });
}

async function nextPoNumber(propertyId: string) {
  const count = await prisma.purchaseOrder.count({ where: { propertyId } });
  return `PO${String(count + 1).padStart(5, '0')}`;
}

export async function createPurchaseOrder(property: Property, args: { supplierId: string; warehouseId: string; requestedBy?: string; expectedAt?: Date; notes?: string; lines: { ingredientId: string; quantity: number; unitCost: number }[] }) {
  if (args.lines.length === 0) throw badRequest('Purchase order needs lines');
  // Every id that crosses into the create must belong to this property, or the PO read-back
  // (which includes supplier, warehouse and ingredient rows) leaks another tenant's data.
  await ownedSupplier(property, args.supplierId);
  await ownedWarehouse(property, args.warehouseId);
  for (const l of args.lines) await ownedIngredient(property, l.ingredientId);
  const total = round2(args.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
  return prisma.purchaseOrder.create({
    data: {
      propertyId: property.id,
      number: await nextPoNumber(property.id),
      supplierId: args.supplierId,
      warehouseId: args.warehouseId,
      requestedBy: args.requestedBy,
      expectedAt: args.expectedAt,
      notes: args.notes ?? '',
      status: 'PENDING_APPROVAL',
      total,
      lines: { create: args.lines },
    },
    include: { lines: { include: { ingredient: true } }, supplier: true, warehouse: true },
  });
}

export async function approvePurchaseOrder(property: Property, id: string, approvedBy: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.propertyId !== property.id) throw notFound('Purchase order', id);
  if (po.status !== 'PENDING_APPROVAL') throw conflict(`Purchase order is ${po.status}`);
  const updated = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'APPROVED', approvedBy, approvedAt: new Date() }, include: { lines: { include: { ingredient: true } }, supplier: true, warehouse: true } });
  void emit(property.orgId, 'purchase_order.approved', { purchaseOrderId: id, number: po.number, total: po.total });
  return updated;
}

/** Warehouse receiving: partial receipts allowed; stock and cost update on each receipt. */
export async function receivePurchaseOrder(property: Property, id: string, receipts: { lineId: string; quantity: number }[]) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!po || po.propertyId !== property.id) throw notFound('Purchase order', id);
  if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) throw conflict(`Purchase order is ${po.status}; approve it first`);
  const updated = await prisma.$transaction(async (tx) => {
    for (const r of receipts) {
      const line = po.lines.find((l) => l.id === r.lineId);
      if (!line) throw notFound('PO line', r.lineId);
      if (r.quantity <= 0) continue;
      // Never receive more than was ordered: an over-receipt silently inflates stock and
      // leaves receivedQty above quantity, which no later correction reconciles.
      const outstanding = round2(line.quantity - line.receivedQty);
      if (r.quantity > outstanding) {
        throw badRequest(`Cannot receive ${r.quantity} of ${line.ingredientId}: only ${outstanding} outstanding on this line`, { lineId: line.id, ordered: line.quantity, alreadyReceived: line.receivedQty, outstanding });
      }
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: { increment: r.quantity } } });
      await adjustStock(property, { warehouseId: po.warehouseId, ingredientId: line.ingredientId, quantity: r.quantity, reason: 'PO_RECEIPT', note: po.number }, tx);
      await tx.ingredient.update({ where: { id: line.ingredientId }, data: { costPerUnit: line.unitCost } });
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { orderId: id } });
    const complete = lines.every((l) => l.receivedQty >= l.quantity);
    return tx.purchaseOrder.update({ where: { id }, data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED' }, include: { lines: { include: { ingredient: true } }, supplier: true, warehouse: true } });
  });
  if (updated.status === 'RECEIVED') void emit(property.orgId, 'purchase_order.received', { purchaseOrderId: id, number: po.number });
  return updated;
}

/** Documented vs actual consumption: recipe-theoretical usage from POS sales vs stock movements. */
export async function consumptionVariance(property: Property, from: Date, to: Date) {
  const movements = await prisma.stockMovement.findMany({ where: { createdAt: { gte: from, lte: to }, warehouse: { propertyId: property.id } }, include: { ingredient: true } });
  const byIng = new Map<string, { name: string; unit: string; theoretical: number; actualOut: number; received: number }>();
  for (const m of movements) {
    const e = byIng.get(m.ingredientId) ?? { name: m.ingredient.name, unit: m.ingredient.unit, theoretical: 0, actualOut: 0, received: 0 };
    if (m.reason === 'POS_SALE') e.theoretical += -m.quantity;
    if (['WASTAGE', 'STOCK_COUNT', 'ADJUSTMENT'].includes(m.reason) && m.quantity < 0) e.actualOut += -m.quantity;
    if (m.reason === 'PO_RECEIPT') e.received += m.quantity;
    byIng.set(m.ingredientId, e);
  }
  return [...byIng.entries()].map(([ingredientId, e]) => ({ ingredientId, ...e, variance: round2(e.actualOut), theoretical: round2(e.theoretical), received: round2(e.received) }));
}
