import type { Property } from '@prisma/client';
import { prisma, type Tx } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { computeTax, round2 } from '../lib/money.js';
import { emit } from './webhooks.js';

export async function nextFolioNumber(propertyId: string, tx: Tx | typeof prisma = prisma) {
  const count = await tx.folio.count({ where: { propertyId } });
  return `F${String(count + 1).padStart(6, '0')}`;
}

export async function createFolio(
  property: Property,
  args: { reservationId?: string; guestId?: string; kind?: string },
  tx: Tx | typeof prisma = prisma,
) {
  return tx.folio.create({
    data: {
      propertyId: property.id,
      reservationId: args.reservationId,
      guestId: args.guestId,
      kind: args.kind ?? 'MASTER',
      number: await nextFolioNumber(property.id, tx),
    },
  });
}

export async function recomputeBalance(folioId: string, tx: Tx | typeof prisma = prisma) {
  const lines = await tx.folioLine.findMany({ where: { folioId } });
  const balance = round2(lines.reduce((s, l) => s + l.amount + l.taxAmount + l.serviceAmount, 0));
  return tx.folio.update({ where: { id: folioId }, data: { balance } });
}

export interface PostChargeArgs {
  category: string;
  description: string;
  unitAmount: number;
  quantity?: number;
  taxable?: boolean;
  serviceable?: boolean;
  businessDate?: Date;
  source?: string;
  referenceId?: string;
  postedBy?: string;
}

export async function postCharge(property: Property, folioId: string, args: PostChargeArgs, tx: Tx | typeof prisma = prisma) {
  const folio = await tx.folio.findUnique({ where: { id: folioId } });
  if (!folio || folio.propertyId !== property.id) throw notFound('Folio', folioId);
  if (folio.status !== 'OPEN') throw conflict('Folio is closed');
  const qty = args.quantity ?? 1;
  const net = round2(args.unitAmount * qty);
  const breakdown = computeTax(
    net,
    args.taxable === false ? 0 : property.vatRate,
    args.serviceable === false ? 0 : property.serviceRate,
  );
  const line = await tx.folioLine.create({
    data: {
      folioId,
      kind: 'CHARGE',
      category: args.category,
      description: args.description,
      quantity: qty,
      unitAmount: args.unitAmount,
      amount: breakdown.net,
      taxAmount: breakdown.tax,
      serviceAmount: breakdown.service,
      businessDate: args.businessDate ?? property.businessDate,
      source: args.source ?? 'MANUAL',
      referenceId: args.referenceId,
      postedBy: args.postedBy,
    },
  });
  await recomputeBalance(folioId, tx);
  if (tx === prisma) void emit(property.orgId, 'folio.charge_posted', { folioId, lineId: line.id, amount: breakdown.gross, category: args.category });
  return line;
}

export async function postPayment(
  property: Property,
  folioId: string,
  args: { amount: number; method: string; description?: string; businessDate?: Date; postedBy?: string; referenceId?: string },
  tx: Tx | typeof prisma = prisma,
) {
  if (args.amount <= 0) throw badRequest('Payment amount must be positive');
  const folio = await tx.folio.findUnique({ where: { id: folioId } });
  if (!folio || folio.propertyId !== property.id) throw notFound('Folio', folioId);
  if (folio.status !== 'OPEN') throw conflict('Folio is closed');
  const line = await tx.folioLine.create({
    data: {
      folioId,
      kind: 'PAYMENT',
      category: 'PAYMENT',
      description: args.description ?? `Payment (${args.method})`,
      quantity: 1,
      unitAmount: -args.amount,
      amount: -round2(args.amount),
      paymentMethod: args.method,
      businessDate: args.businessDate ?? property.businessDate,
      source: 'MANUAL',
      postedBy: args.postedBy,
      referenceId: args.referenceId,
    },
  });
  await recomputeBalance(folioId, tx);
  if (tx === prisma) void emit(property.orgId, 'folio.payment_posted', { folioId, lineId: line.id, amount: args.amount, method: args.method });
  return line;
}

/** Split: create a second folio on the same reservation and move selected lines onto it. */
export async function splitFolio(property: Property, folioId: string, lineIds: string[]) {
  const folio = await prisma.folio.findUnique({ where: { id: folioId }, include: { lines: true } });
  if (!folio || folio.propertyId !== property.id) throw notFound('Folio', folioId);
  const moving = folio.lines.filter((l) => lineIds.includes(l.id));
  if (moving.length === 0) throw badRequest('No matching lines to move');
  return prisma.$transaction(async (tx) => {
    const target = await createFolio(property, { reservationId: folio.reservationId ?? undefined, guestId: folio.guestId ?? undefined, kind: 'SPLIT' }, tx);
    await tx.folioLine.updateMany({ where: { id: { in: moving.map((l) => l.id) } }, data: { folioId: target.id } });
    await recomputeBalance(folio.id, tx);
    return recomputeBalance(target.id, tx);
  });
}

export async function closeFolio(property: Property, folioId: string, tx: Tx | typeof prisma = prisma) {
  const folio = await recomputeBalance(folioId, tx);
  if (Math.abs(folio.balance) > 0.005) throw conflict(`Folio balance is ${folio.balance}; settle before closing`);
  const closed = await tx.folio.update({ where: { id: folioId }, data: { status: 'CLOSED', closedAt: new Date() } });
  if (tx === prisma) void emit(property.orgId, 'folio.closed', { folioId });
  return closed;
}

export async function folioTotals(folioId: string) {
  const lines = await prisma.folioLine.findMany({ where: { folioId }, orderBy: { postedAt: 'asc' } });
  const charges = lines.filter((l) => l.kind === 'CHARGE');
  const payments = lines.filter((l) => l.kind === 'PAYMENT');
  const net = round2(charges.reduce((s, l) => s + l.amount, 0));
  const service = round2(charges.reduce((s, l) => s + l.serviceAmount, 0));
  const tax = round2(charges.reduce((s, l) => s + l.taxAmount, 0));
  const paid = round2(-payments.reduce((s, l) => s + l.amount, 0));
  return { lines, net, service, tax, gross: round2(net + service + tax), paid, balance: round2(net + service + tax - paid) };
}
