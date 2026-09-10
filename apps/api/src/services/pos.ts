import type { Property } from '@prisma/client';
import { prisma, type Tx } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { computeTax, round2 } from '../lib/money.js';
import { postCharge } from './folios.js';
import { emit } from './webhooks.js';

async function nextOrderNumber(propertyId: string, tx: Tx | typeof prisma) {
  const count = await tx.posOrder.count({ where: { propertyId } });
  return `POS${String(count + 1).padStart(6, '0')}`;
}

export async function createOrder(property: Property, args: { outletId: string; roomId?: string; cashier?: string; covers?: number; kitchenNotes?: string; allergyNotes?: string; lines: { menuItemId: string; quantity: number; notes?: string }[] }) {
  const outlet = await prisma.outlet.findUnique({ where: { id: args.outletId } });
  if (!outlet || outlet.propertyId !== property.id) throw notFound('Outlet', args.outletId);
  if (args.roomId) {
    const room = await prisma.room.findUnique({ where: { id: args.roomId } });
    if (!room || room.propertyId !== property.id) throw notFound('Room', args.roomId);
  }
  if (args.lines.length === 0) throw badRequest('Order needs at least one line');
  const items = await prisma.menuItem.findMany({ where: { id: { in: args.lines.map((l) => l.menuItemId) }, outletId: outlet.id } });
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const l of args.lines) if (!byId.has(l.menuItemId)) throw notFound('Menu item', l.menuItemId);
  const subtotal = round2(args.lines.reduce((s, l) => s + byId.get(l.menuItemId)!.price * l.quantity, 0));
  const tax = computeTax(subtotal, property.vatRate, property.serviceRate);
  return prisma.$transaction(async (tx) => {
    const order = await tx.posOrder.create({
      data: {
        propertyId: property.id,
        outletId: outlet.id,
        number: await nextOrderNumber(property.id, tx),
        roomId: args.roomId,
        cashier: args.cashier,
        covers: args.covers ?? 1,
        kitchenNotes: args.kitchenNotes ?? '',
        allergyNotes: args.allergyNotes ?? '',
        subtotal,
        taxAmount: tax.tax,
        serviceAmount: tax.service,
        total: tax.gross,
        lines: { create: args.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, unitPrice: byId.get(l.menuItemId)!.price, notes: l.notes ?? '' })) },
      },
      include: { lines: { include: { menuItem: true } }, outlet: true },
    });
    return order;
  });
}

/** Deduct recipe ingredients from the outlet's warehouse for every line of the order. */
export async function deductStock(orderId: string, tx: Tx | typeof prisma = prisma) {
  const order = await tx.posOrder.findUnique({ where: { id: orderId }, include: { outlet: true, lines: { include: { menuItem: { include: { recipe: true } } } } } });
  if (!order) throw notFound('POS order', orderId);
  const warehouseId = order.outlet.warehouseId;
  if (!warehouseId) return [];
  const movements = [];
  for (const line of order.lines) {
    for (const rl of line.menuItem.recipe) {
      const qty = round2(rl.quantity * line.quantity);
      await tx.stockLevel.upsert({
        where: { warehouseId_ingredientId: { warehouseId, ingredientId: rl.ingredientId } },
        update: { quantity: { decrement: qty } },
        create: { warehouseId, ingredientId: rl.ingredientId, quantity: -qty },
      });
      movements.push(await tx.stockMovement.create({ data: { warehouseId, ingredientId: rl.ingredientId, quantity: -qty, reason: 'POS_SALE', referenceId: order.id, note: `${order.number} ${line.menuItem.name} x${line.quantity}` } }));
    }
  }
  return movements;
}

/** Post the order to the in-house guest's folio (room charge) and deduct stock. */
export async function postToRoom(property: Property, orderId: string, roomId?: string) {
  const order = await prisma.posOrder.findUnique({ where: { id: orderId }, include: { lines: { include: { menuItem: true } }, outlet: true } });
  if (!order || order.propertyId !== property.id) throw notFound('POS order', orderId);
  if (order.status !== 'OPEN') throw conflict(`Order is ${order.status}`);
  const targetRoom = roomId ?? order.roomId;
  if (!targetRoom) throw badRequest('roomId is required to post to room');
  const reservation = await prisma.reservation.findFirst({ where: { propertyId: property.id, roomId: targetRoom, status: 'CHECKED_IN' }, include: { folios: { where: { status: 'OPEN', kind: 'MASTER' } } } });
  if (!reservation || !reservation.folios[0]) throw conflict('No checked-in guest with an open folio in that room');
  const folio = reservation.folios[0];
  const result = await prisma.$transaction(async (tx) => {
    const desc = `${order.outlet.name} ${order.number}: ${order.lines.map((l) => `${l.quantity}x ${l.menuItem.name}`).join(', ')}`;
    const line = await postCharge(property, folio.id, { category: 'FNB', description: desc, unitAmount: order.subtotal, source: 'POS', referenceId: order.id }, tx);
    await deductStock(order.id, tx);
    const updated = await tx.posOrder.update({ where: { id: order.id }, data: { status: 'POSTED_TO_ROOM', roomId: targetRoom, folioId: folio.id, paymentMethod: 'ROOM_CHARGE', closedAt: new Date() }, include: { lines: { include: { menuItem: true } }, outlet: true } });
    return { order: updated, folioLine: line };
  });
  void emit(property.orgId, 'folio.charge_posted', { folioId: folio.id, lineId: result.folioLine.id, amount: order.total, category: 'FNB' });
  void emit(property.orgId, 'pos.order_posted', { orderId: order.id, folioId: folio.id, total: order.total });
  return result;
}

/** Settle directly at the outlet (cash/card/BNPL) and deduct stock. */
export async function payOrder(property: Property, orderId: string, method: string) {
  const order = await prisma.posOrder.findUnique({ where: { id: orderId } });
  if (!order || order.propertyId !== property.id) throw notFound('POS order', orderId);
  if (order.status !== 'OPEN') throw conflict(`Order is ${order.status}`);
  const updated = await prisma.$transaction(async (tx) => {
    await deductStock(order.id, tx);
    return tx.posOrder.update({ where: { id: order.id }, data: { status: 'PAID', paymentMethod: method, closedAt: new Date() }, include: { lines: { include: { menuItem: true } }, outlet: true } });
  });
  void emit(property.orgId, 'pos.order_posted', { orderId: order.id, paymentMethod: method, total: order.total });
  return updated;
}

export async function voidOrder(property: Property, orderId: string) {
  const order = await prisma.posOrder.findUnique({ where: { id: orderId } });
  if (!order || order.propertyId !== property.id) throw notFound('POS order', orderId);
  if (order.status !== 'OPEN') throw conflict('Only open orders can be voided');
  return prisma.posOrder.update({ where: { id: orderId }, data: { status: 'VOID', closedAt: new Date() } });
}

/** Menu-item cost from recipe (food cost %) for the F&B controller. */
export async function menuCosting(property: Property, outletId: string) {
  const items = await prisma.menuItem.findMany({ where: { outletId, outlet: { propertyId: property.id } }, include: { recipe: { include: { ingredient: true } } } });
  return items.map((i) => {
    const cost = round2(i.recipe.reduce((s, r) => s + r.quantity * r.ingredient.costPerUnit, 0));
    return { menuItemId: i.id, name: i.name, price: i.price, cost, margin: round2(i.price - cost), foodCostPct: i.price ? round2((cost / i.price) * 100) : 0 };
  });
}
