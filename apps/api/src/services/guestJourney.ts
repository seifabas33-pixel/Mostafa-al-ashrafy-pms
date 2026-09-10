import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { addDays, formatDay } from '../lib/dates.js';
import { emit } from './webhooks.js';

/**
 * Native guest messaging (gap called out in the report: Kwentra's guest layer was
 * partner-supplied). Messages are queued with a schedule; a delivery worker or a
 * WhatsApp Business / email provider integration picks them up via /api/.../messages/due.
 */
export async function scheduleJourney(property: Property, reservationId: string) {
  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { guest: true } });
  if (!r) return [];
  const name = r.guest.firstName;
  const link = `https://checkin.example.com/${r.confirmationNumber}`;
  const templates = [
    {
      template: 'PRE_ARRIVAL',
      scheduledFor: addDays(r.arrival, -3),
      body: `Hi ${name}, ${property.name} is looking forward to welcoming you on ${formatDay(r.arrival)}. Reply with your arrival time and we will have your room ready.`,
    },
    {
      template: 'DIGITAL_CHECKIN',
      scheduledFor: addDays(r.arrival, -1),
      body: `Hi ${name}, skip the queue: complete your registration card and upload your ID here: ${link}`,
    },
    {
      template: 'UPSELL',
      scheduledFor: addDays(r.arrival, -1),
      body: `Hi ${name}, upgrade to a sea-view room or pre-book a snorkelling trip before you arrive: ${link}#offers`,
    },
    {
      template: 'POST_STAY_REVIEW',
      scheduledFor: addDays(r.departure, 1),
      body: `Thank you for staying with ${property.name}, ${name}. Two minutes to tell us how it went? ${link}#review`,
    },
  ];
  const channel = r.guest.phone ? 'WHATSAPP' : 'EMAIL';
  return prisma.$transaction(
    templates.map((t) =>
      prisma.guestMessage.create({
        data: { propertyId: property.id, guestId: r.guestId, reservationId: r.id, channel, template: t.template, body: t.body, scheduledFor: t.scheduledFor },
      }),
    ),
  );
}

/** Mark queued messages whose schedule has passed as sent. A real provider adapter plugs in here. */
export async function dispatchDue(property: Property, now = new Date()) {
  const due = await prisma.guestMessage.findMany({ where: { propertyId: property.id, status: 'QUEUED', scheduledFor: { lte: now } } });
  const sent = [];
  for (const m of due) {
    const s = await prisma.guestMessage.update({ where: { id: m.id }, data: { status: 'SENT', sentAt: now } });
    void emit(property.orgId, 'guest_message.sent', { messageId: s.id, channel: s.channel, template: s.template });
    sent.push(s);
  }
  return sent;
}
