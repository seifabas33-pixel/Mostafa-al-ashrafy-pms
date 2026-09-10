import type { PricingPlan } from '@prisma/client';
import { prisma } from '../db.js';
import { round2 } from '../lib/money.js';

/**
 * Transparent pricing calculator. Kwentra publishes no prices (report section 6); the
 * industry corridor (section 13) is USD 4-15 per room per month, USD 500-2,000 setup.
 * Both Kwentra models are offered so a seasonal Red Sea resort can choose occupancy-based
 * billing, but here they are published, with an SLA and 30-day cancellation.
 */
export interface EstimateInput {
  roomCount: number;
  averageOccupancyPct?: number; // needed for OCCUPANCY plans
  months?: number;
  currency?: string;
}

export const BENCHMARKS = {
  perRoomPerMonthUsd: [4, 15] as [number, number],
  setupUsd: [500, 2000] as [number, number],
  smallHotelAllInUsd: [50, 200] as [number, number],
  midSizeAllInUsd: [200, 800] as [number, number],
  competitorsStartingUsd: { Cloudbeds: 600, Mews: 900, Stayntouch: 800, HOTELTIME: 600, 'Clock PMS+': 600, ThinkReservations: 500, 'Shiji Group': 1200 },
};

export function estimatePlan(plan: PricingPlan, input: EstimateInput) {
  const months = input.months ?? 12;
  const occ = (input.averageOccupancyPct ?? 60) / 100;
  let monthly: number;
  let basis: string;
  switch (plan.model) {
    case 'PER_ROOM':
      monthly = plan.unitPrice * input.roomCount;
      basis = `${input.roomCount} rooms x ${plan.unitPrice} ${plan.currency}/room/month`;
      break;
    case 'OCCUPANCY': {
      const occupiedRoomNights = input.roomCount * occ * 30.4;
      monthly = plan.unitPrice * occupiedRoomNights;
      basis = `${input.roomCount} rooms x ${Math.round(occ * 100)}% x 30.4 nights x ${plan.unitPrice} ${plan.currency}/occupied room-night`;
      break;
    }
    default:
      monthly = plan.unitPrice;
      basis = `flat ${plan.unitPrice} ${plan.currency}/month`;
  }
  monthly = Math.max(monthly, plan.minimumMonthly);
  const total = round2(monthly * months + plan.setupFee);
  return {
    planCode: plan.code,
    planName: plan.name,
    model: plan.model,
    currency: plan.currency,
    basis,
    monthly: round2(monthly),
    minimumMonthly: plan.minimumMonthly,
    setupFee: plan.setupFee,
    months,
    total,
    perRoomPerMonth: input.roomCount ? round2(monthly / input.roomCount) : 0,
    uptimeSla: plan.uptimeSla,
    cancellationDays: plan.cancellationDays,
    includedModules: plan.includedModules.split(','),
    supportLevel: plan.supportLevel,
  };
}

export async function estimateAll(input: EstimateInput) {
  const plans = await prisma.pricingPlan.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } });
  const estimates = plans.map((p) => estimatePlan(p, input));
  const cheapest = estimates.reduce<(typeof estimates)[number] | null>((best, e) => (!best || e.total < best.total ? e : best), null);
  return { input, estimates, recommended: cheapest?.planCode ?? null, benchmarks: BENCHMARKS };
}
