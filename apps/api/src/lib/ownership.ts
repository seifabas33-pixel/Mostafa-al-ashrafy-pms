import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { notFound } from './errors.js';

/**
 * Tenancy guards for caller-supplied foreign keys.
 *
 * `requireProperty` only proves the property in the URL belongs to the caller's organisation.
 * Any id that arrives in a request BODY still has to be proved to belong to that same property
 * (or organisation, for org-scoped models) before it is written or dereferenced — otherwise a
 * tenant can attach another tenant's row to their own record and read it back through an
 * `include`. Every helper throws 404 rather than 403 so a probe cannot distinguish
 * "exists elsewhere" from "does not exist".
 */

export async function ownedRoom(property: Property, roomId: string) {
  const row = await prisma.room.findUnique({ where: { id: roomId } });
  if (!row || row.propertyId !== property.id) throw notFound('Room', roomId);
  return row;
}

export async function ownedReservation(property: Property, reservationId: string) {
  const row = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!row || row.propertyId !== property.id) throw notFound('Reservation', reservationId);
  return row;
}

export async function ownedFolio(property: Property, folioId: string) {
  const row = await prisma.folio.findUnique({ where: { id: folioId } });
  if (!row || row.propertyId !== property.id) throw notFound('Folio', folioId);
  return row;
}

/** Guests are organisation-scoped, not property-scoped. */
export async function ownedGuest(property: Property, guestId: string) {
  const row = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!row || row.orgId !== property.orgId) throw notFound('Guest', guestId);
  return row;
}

export async function ownedIngredient(property: Property, ingredientId: string) {
  const row = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  if (!row || row.propertyId !== property.id) throw notFound('Ingredient', ingredientId);
  return row;
}

export async function ownedWarehouse(property: Property, warehouseId: string) {
  const row = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!row || row.propertyId !== property.id) throw notFound('Warehouse', warehouseId);
  return row;
}

export async function ownedSupplier(property: Property, supplierId: string) {
  const row = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!row || row.propertyId !== property.id) throw notFound('Supplier', supplierId);
  return row;
}

export async function ownedChannelConnection(property: Property, connectionId: string) {
  const row = await prisma.channelConnection.findUnique({ where: { id: connectionId } });
  if (!row || row.propertyId !== property.id) throw notFound('Channel connection', connectionId);
  return row;
}

export async function ownedOutlet(property: Property, outletId: string) {
  const row = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!row || row.propertyId !== property.id) throw notFound('Outlet', outletId);
  return row;
}

/** Resolve the entity a compliance submission points at, scoped to the property. */
export async function ownedComplianceEntity(property: Property, entityType: string, entityId: string) {
  if (entityType === 'FOLIO') return ownedFolio(property, entityId);
  if (entityType === 'RESERVATION') return ownedReservation(property, entityId);
  throw notFound('Entity', entityId);
}
