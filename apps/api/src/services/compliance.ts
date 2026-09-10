import type { ComplianceSubmission, Property } from '@prisma/client';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { formatDay } from '../lib/dates.js';
import { folioTotals } from './folios.js';
import { emit } from './webhooks.js';

/**
 * Compliance ledger and adapters.
 *
 * The report identifies regulatory integrations as Kwentra's true moat and the first thing a
 * new entrant must budget for: Egypt ETA e-invoice/e-receipt and Ministry of Interior guest
 * reporting, then Saudi ZATCA (Fatoora), Shomoos and NTMP. This module records every required
 * submission as a row, builds the authority-specific payload, and hands it to an adapter.
 * Adapters run in SANDBOX mode by default (they generate the payload and mark it ACCEPTED
 * with a synthetic reference) so the workflow is testable before the authority credentials
 * are wired in. Replace `submit` in each adapter with the real HTTP call.
 */

export interface ComplianceAdapter {
  type: string;
  market: string;
  buildPayload(property: Property, entityType: string, entityId: string): Promise<Record<string, unknown>>;
  submit(payload: Record<string, unknown>): Promise<{ ok: boolean; externalRef?: string; response: Record<string, unknown> }>;
}

const sandboxSubmit = (prefix: string) => async (payload: Record<string, unknown>) => ({
  ok: true,
  externalRef: `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
  response: { mode: 'SANDBOX', acceptedAt: new Date().toISOString(), echo: Object.keys(payload) },
});

async function invoicePayload(property: Property, entityType: string, entityId: string) {
  if (entityType !== 'FOLIO') throw new Error('Invoice submissions require a FOLIO');
  const folio = await prisma.folio.findUnique({ where: { id: entityId }, include: { guest: true, reservation: true } });
  if (!folio) throw notFound('Folio', entityId);
  const totals = await folioTotals(folio.id);
  return {
    issuer: { name: property.name, country: property.country, taxRegime: property.taxRegime },
    receiver: folio.guest ? { name: `${folio.guest.firstName} ${folio.guest.lastName}`, nationality: folio.guest.nationality, documentNumber: folio.guest.documentNumber } : null,
    documentNumber: folio.number,
    dateIssued: formatDay(property.businessDate),
    currency: property.currency,
    lines: totals.lines
      .filter((l) => l.kind === 'CHARGE')
      .map((l) => ({ description: l.description, category: l.category, quantity: l.quantity, unitAmount: l.unitAmount, net: l.amount, service: l.serviceAmount, vat: l.taxAmount })),
    totals: { net: totals.net, service: totals.service, vat: totals.tax, gross: totals.gross, paid: totals.paid },
  };
}

async function guestPayload(property: Property, entityType: string, entityId: string) {
  if (entityType !== 'RESERVATION') throw new Error('Guest reporting requires a RESERVATION');
  const r = await prisma.reservation.findUnique({ where: { id: entityId }, include: { guest: true, room: true } });
  if (!r) throw notFound('Reservation', entityId);
  return {
    establishment: { name: property.name, city: property.city, country: property.country },
    guest: {
      firstName: r.guest.firstName,
      lastName: r.guest.lastName,
      nationality: r.guest.nationality,
      documentType: r.guest.documentType,
      documentNumber: r.guest.documentNumber,
      dateOfBirth: r.guest.dateOfBirth ? formatDay(r.guest.dateOfBirth) : null,
    },
    stay: { arrival: formatDay(r.arrival), departure: formatDay(r.departure), room: r.room?.number ?? null, adults: r.adults, children: r.children },
    reportedAt: new Date().toISOString(),
  };
}

export const adapters: Record<string, ComplianceAdapter> = {
  ETA_EINVOICE: { type: 'ETA_EINVOICE', market: 'EG', buildPayload: invoicePayload, submit: sandboxSubmit('ETA') },
  ETA_ERECEIPT: { type: 'ETA_ERECEIPT', market: 'EG', buildPayload: invoicePayload, submit: sandboxSubmit('ETA-R') },
  MOI_GUEST_REPORT: { type: 'MOI_GUEST_REPORT', market: 'EG', buildPayload: guestPayload, submit: sandboxSubmit('MOI') },
  ZATCA_INVOICE: { type: 'ZATCA_INVOICE', market: 'SA', buildPayload: invoicePayload, submit: sandboxSubmit('ZATCA') },
  ZATCA_CREDIT_NOTE: { type: 'ZATCA_CREDIT_NOTE', market: 'SA', buildPayload: invoicePayload, submit: sandboxSubmit('ZATCA-CN') },
  SHOMOOS_GUEST: { type: 'SHOMOOS_GUEST', market: 'SA', buildPayload: guestPayload, submit: sandboxSubmit('SHOMOOS') },
  NTMP_REPORT: { type: 'NTMP_REPORT', market: 'SA', buildPayload: guestPayload, submit: sandboxSubmit('NTMP') },
};

/** Which submissions a property owes for a given event, by tax regime. */
export function requiredTypes(property: Property, event: 'CHECK_IN' | 'FOLIO_CLOSED'): string[] {
  switch (property.taxRegime) {
    case 'EG_ETA':
      return event === 'CHECK_IN' ? ['MOI_GUEST_REPORT'] : ['ETA_EINVOICE'];
    case 'SA_ZATCA':
      return event === 'CHECK_IN' ? ['SHOMOOS_GUEST', 'NTMP_REPORT'] : ['ZATCA_INVOICE'];
    default:
      return [];
  }
}

export async function queue(property: Property, type: string, entityType: string, entityId: string) {
  return prisma.complianceSubmission.create({ data: { propertyId: property.id, type, entityType, entityId } });
}

export async function queueGuestReporting(property: Property, reservationId: string) {
  return Promise.all(requiredTypes(property, 'CHECK_IN').map((t) => queue(property, t, 'RESERVATION', reservationId)));
}

export async function queueInvoice(property: Property, folioId: string) {
  return Promise.all(requiredTypes(property, 'FOLIO_CLOSED').map((t) => queue(property, t, 'FOLIO', folioId)));
}

export async function process(property: Property, submission: ComplianceSubmission) {
  const adapter = adapters[submission.type];
  if (!adapter) throw new Error(`No adapter for ${submission.type}`);
  try {
    const payload = await adapter.buildPayload(property, submission.entityType, submission.entityId);
    const result = await adapter.submit(payload);
    const updated = await prisma.complianceSubmission.update({
      where: { id: submission.id },
      data: {
        payload: JSON.stringify(payload),
        response: JSON.stringify(result.response),
        externalRef: result.externalRef,
        status: result.ok ? 'ACCEPTED' : 'REJECTED',
        attempts: { increment: 1 },
        submittedAt: new Date(),
        lastError: result.ok ? '' : 'Rejected by authority',
      },
    });
    void emit(property.orgId, result.ok ? 'compliance.submitted' : 'compliance.rejected', { submissionId: updated.id, type: updated.type, externalRef: updated.externalRef });
    return updated;
  } catch (err) {
    const updated = await prisma.complianceSubmission.update({
      where: { id: submission.id },
      data: { status: 'REJECTED', attempts: { increment: 1 }, lastError: String((err as Error).message ?? err) },
    });
    void emit(property.orgId, 'compliance.rejected', { submissionId: updated.id, type: updated.type, error: updated.lastError });
    return updated;
  }
}

export async function processPending(property: Property, limit = 50) {
  const pending = await prisma.complianceSubmission.findMany({ where: { propertyId: property.id, status: 'PENDING' }, take: limit, orderBy: { createdAt: 'asc' } });
  const results = [];
  for (const s of pending) results.push(await process(property, s));
  return results;
}
