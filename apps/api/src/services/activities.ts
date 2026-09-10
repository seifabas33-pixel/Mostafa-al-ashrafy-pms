import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays, formatDay } from '../lib/dates.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { postCharge } from './folios.js';
import { emit } from './webhooks.js';

/**
 * Activities & entertainment. The report says no MENA PMS does this well and that it is the
 * natural differentiator for a resort-operations background: a published programme with
 * schedules, capacity, animation-team assignment, guest sign-ups and folio posting.
 */
export async function programme(property: Property, from: Date, days = 7, opts: { publishedOnly?: boolean } = {}) {
  const to = addDays(from, days);
  const sessions = await prisma.activitySession.findMany({
    where: { startsAt: { gte: from, lt: to }, status: { not: 'CANCELLED' }, activity: { propertyId: property.id, active: true, ...(opts.publishedOnly ? { published: true } : {}) } },
    include: { activity: true, signups: { where: { status: { in: ['BOOKED', 'ATTENDED'] } } } },
    orderBy: { startsAt: 'asc' },
  });
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = formatDay(s.startsAt);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  return [...byDay.entries()].map(([date, list]) => ({
    date,
    sessions: list.map((s) => ({
      sessionId: s.id,
      activityId: s.activityId,
      code: s.activity.code,
      name: s.activity.name,
      category: s.activity.category,
      location: s.activity.location,
      team: s.activity.team,
      host: s.host,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      price: s.activity.price,
      capacity: s.capacity,
      booked: s.signups.reduce((n, x) => n + x.pax, 0),
      remaining: Math.max(0, s.capacity - s.signups.reduce((n, x) => n + x.pax, 0)),
      status: s.status,
    })),
  }));
}

export async function generateSessions(property: Property, activityId: string, args: { from: Date; days: number; startTime: string; weekdays?: number[]; host?: string }) {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity || activity.propertyId !== property.id) throw notFound('Activity', activityId);
  const [hh, mm] = args.startTime.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) throw badRequest('startTime must be HH:MM');
  const created = [];
  for (let i = 0; i < args.days; i++) {
    const day = addDays(args.from, i);
    if (args.weekdays && !args.weekdays.includes(day.getUTCDay())) continue;
    const startsAt = new Date(day.getTime() + (hh * 60 + mm) * 60_000);
    const endsAt = new Date(startsAt.getTime() + activity.durationMin * 60_000);
    const exists = await prisma.activitySession.findFirst({ where: { activityId, startsAt } });
    if (exists) continue;
    created.push(await prisma.activitySession.create({ data: { activityId, startsAt, endsAt, capacity: activity.capacity, host: args.host ?? activity.team } }));
  }
  return created;
}

export async function signUp(property: Property, sessionId: string, args: { guestId?: string; reservationId?: string; pax?: number; postToFolio?: boolean }) {
  const session = await prisma.activitySession.findUnique({ where: { id: sessionId }, include: { activity: true, signups: { where: { status: { in: ['BOOKED', 'ATTENDED'] } } } } });
  if (!session || session.activity.propertyId !== property.id) throw notFound('Session', sessionId);
  if (session.status === 'CANCELLED') throw conflict('Session is cancelled');
  const pax = args.pax ?? 1;
  let guestId = args.guestId;
  let reservation = null;
  if (args.reservationId) {
    reservation = await prisma.reservation.findUnique({ where: { id: args.reservationId }, include: { folios: { where: { status: 'OPEN', kind: 'MASTER' } } } });
    if (!reservation || reservation.propertyId !== property.id) throw notFound('Reservation', args.reservationId);
    guestId = guestId ?? reservation.guestId;
  }
  if (!guestId) throw badRequest('guestId or reservationId is required');
  const booked = session.signups.reduce((n, s) => n + s.pax, 0);
  const status = booked + pax > session.capacity ? 'WAITLIST' : 'BOOKED';
  const signup = await prisma.activitySignup.create({ data: { sessionId, guestId, reservationId: args.reservationId, pax, status } });
  if (status === 'BOOKED' && args.postToFolio !== false && session.activity.price > 0 && reservation?.folios[0]) {
    const line = await postCharge(property, reservation.folios[0].id, { category: 'ACTIVITY', description: `${session.activity.name} ${formatDay(session.startsAt)} x${pax}`, unitAmount: session.activity.price, quantity: pax, source: 'ACTIVITY', referenceId: signup.id });
    await prisma.activitySignup.update({ where: { id: signup.id }, data: { folioLineId: line.id } });
  }
  if (status === 'BOOKED' && booked + pax >= session.capacity) await prisma.activitySession.update({ where: { id: sessionId }, data: { status: 'FULL' } });
  void emit(property.orgId, 'activity.signup_created', { signupId: signup.id, sessionId, status, pax });
  return prisma.activitySignup.findUniqueOrThrow({ where: { id: signup.id }, include: { guest: true, session: { include: { activity: true } } } });
}

export async function updateSignupStatus(property: Property, signupId: string, status: string) {
  const s = await prisma.activitySignup.findUnique({ where: { id: signupId }, include: { session: { include: { activity: true } } } });
  if (!s || s.session.activity.propertyId !== property.id) throw notFound('Signup', signupId);
  const updated = await prisma.activitySignup.update({ where: { id: signupId }, data: { status } });
  if (status === 'CANCELLED') {
    // promote first waitlisted
    const next = await prisma.activitySignup.findFirst({ where: { sessionId: s.sessionId, status: 'WAITLIST' }, orderBy: { createdAt: 'asc' } });
    if (next) await prisma.activitySignup.update({ where: { id: next.id }, data: { status: 'BOOKED' } });
    else await prisma.activitySession.updateMany({ where: { id: s.sessionId, status: 'FULL' }, data: { status: 'SCHEDULED' } });
  }
  return updated;
}
