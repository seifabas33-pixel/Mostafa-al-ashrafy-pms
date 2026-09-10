import { z } from 'zod';

export const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .describe('Calendar day, YYYY-MM-DD');

export const idParam = z.object({ id: z.string() });
export const propertyParam = z.object({ propertyId: z.string() });
export const propertyAndId = z.object({ propertyId: z.string(), id: z.string() });

export const dateRangeQuery = z.object({
  from: dayString,
  to: dayString,
});

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const reservationStatus = z.enum(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW']);
export const reservationSource = z.enum(['DIRECT', 'BOOKING_ENGINE', 'OTA', 'WALK_IN', 'GROUP', 'API']);
export const paymentMethod = z.enum(['CASH', 'CARD', 'BNPL', 'TRANSFER', 'OTA_VIRTUAL_CARD', 'CITY_LEDGER']);
export const chargeCategory = z.enum(['ROOM', 'FNB', 'ACTIVITY', 'SPA', 'MISC']);
export const complianceType = z.enum([
  'ETA_EINVOICE',
  'ETA_ERECEIPT',
  'MOI_GUEST_REPORT',
  'ZATCA_INVOICE',
  'ZATCA_CREDIT_NOTE',
  'SHOMOOS_GUEST',
  'NTMP_REPORT',
]);
