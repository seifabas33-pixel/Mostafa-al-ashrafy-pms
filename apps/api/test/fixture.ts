import { prisma } from '../src/db.js';
import { parseDay } from '../src/lib/dates.js';

export const API_KEY = 'test_key_full';
export const READONLY_KEY = 'test_key_readonly';
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
  await prisma.apiKey.create({ data: { orgId: org.id, name: 'full', key: API_KEY, scopes: 'read,write,admin' } });
  await prisma.apiKey.create({ data: { orgId: org.id, name: 'ro', key: READONLY_KEY, scopes: 'read' } });
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
  return { org, property, std, dorm, rooms, dormRoom, bar, promoPlan, warehouse, chicken, outlet, dish, supplier, activity, session, guest };
}

export type Fixture = Awaited<ReturnType<typeof seedFixture>>;
