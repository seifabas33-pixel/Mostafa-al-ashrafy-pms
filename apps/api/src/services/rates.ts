import type { Property, PromoCode, RatePlan, Restriction } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays, daysBetween, eachNight, formatDay } from '../lib/dates.js';
import { round2 } from '../lib/money.js';
import { badRequest, notFound } from '../lib/errors.js';

export interface NightQuote {
  date: string;
  rate: number;
}

export interface Quote {
  ratePlanId: string;
  ratePlanCode: string;
  roomTypeId: string;
  nights: NightQuote[];
  subtotal: number;
  promoApplied?: { code: string; discount: number };
  total: number;
}

/**
 * Resolve the nightly amount for a rate plan. Derived plans inherit the parent amount and
 * apply a percentage then a fixed adjustment (Kwentra feature parity: "derived rates").
 * Falls back to the room type base rate when no explicit amount exists.
 */
export async function resolveNightlyRate(ratePlan: RatePlan, roomTypeId: string, date: Date, depth = 0): Promise<number> {
  if (depth > 5) throw badRequest('Derived rate chain too deep');
  const explicit = await prisma.rateAmount.findUnique({
    where: { ratePlanId_roomTypeId_date: { ratePlanId: ratePlan.id, roomTypeId, date } },
  });
  if (explicit) return explicit.amount;
  if (ratePlan.derivedFromId) {
    const parent = await prisma.ratePlan.findUnique({ where: { id: ratePlan.derivedFromId } });
    if (!parent) throw notFound('Parent rate plan', ratePlan.derivedFromId);
    const base = await resolveNightlyRate(parent, roomTypeId, date, depth + 1);
    return round2(base * (1 + ratePlan.derivedPct / 100) + ratePlan.derivedAmount);
  }
  const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
  return roomType?.baseRate ?? 0;
}

export function checkRestrictions(
  restrictions: Restriction[],
  ratePlan: RatePlan,
  arrival: Date,
  departure: Date,
  today: Date,
): string[] {
  const problems: string[] = [];
  const los = daysBetween(arrival, departure);
  const lead = daysBetween(today, arrival);
  if (ratePlan.minLos > 0 && los < ratePlan.minLos) problems.push(`Minimum stay ${ratePlan.minLos} nights`);
  if (ratePlan.maxLos > 0 && los > ratePlan.maxLos) problems.push(`Maximum stay ${ratePlan.maxLos} nights`);
  if (ratePlan.minLeadDays > 0 && lead < ratePlan.minLeadDays) problems.push(`Book at least ${ratePlan.minLeadDays} days ahead`);
  if (ratePlan.maxLeadDays > 0 && lead > ratePlan.maxLeadDays) problems.push(`Book at most ${ratePlan.maxLeadDays} days ahead`);
  for (const r of restrictions) {
    const day = formatDay(r.date);
    if (r.stopSell) problems.push(`Stop-sell on ${day}`);
    if (r.cta && r.date.getTime() === arrival.getTime()) problems.push(`Closed to arrival on ${day}`);
    if (r.ctd && r.date.getTime() === departure.getTime()) problems.push(`Closed to departure on ${day}`);
    if (r.minLos > 0 && los < r.minLos) problems.push(`Minimum stay ${r.minLos} nights on ${day}`);
    if (r.maxLos > 0 && los > r.maxLos) problems.push(`Maximum stay ${r.maxLos} nights on ${day}`);
  }
  return [...new Set(problems)];
}

export function applyPromo(promo: PromoCode | null, subtotal: number, arrival: Date): { discount: number } {
  if (!promo || !promo.active) return { discount: 0 };
  if (promo.validFrom && arrival < promo.validFrom) return { discount: 0 };
  if (promo.validTo && arrival > promo.validTo) return { discount: 0 };
  let discount = 0;
  if (promo.percentOff > 0) discount += subtotal * (promo.percentOff / 100);
  if (promo.amountOff > 0) discount += promo.amountOff;
  return { discount: round2(Math.min(discount, subtotal)) };
}

export async function quoteStay(
  property: Property,
  args: { roomTypeId: string; ratePlanId: string; arrival: Date; departure: Date; promoCode?: string; dayUse?: boolean },
): Promise<Quote> {
  const ratePlan = await prisma.ratePlan.findUnique({ where: { id: args.ratePlanId } });
  if (!ratePlan || ratePlan.propertyId !== property.id) throw notFound('Rate plan', args.ratePlanId);
  const nightsDates = args.dayUse ? [args.arrival] : eachNight(args.arrival, args.departure);
  if (nightsDates.length === 0) throw badRequest('Departure must be after arrival');
  const nights: NightQuote[] = [];
  for (const d of nightsDates) {
    const rate = await resolveNightlyRate(ratePlan, args.roomTypeId, d);
    nights.push({ date: formatDay(d), rate: args.dayUse ? round2(rate * 0.5) : rate });
  }
  const subtotal = round2(nights.reduce((s, n) => s + n.rate, 0));
  let promoApplied: Quote['promoApplied'];
  if (args.promoCode) {
    const promo = await prisma.promoCode.findUnique({
      where: { propertyId_code: { propertyId: property.id, code: args.promoCode.toUpperCase() } },
    });
    if (promo && (!promo.ratePlanId || promo.ratePlanId === ratePlan.id)) {
      const { discount } = applyPromo(promo, subtotal, args.arrival);
      if (discount > 0) promoApplied = { code: promo.code, discount };
    }
  }
  return {
    ratePlanId: ratePlan.id,
    ratePlanCode: ratePlan.code,
    roomTypeId: args.roomTypeId,
    nights,
    subtotal,
    promoApplied,
    total: round2(subtotal - (promoApplied?.discount ?? 0)),
  };
}

/** Bulk upsert of daily amounts, e.g. from a rate grid or a channel manager push. */
export async function setRateAmounts(
  ratePlanId: string,
  roomTypeId: string,
  from: Date,
  to: Date,
  amount: number,
) {
  const dates = eachNight(from, addDays(to, 1));
  await prisma.$transaction(
    dates.map((date) =>
      prisma.rateAmount.upsert({
        where: { ratePlanId_roomTypeId_date: { ratePlanId, roomTypeId, date } },
        update: { amount },
        create: { ratePlanId, roomTypeId, date, amount },
      }),
    ),
  );
  return dates.length;
}
