import { prisma } from '../src/db.js';
import { parseDay } from '../src/lib/dates.js';
import { apiKeyPrefix, hashApiKey } from '../src/lib/ids.js';

export const API_KEY = 'test_key_full';
export const READONLY_KEY = 'test_key_readonly';
/** Write scope but no admin: must not be able to mint credentials. */
export const WRITE_KEY = 'test_key_write';
export const BUSINESS_DATE = '2026-10-01';

/** Wipe every table and create one organisation with a small Egyptian property. */
export async function seedFixture() {
  const tables = [
    'WebhookDelivery', 'WebhookSubscription', 'AuditLog', 'ComplianceSubmission', 'ChannelSyncLog', 'ChannelConnection', 'Review', 'GuestMessage',
    'ActivitySignup', 'ActivitySession', 'Activity', 'PurchaseOrderLine', 'PurchaseOrder', 'Supplier', 'StockMovement', 'StockLevel', 'PosOrderLine', 'PosOrder',
    'RecipeLine', 'MenuItem', 'Outlet', 'Ingredient', 'Warehouse', 'NightAuditRun', 'HousekeepingTask', 'FolioLine', 'Folio', 'ReservationNight', 'Reservation',
    'GroupBlockLine', 'GroupBlock', 'Guest', 'PromoCode', 'Restriction', 'RateAmount', 'RatePlan', 'MarketSegment', 'Room', 'RoomType', 'PropertySubscription',
    'PricingPlan', 'ApiKey', 'User', 'Property', 'Organization',
  ];
  for (const t of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`);

  const org = await prisma.organization.create({ data: { name: 'Test Org', slug: 'test' } });
  await prisma.apiKey.create({ data: { orgId: org.id, name: 'full', keyHash: hashApiKey(API_KEY), keyPrefix: apiKeyPrefix(API_KEY), scopes: 'read,write,admin' } });
  await prisma.apiKey.create({ data: { orgId: org.id, name: 'ro', keyHash: hashApiKey(READONLY_KEY), keyPrefix: apiKeyPrefix(READONLY_KEY), scopes: 'read' } });
  await prisma.apiKey.create({ data: { orgId: org.id, name: 'writer', keyHash: hashApiKey(WRITE_KEY), keyPrefix: apiKeyPrefix(WRITE_KEY), scopes: 'read,write' } });
  const property = await prisma.property.create({
    data: { orgId: org.id, code: 'TST', name: 'Test Resort', city: 'Hurghada', country: 'EG', currency: 'EGP', taxRegime: 'EG_ETA', vatRate: 14, serviceRate: 12, businessDate: parseDay(BUSINESS_DATE) },
  });
  const std = await prisma.roomType.create({ data: { propertyId: property.id, code: 'STD', name: 'Standard', baseRate: 1000, sortOrder: 1 } });
  const dorm = await prisma.roomType.create({ data: { propertyId: property.id, code: 'DORM', name: 'Dorm', sellMode: 'BED', bedsPerRoom: 4, baseRate: 100, sortOrder: 2 } });
  const rooms = [];
  for (const n of ['101', '102', '103']) rooms.push(await prisma.room.create({ data: { propertyId: property.id, roomTypeId: std.id, number: n } }));
  const dormRoom = await prisma.room.create({ data: { propertyId: property.id, roomTypeId: dorm.id, number: 'D1' } });
  const bar = await prisma.ratePlan.create({ data: { propertyId: property.id, code: 'BAR', name: 'BAR', mealPlan: 'BB' } });
  const promoPlan = await prisma.ratePlan.create({ data: { propertyId: property.id, code: 'EARLY', name: 'Early', derivedFromId: bar.id, derivedPct: -20, minLeadDays: 21, minLos: 3 } });
  await prisma.promoCode.create({ data: { propertyId: property.id, code: 'TEN', percentOff: 10 } });
  const warehouse = await prisma.warehouse.create({ data: { propertyId: property.id, code: 'KIT', name: 'Kitchen' } });
  const chicken = await prisma.ingredient.create({ data: { propertyId: property.id, sku: 'CHK', name: 'Chicken', unit: 'kg', costPerUnit: 200, parLevel: 5 } });
  await prisma.stockLevel.create({ data: { warehouseId: warehouse.id, ingredientId: chicken.id, quantity: 10 } });
  const outlet = await prisma.outlet.create({ data: { propertyId: property.id, code: 'REST', name: 'Restaurant', warehouseId: warehouse.id } });
  const dish = await prisma.menuItem.create({ data: { outletId: outlet.id, name: 'Chicken', price: 300, recipe: { create: [{ ingredientId: chicken.id, quantity: 0.25 }] } } });
  const supplier = await prisma.supplier.create({ data: { propertyId: property.id, name: 'Supplier' } });
  const activity = await prisma.activity.create({ data: { propertyId: property.id, code: 'YOGA', name: 'Yoga', price: 100, capacity: 2, durationMin: 60 } });
  const session = await prisma.activitySession.create({ data: { activityId: activity.id, startsAt: new Date(`${BUSINESS_DATE}T07:00:00Z`), endsAt: new Date(`${BUSINESS_DATE}T08:00:00Z`), capacity: 2 } });
  await prisma.pricingPlan.create({ data: { code: 'ESSENTIAL', name: 'Essential', model: 'PER_ROOM', unitPrice: 6, minimumMonthly: 90, setupFee: 500, includedModules: 'front-office' } });
  await prisma.pricingPlan.create({ data: { code: 'SEASONAL', name: 'Seasonal', model: 'OCCUPANCY', unitPrice: 0.45, minimumMonthly: 60, setupFee: 800, includedModules: 'front-office,pos' } });
  const guest = await prisma.guest.create({ data: { orgId: org.id, firstName: 'Amira', lastName: 'Fahmy', nationality: 'EG', phone: '+20100', vip: true } });

  // A second, unrelated tenant. Its ids are used to prove that a caller-supplied foreign key
  // belonging to another organisation is rejected rather than silently attached.
  const otherOrg = await prisma.organization.create({ data: { name: 'Rival Group', slug: 'rival' } });
  const otherProperty = await prisma.property.create({
    data: { orgId: otherOrg.id, code: 'RIV', name: 'Rival Hotel', city: 'Sharm', country: 'EG', currency: 'EGP', businessDate: parseDay(BUSINESS_DATE) },
  });
  const otherRoomType = await prisma.roomType.create({ data: { propertyId: otherProperty.id, code: 'STD', name: 'Standard', baseRate: 500 } });
  const otherRoom = await prisma.room.create({ data: { propertyId: otherProperty.id, roomTypeId: otherRoomType.id, number: '901', status: 'OUT_OF_ORDER' } });
  const otherGuest = await prisma.guest.create({ data: { orgId: otherOrg.id, firstName: 'Rival', lastName: 'Guest', documentNumber: 'SECRET-1' } });
  const otherRatePlan = await prisma.ratePlan.create({ data: { propertyId: otherProperty.id, code: 'BAR', name: 'BAR' } });
  const otherReservation = await prisma.reservation.create({
    data: { propertyId: otherProperty.id, confirmationNumber: 'RIV-1', guestId: otherGuest.id, roomTypeId: otherRoomType.id, ratePlanId: otherRatePlan.id, arrival: parseDay(BUSINESS_DATE), departure: parseDay('2026-10-05'), status: 'CONFIRMED' },
  });
  const otherFolio = await prisma.folio.create({ data: { propertyId: otherProperty.id, number: 'F000999', guestId: otherGuest.id } });
  const otherWarehouse = await prisma.warehouse.create({ data: { propertyId: otherProperty.id, code: 'W', name: 'Rival Store' } });
  const otherIngredient = await prisma.ingredient.create({ data: { propertyId: otherProperty.id, sku: 'RIV', name: 'Rival Truffle', unit: 'kg', costPerUnit: 9999 } });
  const otherSupplier = await prisma.supplier.create({ data: { propertyId: otherProperty.id, name: 'Rival Supplier', taxId: 'RIV-TAX' } });
  const otherChannel = await prisma.channelConnection.create({ data: { propertyId: otherProperty.id, channel: 'SITEMINDER' } });

  return {
    org, property, std, dorm, rooms, dormRoom, bar, promoPlan, warehouse, chicken, outlet, dish, supplier, activity, session, guest,
    other: { org: otherOrg, property: otherProperty, room: otherRoom, guest: otherGuest, reservation: otherReservation, folio: otherFolio, warehouse: otherWarehouse, ingredient: otherIngredient, supplier: otherSupplier, channel: otherChannel },
  };
}

export type Fixture = Awaited<ReturnType<typeof seedFixture>>;
