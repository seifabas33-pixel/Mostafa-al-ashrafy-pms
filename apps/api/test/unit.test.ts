import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, eachNight, formatDay, parseDay, toHijri } from '../src/lib/dates.js';
import { computeTax, round2 } from '../src/lib/money.js';
import { applyPromo, checkRestrictions } from '../src/services/rates.js';
import { estimatePlan } from '../src/services/pricing.js';
import { scoreText } from '../src/services/reviews.js';
import { sign } from '../src/services/webhooks.js';

describe('dates', () => {
  it('parses and formats calendar days as UTC midnight', () => {
    const d = parseDay('2026-09-10');
    expect(d.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(formatDay(d)).toBe('2026-09-10');
  });
  it('enumerates stay nights excluding the departure day', () => {
    const nights = eachNight(parseDay('2026-09-10'), parseDay('2026-09-13'));
    expect(nights.map(formatDay)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
    expect(daysBetween(parseDay('2026-09-10'), parseDay('2026-09-13'))).toBe(3);
    expect(formatDay(addDays(parseDay('2026-12-31'), 1))).toBe('2027-01-01');
  });
  it('converts to the Umm al-Qura Hijri calendar', () => {
    const h = toHijri(parseDay('2026-09-10'));
    expect(h.year).toBe(1448);
    expect(h.month).toBe(3);
    expect(h.day).toBe(28);
    expect(h.formatted).toBe('1448-03-28');
  });
});

describe('money', () => {
  it('applies service charge then VAT on net plus service (Egyptian practice)', () => {
    const t = computeTax(1000, 14, 12);
    expect(t.service).toBe(120);
    expect(t.tax).toBe(156.8);
    expect(t.gross).toBe(1276.8);
  });
  it('supports Saudi regime with VAT only', () => {
    const t = computeTax(450, 15, 0);
    expect(t).toEqual({ net: 450, service: 0, tax: 67.5, gross: 517.5 });
  });
  it('rounds to cents', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});

describe('rate restrictions', () => {
  const plan = { id: 'p', minLos: 2, maxLos: 0, minLeadDays: 7, maxLeadDays: 0 } as never;
  const today = parseDay('2026-09-01');
  it('rejects stays shorter than the plan minimum and inside lead time', () => {
    const problems = checkRestrictions([], plan, parseDay('2026-09-03'), parseDay('2026-09-04'), today);
    expect(problems).toContain('Minimum stay 2 nights');
    expect(problems).toContain('Book at least 7 days ahead');
  });
  it('honours stop-sell and closed-to-arrival on specific dates', () => {
    const rs = [
      { date: parseDay('2026-09-20'), stopSell: true, cta: false, ctd: false, minLos: 0, maxLos: 0 },
      { date: parseDay('2026-09-21'), stopSell: false, cta: true, ctd: false, minLos: 0, maxLos: 0 },
    ] as never[];
    expect(checkRestrictions(rs, plan, parseDay('2026-09-20'), parseDay('2026-09-23'), today)).toContain('Stop-sell on 2026-09-20');
    expect(checkRestrictions(rs, plan, parseDay('2026-09-21'), parseDay('2026-09-23'), today)).toContain('Closed to arrival on 2026-09-21');
    expect(checkRestrictions(rs.slice(1), plan, parseDay('2026-09-22'), parseDay('2026-09-25'), today)).toEqual([]);
  });
  it('applies percentage and fixed promo discounts, capped at the subtotal', () => {
    const promo = { active: true, percentOff: 10, amountOff: 50, validFrom: null, validTo: null } as never;
    expect(applyPromo(promo, 1000, parseDay('2026-09-10')).discount).toBe(150);
    expect(applyPromo(promo, 20, parseDay('2026-09-10')).discount).toBe(20);
    const expired = { ...(promo as object), validTo: parseDay('2026-01-01') } as never;
    expect(applyPromo(expired, 1000, parseDay('2026-09-10')).discount).toBe(0);
  });
});

describe('pricing calculator', () => {
  const base = { id: 'x', code: 'P', name: 'Plan', currency: 'USD', minimumMonthly: 0, setupFee: 500, includedModules: 'a,b', uptimeSla: 99.9, cancellationDays: 30, supportLevel: 'STANDARD', published: true, sortOrder: 1 };
  it('prices per-room plans by room count and applies the minimum', () => {
    const e = estimatePlan({ ...base, model: 'PER_ROOM', unitPrice: 6, minimumMonthly: 90 } as never, { roomCount: 10, months: 12 });
    expect(e.monthly).toBe(90);
    expect(e.total).toBe(90 * 12 + 500);
    const big = estimatePlan({ ...base, model: 'PER_ROOM', unitPrice: 6 } as never, { roomCount: 60, months: 1 });
    expect(big.monthly).toBe(360);
    expect(big.perRoomPerMonth).toBe(6);
  });
  it('prices occupancy plans by occupied room-nights', () => {
    const e = estimatePlan({ ...base, model: 'OCCUPANCY', unitPrice: 0.5 } as never, { roomCount: 100, averageOccupancyPct: 50, months: 1 });
    expect(e.monthly).toBe(round2(100 * 0.5 * 30.4 * 0.5));
    expect(e.basis).toContain('50%');
  });
});

describe('reputation scoring', () => {
  it('scores sentiment and detects topics from a transparent lexicon', () => {
    const r = scoreText('Staff were friendly and the room was clean but breakfast was slow');
    expect(r.sentiment).toBeGreaterThan(0);
    expect(r.topics).toEqual(expect.arrayContaining(['staff', 'cleanliness', 'food', 'room']));
    expect(scoreText('Dirty and noisy, terrible').sentiment).toBe(-1);
  });
});

describe('webhook signing', () => {
  it('produces a stable HMAC-SHA256 hex signature', () => {
    expect(sign('secret', 'body')).toBe(sign('secret', 'body'));
    expect(sign('secret', 'body')).toHaveLength(64);
    expect(sign('other', 'body')).not.toBe(sign('secret', 'body'));
  });
});
