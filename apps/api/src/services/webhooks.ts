import { createHmac } from 'node:crypto';
import { prisma } from '../db.js';

export type WebhookEvent =
  | 'reservation.created'
  | 'reservation.modified'
  | 'reservation.cancelled'
  | 'reservation.checked_in'
  | 'reservation.checked_out'
  | 'reservation.no_show'
  | 'folio.charge_posted'
  | 'folio.payment_posted'
  | 'folio.closed'
  | 'night_audit.completed'
  | 'room.status_changed'
  | 'housekeeping.task_done'
  | 'pos.order_posted'
  | 'purchase_order.approved'
  | 'purchase_order.received'
  | 'activity.signup_created'
  | 'compliance.submitted'
  | 'compliance.rejected'
  | 'guest_message.sent';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'reservation.created',
  'reservation.modified',
  'reservation.cancelled',
  'reservation.checked_in',
  'reservation.checked_out',
  'reservation.no_show',
  'folio.charge_posted',
  'folio.payment_posted',
  'folio.closed',
  'night_audit.completed',
  'room.status_changed',
  'housekeeping.task_done',
  'pos.order_posted',
  'purchase_order.approved',
  'purchase_order.received',
  'activity.signup_created',
  'compliance.submitted',
  'compliance.rejected',
  'guest_message.sent',
];

export function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Record an event for every active subscription that listens to it, then try delivery
 * once in the background. Failed deliveries stay PENDING/FAILED and can be retried via
 * POST /api/webhooks/deliveries/:id/retry.
 */
export async function emit(orgId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  const subs = await prisma.webhookSubscription.findMany({ where: { orgId, active: true } });
  const matching = subs.filter((s) => s.events.split(',').map((e) => e.trim()).some((e) => e === event || e === '*'));
  if (matching.length === 0) return [];
  const body = JSON.stringify({ event, occurredAt: new Date().toISOString(), data: payload });
  const deliveries = await Promise.all(
    matching.map((s) =>
      prisma.webhookDelivery.create({ data: { subscriptionId: s.id, event, payload: body } }),
    ),
  );
  for (const d of deliveries) void attemptDelivery(d.id);
  return deliveries;
}

export async function attemptDelivery(deliveryId: string) {
  const d = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { subscription: true } });
  if (!d) return null;
  if (process.env.WEBHOOKS_DISABLED === '1') return d;
  const signature = sign(d.subscription.secret, d.payload);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(d.subscription.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pms-signature': signature, 'x-pms-event': d.event },
      body: d.payload,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        attempts: { increment: 1 },
        responseCode: res.status,
        status: res.ok ? 'DELIVERED' : 'FAILED',
        deliveredAt: res.ok ? new Date() : null,
        lastError: res.ok ? '' : `HTTP ${res.status}`,
      },
    });
  } catch (err) {
    return prisma.webhookDelivery.update({
      where: { id: d.id },
      data: { attempts: { increment: 1 }, status: 'FAILED', lastError: String((err as Error).message ?? err) },
    });
  }
}
