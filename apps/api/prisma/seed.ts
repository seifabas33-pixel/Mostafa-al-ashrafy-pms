/**
 * Demo data modelled on the report's target market: a Red Sea resort in Hurghada (Egypt,
 * ETA regime) and a pilgrimage hotel in Makkah (Saudi Arabia, ZATCA regime) under one
 * organisation, plus the published pricing plans and a development API key.
 *
 * Run: npm run db:seed -w apps/api
 * Dev API key: pms_dev_key_ashrafy (header x-api-key)
 */
import { PrismaClient } from '@prisma/client';
import { apiKeyPrefix, hashApiKey } from '../src/lib/ids.js';

const prisma = new PrismaClient();
const DAY = 86_400_000;
const day = (offset: number, base = new Date()) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) + offset * DAY);
const at = (d: Date, hh: number, mm = 0) => new Date(d.getTime() + (hh * 60 + mm) * 60_000);

async function reset() {
  const tables = [
    'WebhookDelivery', 'WebhookSubscription', 'AuditLog', 'ComplianceSubmission', 'ChannelSyncLog', 'ChannelConnection', 'Review', 'GuestMessage',
    'ActivitySignup', 'ActivitySession', 'Activity', 'PurchaseOrderLine', 'PurchaseOrder', 'Supplier', 'StockMovement', 'StockLevel', 'PosOrderLine', 'PosOrder',
    'RecipeLine', 'MenuItem', 'Outlet', 'Ingredient', 'Warehouse', 'NightAuditRun', 'HousekeepingTask', 'FolioLine', 'Folio', 'ReservationNight', 'Reservation',
    'GroupBlockLine', 'GroupBlock', 'Guest', 'PromoCode', 'Restriction', 'RateAmount', 'RatePlan', 'MarketSegment', 'Room', 'RoomType', 'PropertySubscription',
    'PricingPlan', 'ApiKey', 'User', 'Property', 'Organization',
  ];
  for (const t of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`);
}

async function main() {
  await reset();
  const today = day(0);

  const org = await prisma.organization.create({ data: { name: 'Ashrafy Hospitality Group', slug: 'ashrafy', currency: 'EGP' } });
  // Keys are stored hashed; these plaintext values are what you send in x-api-key.
  for (const [name, key, scopes] of [
    ['Development key', 'pms_dev_key_ashrafy', 'read,write,admin'],
    ['Read-only integration', 'pms_readonly_key', 'read'],
  ] as const) {
    await prisma.apiKey.create({ data: { orgId: org.id, name, keyHash: hashApiKey(key), keyPrefix: apiKeyPrefix(key), scopes } });
  }
  await prisma.user.createMany({
    data: [
      { orgId: org.id, email: 'owner@ashrafy.example', name: 'Mostafa Al Ashrafy', role: 'OWNER' },
      { orgId: org.id, email: 'gm@ashrafy.example', name: 'Hend Sayed', role: 'GM' },
      { orgId: org.id, email: 'frontdesk@ashrafy.example', name: 'Omar Farouk', role: 'FRONT_DESK' },
      { orgId: org.id, email: 'hk@ashrafy.example', name: 'Mona Adel', role: 'HOUSEKEEPING' },
      { orgId: org.id, email: 'fnb@ashrafy.example', name: 'Karim Nabil', role: 'FNB' },
      { orgId: org.id, email: 'animation@ashrafy.example', name: 'Youssef Tarek', role: 'ANIMATION' },
    ],
  });

  // Published pricing (transparent tiers: the gap the report highlights)
  const plans = await Promise.all([
    prisma.pricingPlan.create({ data: { code: 'ESSENTIAL', name: 'Essential', model: 'PER_ROOM', currency: 'USD', unitPrice: 6, minimumMonthly: 90, setupFee: 500, includedModules: 'front-office,housekeeping,booking-engine,reports,api', uptimeSla: 99.9, cancellationDays: 30, supportLevel: 'STANDARD', sortOrder: 1 } }),
    prisma.pricingPlan.create({ data: { code: 'RESORT', name: 'Resort', model: 'PER_ROOM', currency: 'USD', unitPrice: 10, minimumMonthly: 250, setupFee: 1200, includedModules: 'front-office,housekeeping,booking-engine,reports,api,pos,inventory,activities,channel-manager,compliance', uptimeSla: 99.9, cancellationDays: 30, supportLevel: 'PRIORITY', sortOrder: 2 } }),
    prisma.pricingPlan.create({ data: { code: 'SEASONAL', name: 'Seasonal (pay per occupied room-night)', model: 'OCCUPANCY', currency: 'USD', unitPrice: 0.45, minimumMonthly: 60, setupFee: 800, includedModules: 'front-office,housekeeping,booking-engine,reports,api,pos,inventory,activities,channel-manager,compliance', uptimeSla: 99.9, cancellationDays: 30, supportLevel: 'PRIORITY', sortOrder: 3 } }),
    prisma.pricingPlan.create({ data: { code: 'GROUP', name: 'Multi-property group', model: 'PER_ROOM', currency: 'USD', unitPrice: 8, minimumMonthly: 1500, setupFee: 2000, includedModules: 'everything,multi-property,central-reservations,consolidated-reporting,dedicated-experience-manager', uptimeSla: 99.95, cancellationDays: 30, supportLevel: 'DEDICATED', sortOrder: 4 } }),
  ]);

  // ---------------- Property 1: Red Sea resort, Hurghada ----------------
  const resort = await prisma.property.create({
    data: { orgId: org.id, code: 'HRG', name: 'Ashrafy Beach Resort Hurghada', city: 'Hurghada', country: 'EG', currency: 'EGP', taxRegime: 'EG_ETA', calendar: 'GREGORIAN', vatRate: 14, serviceRate: 12, businessDate: today },
  });
  await prisma.propertySubscription.create({ data: { propertyId: resort.id, pricingPlanId: plans[1].id, roomCount: 60 } });

  const rtStd = await prisma.roomType.create({ data: { propertyId: resort.id, code: 'STD', name: 'Standard Garden View', maxAdults: 2, maxChildren: 1, baseRate: 2400, sortOrder: 1 } });
  const rtSea = await prisma.roomType.create({ data: { propertyId: resort.id, code: 'SEA', name: 'Superior Sea View', maxAdults: 2, maxChildren: 2, baseRate: 3200, sortOrder: 2 } });
  const rtFam = await prisma.roomType.create({ data: { propertyId: resort.id, code: 'FAM', name: 'Family Suite', maxAdults: 3, maxChildren: 2, baseRate: 4800, sortOrder: 3 } });
  const rtDorm = await prisma.roomType.create({ data: { propertyId: resort.id, code: 'DORM', name: 'Dive Lodge Dorm (per bed)', sellMode: 'BED', bedsPerRoom: 6, maxAdults: 1, maxChildren: 0, baseRate: 450, sortOrder: 4 } });

  const rooms: Record<string, string> = {};
  const mkRooms = async (rt: { id: string }, numbers: string[], floor: string) => {
    for (const n of numbers) rooms[n] = (await prisma.room.create({ data: { propertyId: resort.id, roomTypeId: rt.id, number: n, floor } })).id;
  };
  await mkRooms(rtStd, ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112'], '1');
  await mkRooms(rtSea, ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210'], '2');
  await mkRooms(rtFam, ['301', '302', '303', '304'], '3');
  await mkRooms(rtDorm, ['D1', 'D2'], 'G');
  await prisma.room.update({ where: { id: rooms['112'] }, data: { status: 'OUT_OF_ORDER', notes: 'AC compressor replacement' } });
  await prisma.room.update({ where: { id: rooms['210'] }, data: { hkStatus: 'DIRTY' } });

  const bar = await prisma.ratePlan.create({ data: { propertyId: resort.id, code: 'BAR', name: 'Best Available Rate (BB)', currency: 'EGP', mealPlan: 'BB' } });
  const ai = await prisma.ratePlan.create({ data: { propertyId: resort.id, code: 'AI', name: 'All Inclusive', currency: 'EGP', mealPlan: 'AI', derivedFromId: bar.id, derivedPct: 35 } });
  const early = await prisma.ratePlan.create({ data: { propertyId: resort.id, code: 'EARLY', name: 'Early Bird -15%', currency: 'EGP', mealPlan: 'BB', derivedFromId: bar.id, derivedPct: -15, minLeadDays: 21, minLos: 3 } });
  const corp = await prisma.ratePlan.create({ data: { propertyId: resort.id, code: 'CORP', name: 'Corporate / Group', currency: 'EGP', mealPlan: 'BB', derivedFromId: bar.id, derivedPct: -20, bookingEngine: false } });
  void early;
  // weekend uplift on BAR for 60 days
  for (let i = 0; i < 60; i++) {
    const d = day(i);
    const weekend = d.getUTCDay() === 4 || d.getUTCDay() === 5;
    for (const [rt, base] of [[rtStd, 2400], [rtSea, 3200], [rtFam, 4800], [rtDorm, 450]] as const) {
      await prisma.rateAmount.create({ data: { ratePlanId: bar.id, roomTypeId: rt.id, date: d, amount: weekend ? Math.round(base * 1.15) : base } });
    }
  }
  await prisma.promoCode.create({ data: { propertyId: resort.id, code: 'REDSEA10', percentOff: 10 } });
  await prisma.restriction.create({ data: { propertyId: resort.id, date: day(20), stopSell: true, roomTypeId: rtFam.id } });
  for (const code of ['LEISURE', 'CORPORATE', 'GROUP', 'OTA', 'DIVE']) await prisma.marketSegment.create({ data: { propertyId: resort.id, code, name: code[0] + code.slice(1).toLowerCase() } });

  // Guests
  const guestSpecs = [
    ['Ahmed', 'Hassan', 'EG', '+201001234567', true], ['Sara', 'Mahmoud', 'EG', '+201112345678', false], ['Luca', 'Bianchi', 'IT', '+393331234567', false],
    ['Anna', 'Schmidt', 'DE', '+491701234567', false], ['Olga', 'Petrova', 'RU', '+79161234567', false], ['Karim', 'Youssef', 'EG', '+201223456789', false],
    ['Emily', 'Clark', 'GB', '+447700900123', true], ['Mohamed', 'Ali', 'SA', '+966501234567', false], ['Fatma', 'Ibrahim', 'EG', '+201098765432', false],
    ['Tom', 'Novak', 'CZ', '+420601234567', false], ['Nour', 'Salem', 'EG', null, false], ['Jan', 'de Vries', 'NL', '+31612345678', false],
  ] as const;
  const guests = [];
  for (const [firstName, lastName, nationality, phone, vip] of guestSpecs) {
    guests.push(await prisma.guest.create({ data: { orgId: org.id, firstName, lastName, nationality, phone, email: `${firstName}.${lastName}`.toLowerCase().replace(' ', '') + '@example.com', vip, documentType: 'PASSPORT', documentNumber: `P${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`, preferences: JSON.stringify({ floor: 'high', pillow: 'firm' }) } }));
  }

  let folioSeq = 0;
  const nextFolio = () => `F${String(++folioSeq).padStart(6, '0')}`;
  let confSeq = 100;
  async function reservation(args: { guest: { id: string }; rt: { id: string }; plan: { id: string }; arrival: number; nights: number; status: string; room?: string; source?: string; channel?: string; adults?: number; children?: number; rate?: number }) {
    const arrival = day(args.arrival);
    const departure = day(args.arrival + args.nights);
    const baseRate = args.rate ?? (await prisma.roomType.findUniqueOrThrow({ where: { id: args.rt.id } })).baseRate;
    const nights = Array.from({ length: args.nights }, (_, i) => ({ date: day(args.arrival + i), rate: baseRate, posted: args.status === 'CHECKED_IN' && args.arrival + i < 0 }));
    const r = await prisma.reservation.create({
      data: {
        propertyId: resort.id, confirmationNumber: `HRG-${++confSeq}`, guestId: args.guest.id, roomTypeId: args.rt.id, ratePlanId: args.plan.id, roomId: args.room ? rooms[args.room] : undefined,
        status: args.status, source: args.source ?? 'DIRECT', channel: args.channel, arrival, departure, adults: args.adults ?? 2, children: args.children ?? 0,
        totalAmount: baseRate * args.nights, checkedInAt: args.status === 'CHECKED_IN' || args.status === 'CHECKED_OUT' ? at(arrival, 14) : undefined, checkedOutAt: args.status === 'CHECKED_OUT' ? at(departure, 11) : undefined,
        nights: { create: nights },
      },
    });
    const folio = await prisma.folio.create({ data: { propertyId: resort.id, reservationId: r.id, guestId: args.guest.id, number: nextFolio(), status: args.status === 'CHECKED_OUT' ? 'CLOSED' : 'OPEN' } });
    // post past nights for in-house guests
    let balance = 0;
    for (const n of nights.filter((x) => x.posted)) {
      const service = Math.round(n.rate * 0.12 * 100) / 100;
      const tax = Math.round((n.rate + service) * 0.14 * 100) / 100;
      await prisma.folioLine.create({ data: { folioId: folio.id, kind: 'CHARGE', category: 'ROOM', description: `Room ${args.room ?? ''} ${n.date.toISOString().slice(0, 10)}`, unitAmount: n.rate, amount: n.rate, serviceAmount: service, taxAmount: tax, businessDate: n.date, source: 'NIGHT_AUDIT', referenceId: r.id } });
      balance += n.rate + service + tax;
    }
    await prisma.folio.update({ where: { id: folio.id }, data: { balance: Math.round(balance * 100) / 100 } });
    if (args.room && args.status === 'CHECKED_IN') await prisma.room.update({ where: { id: rooms[args.room] }, data: { status: 'OCCUPIED' } });
    return r;
  }

  // In-house
  const inHouse1 = await reservation({ guest: guests[0], rt: rtSea, plan: ai, arrival: -2, nights: 5, status: 'CHECKED_IN', room: '201', rate: 4320 });
  await reservation({ guest: guests[1], rt: rtStd, plan: bar, arrival: -1, nights: 3, status: 'CHECKED_IN', room: '101' });
  await reservation({ guest: guests[2], rt: rtStd, plan: bar, arrival: -3, nights: 7, status: 'CHECKED_IN', room: '102', source: 'OTA', channel: 'BOOKING_COM' });
  await reservation({ guest: guests[3], rt: rtFam, plan: ai, arrival: -1, nights: 4, status: 'CHECKED_IN', room: '301', adults: 2, children: 2, rate: 6480 });
  const departingToday = await reservation({ guest: guests[4], rt: rtSea, plan: bar, arrival: -4, nights: 4, status: 'CHECKED_IN', room: '202', source: 'OTA', channel: 'EXPEDIA' });
  await reservation({ guest: guests[5], rt: rtSea, plan: bar, arrival: -1, nights: 2, status: 'CHECKED_IN', room: '203' });
  // Arrivals today
  const arrivingVip = await reservation({ guest: guests[6], rt: rtFam, plan: ai, arrival: 0, nights: 6, status: 'CONFIRMED', adults: 2, children: 1, rate: 6480 });
  await reservation({ guest: guests[7], rt: rtStd, plan: bar, arrival: 0, nights: 2, status: 'CONFIRMED', source: 'BOOKING_ENGINE' });
  await reservation({ guest: guests[8], rt: rtStd, plan: corp, arrival: 0, nights: 1, status: 'CONFIRMED', rate: 1920 });
  // Future
  await reservation({ guest: guests[9], rt: rtSea, plan: bar, arrival: 2, nights: 5, status: 'CONFIRMED', source: 'OTA', channel: 'BOOKING_COM' });
  await reservation({ guest: guests[10], rt: rtDorm, plan: bar, arrival: 1, nights: 3, status: 'CONFIRMED', adults: 1 });
  await reservation({ guest: guests[11], rt: rtStd, plan: bar, arrival: 5, nights: 4, status: 'CONFIRMED', source: 'BOOKING_ENGINE' });
  // Past / cancelled
  await reservation({ guest: guests[9], rt: rtStd, plan: bar, arrival: -20, nights: 3, status: 'CHECKED_OUT' });
  await reservation({ guest: guests[6], rt: rtSea, plan: bar, arrival: -60, nights: 5, status: 'CHECKED_OUT' });
  await reservation({ guest: guests[3], rt: rtStd, plan: bar, arrival: 8, nights: 2, status: 'CANCELLED' });
  void arrivingVip;

  // Group block: dive club
  await prisma.groupBlock.create({ data: { propertyId: resort.id, name: 'Blue Fin Dive Club', arrival: day(10), departure: day(15), releaseDate: day(3), status: 'DEFINITE', contact: 'ops@bluefin.example', lines: { create: [{ roomTypeId: rtStd.id, quantity: 4, rate: 2000 }, { roomTypeId: rtDorm.id, quantity: 6, rate: 400 }] } } });

  // Housekeeping tasks today
  for (const n of ['201', '101', '102', '301', '203']) await prisma.housekeepingTask.create({ data: { propertyId: resort.id, roomId: rooms[n], type: 'CLEAN', dueDate: today, assignedTo: 'Mona Adel', notes: 'Stay-over clean' } });
  await prisma.housekeepingTask.create({ data: { propertyId: resort.id, roomId: rooms['202'], type: 'INSPECT', priority: 'HIGH', dueDate: today, notes: 'Departure today' } });
  await prisma.housekeepingTask.create({ data: { propertyId: resort.id, roomId: rooms['210'], type: 'CLEAN', priority: 'RUSH', dueDate: today, notes: 'Arrival expected' } });
  await prisma.housekeepingTask.create({ data: { propertyId: resort.id, roomId: rooms['112'], type: 'MAINTENANCE', priority: 'HIGH', dueDate: day(1), notes: 'AC compressor' } });

  // Night audit history (last 14 days) for reports
  for (let i = 14; i >= 1; i--) {
    const occ = 14 + Math.round(6 * Math.sin(i / 2)) + (i % 7 === 0 ? 3 : 0);
    const roomRevenue = occ * 2900;
    await prisma.nightAuditRun.create({ data: { propertyId: resort.id, businessDate: day(-i), roomsAvailable: 27, roomsOccupied: occ, roomsOoo: 1, roomChargesPosted: occ, roomRevenue, fnbRevenue: occ * 620, otherRevenue: occ * 140, totalRevenue: roomRevenue + occ * 760, occupancyPct: Math.round((occ / 27) * 1000) / 10, adr: 2900, revpar: Math.round((roomRevenue / 27) * 100) / 100, noShows: i % 5 === 0 ? 1 : 0, arrivals: 4, departures: 3 } });
  }

  // F&B: warehouses, ingredients, outlets, menu with recipes
  const whMain = await prisma.warehouse.create({ data: { propertyId: resort.id, code: 'MAIN', name: 'Main Store' } });
  const whKitchen = await prisma.warehouse.create({ data: { propertyId: resort.id, code: 'KIT', name: 'Main Kitchen' } });
  const whBar = await prisma.warehouse.create({ data: { propertyId: resort.id, code: 'BAR', name: 'Pool Bar Store' } });
  const ing = async (sku: string, name: string, unit: string, costPerUnit: number, parLevel: number, stock: [string, number][]) => {
    const i = await prisma.ingredient.create({ data: { propertyId: resort.id, sku, name, unit, costPerUnit, parLevel } });
    for (const [wh, qty] of stock) {
      const whId = { MAIN: whMain.id, KIT: whKitchen.id, BAR: whBar.id }[wh]!;
      await prisma.stockLevel.create({ data: { warehouseId: whId, ingredientId: i.id, quantity: qty } });
      await prisma.stockMovement.create({ data: { warehouseId: whId, ingredientId: i.id, quantity: qty, reason: 'STOCK_COUNT', note: 'Opening stock' } });
    }
    return i;
  };
  const chicken = await ing('ING-001', 'Chicken breast', 'kg', 180, 20, [['MAIN', 40], ['KIT', 12]]);
  const rice = await ing('ING-002', 'Basmati rice', 'kg', 45, 30, [['MAIN', 80], ['KIT', 25]]);
  const tomato = await ing('ING-003', 'Tomatoes', 'kg', 22, 15, [['KIT', 9]]);
  const lemon = await ing('ING-004', 'Lemons', 'kg', 30, 10, [['KIT', 6], ['BAR', 8]]);
  const mint = await ing('ING-005', 'Fresh mint', 'bunch', 8, 20, [['BAR', 14]]);
  const sugar = await ing('ING-006', 'Sugar', 'kg', 25, 20, [['MAIN', 50], ['BAR', 10], ['KIT', 12]]);
  const beefKofta = await ing('ING-007', 'Minced beef', 'kg', 320, 10, [['KIT', 8]]);
  const pita = await ing('ING-008', 'Baladi bread', 'unit', 2.5, 100, [['KIT', 240]]);
  const water = await ing('ING-009', 'Mineral water 600ml', 'unit', 6, 200, [['MAIN', 600], ['BAR', 120]]);
  const cola = await ing('ING-010', 'Cola can', 'unit', 12, 150, [['MAIN', 400], ['BAR', 90]]);

  const restaurant = await prisma.outlet.create({ data: { propertyId: resort.id, code: 'REST', name: 'Al Bahr Restaurant', type: 'RESTAURANT', warehouseId: whKitchen.id } });
  const poolBar = await prisma.outlet.create({ data: { propertyId: resort.id, code: 'POOL', name: 'Pool Bar', type: 'POOL_BAR', warehouseId: whBar.id } });
  const menu = async (outletId: string, name: string, category: string, price: number, recipe: [string, number][]) =>
    prisma.menuItem.create({ data: { outletId, name, category, price, recipe: { create: recipe.map(([ingredientId, quantity]) => ({ ingredientId, quantity })) } } });
  const grilledChicken = await menu(restaurant.id, 'Grilled chicken with rice', 'FOOD', 320, [[chicken.id, 0.25], [rice.id, 0.15], [tomato.id, 0.08], [lemon.id, 0.03]]);
  const kofta = await menu(restaurant.id, 'Kofta platter', 'FOOD', 380, [[beefKofta.id, 0.22], [pita.id, 2], [tomato.id, 0.1]]);
  await menu(restaurant.id, 'Koshari', 'FOOD', 180, [[rice.id, 0.2], [tomato.id, 0.12]]);
  const lemonMint = await menu(poolBar.id, 'Lemon mint', 'BEVERAGE', 95, [[lemon.id, 0.12], [mint.id, 0.5], [sugar.id, 0.03]]);
  await menu(poolBar.id, 'Mineral water', 'BEVERAGE', 35, [[water.id, 1]]);
  const colaItem = await menu(poolBar.id, 'Cola', 'BEVERAGE', 60, [[cola.id, 1]]);
  void grilledChicken; void kofta; void lemonMint; void colaItem;

  // A posted POS order on the in-house guest
  const folio1 = await prisma.folio.findFirstOrThrow({ where: { reservationId: inHouse1.id } });
  const order = await prisma.posOrder.create({ data: { propertyId: resort.id, outletId: poolBar.id, number: 'POS000001', status: 'POSTED_TO_ROOM', roomId: rooms['201'], folioId: folio1.id, cashier: 'Karim Nabil', covers: 2, subtotal: 250, serviceAmount: 30, taxAmount: 39.2, total: 319.2, paymentMethod: 'ROOM_CHARGE', closedAt: at(day(-1), 16), lines: { create: [{ menuItemId: lemonMint.id, quantity: 2, unitPrice: 95 }, { menuItemId: colaItem.id, quantity: 1, unitPrice: 60 }] } } });
  await prisma.folioLine.create({ data: { folioId: folio1.id, kind: 'CHARGE', category: 'FNB', description: 'Pool Bar POS000001: 2x Lemon mint, 1x Cola', unitAmount: 250, amount: 250, serviceAmount: 30, taxAmount: 39.2, businessDate: day(-1), source: 'POS', referenceId: order.id } });
  await prisma.folio.update({ where: { id: folio1.id }, data: { balance: { increment: 319.2 } } });
  // Departing guest has paid a deposit
  const folioDep = await prisma.folio.findFirstOrThrow({ where: { reservationId: departingToday.id } });
  await prisma.folioLine.create({ data: { folioId: folioDep.id, kind: 'PAYMENT', category: 'PAYMENT', description: 'Deposit (card)', unitAmount: -5000, amount: -5000, paymentMethod: 'CARD', businessDate: day(-4) } });
  await prisma.folio.update({ where: { id: folioDep.id }, data: { balance: { decrement: 5000 } } });

  // Suppliers and a PO awaiting approval
  const supplier = await prisma.supplier.create({ data: { propertyId: resort.id, name: 'Red Sea Fresh Produce', contact: 'sales@rsfp.example', taxId: 'EG-100-200-300' } });
  await prisma.supplier.create({ data: { propertyId: resort.id, name: 'Nile Beverages Co', contact: 'orders@nilebev.example' } });
  await prisma.purchaseOrder.create({ data: { propertyId: resort.id, number: 'PO00001', supplierId: supplier.id, warehouseId: whMain.id, status: 'PENDING_APPROVAL', requestedBy: 'Karim Nabil', expectedAt: day(2), total: 22 * 30 + 180 * 20, lines: { create: [{ ingredientId: tomato.id, quantity: 30, unitCost: 22 }, { ingredientId: chicken.id, quantity: 20, unitCost: 180 }] } } });

  // Activities programme
  const acts = await Promise.all([
    prisma.activity.create({ data: { propertyId: resort.id, code: 'AQUA', name: 'Aqua aerobics', category: 'SPORT', location: 'Main pool', durationMin: 45, capacity: 25, team: 'Animation team', description: 'Low-impact water workout with the animation team.' } }),
    prisma.activity.create({ data: { propertyId: resort.id, code: 'KIDS', name: 'Kids club: treasure hunt', category: 'KIDS', location: 'Kids club', durationMin: 90, capacity: 15, team: 'Kids club', minAge: 4 } }),
    prisma.activity.create({ data: { propertyId: resort.id, code: 'SNORK', name: 'Giftun Island snorkelling trip', category: 'EXCURSION', location: 'Marina pier', durationMin: 360, capacity: 20, price: 1500, team: 'Excursions desk', description: 'Full-day boat trip with lunch; equipment included.' } }),
    prisma.activity.create({ data: { propertyId: resort.id, code: 'SHOW', name: 'Evening show: Nubian night', category: 'SHOW', location: 'Amphitheatre', durationMin: 75, capacity: 200, team: 'Animation team' } }),
    prisma.activity.create({ data: { propertyId: resort.id, code: 'YOGA', name: 'Sunrise beach yoga', category: 'WELLNESS', location: 'Beach deck', durationMin: 60, capacity: 20, team: 'Spa', price: 250 } }),
    prisma.activity.create({ data: { propertyId: resort.id, code: 'DARTS', name: 'Darts tournament', category: 'ANIMATION', location: 'Pool bar', durationMin: 60, capacity: 16, team: 'Animation team' } }),
  ]);
  const times: Record<string, [number, number]> = { AQUA: [11, 0], KIDS: [10, 30], SNORK: [8, 30], SHOW: [21, 0], YOGA: [7, 0], DARTS: [16, 0] };
  const sessions: Record<string, string[]> = {};
  for (const a of acts) {
    sessions[a.code] = [];
    for (let i = 0; i < 7; i++) {
      if (a.code === 'SNORK' && i % 2 === 1) continue;
      const [h, m] = times[a.code];
      const startsAt = at(day(i), h, m);
      const s = await prisma.activitySession.create({ data: { activityId: a.id, startsAt, endsAt: new Date(startsAt.getTime() + a.durationMin * 60_000), capacity: a.capacity, host: a.team } });
      sessions[a.code].push(s.id);
    }
  }
  await prisma.activitySignup.create({ data: { sessionId: sessions['SNORK'][0], guestId: guests[0].id, reservationId: inHouse1.id, pax: 2, status: 'BOOKED' } });
  await prisma.activitySignup.create({ data: { sessionId: sessions['KIDS'][0], guestId: guests[3].id, pax: 2, status: 'BOOKED' } });
  await prisma.activitySignup.create({ data: { sessionId: sessions['AQUA'][0], guestId: guests[1].id, pax: 1, status: 'BOOKED' } });

  // Channels, compliance, messages, reviews, webhooks
  const cm = await prisma.channelConnection.create({ data: { propertyId: resort.id, channel: 'SITEMINDER', externalPropertyId: 'SM-48213', status: 'ACTIVE', lastSyncAt: at(day(0), 6) } });
  await prisma.channelSyncLog.create({ data: { connectionId: cm.id, direction: 'PUSH_ARI', status: 'OK', summary: '4 room types x 90 days' } });
  await prisma.channelConnection.create({ data: { propertyId: resort.id, channel: 'BOOKING_COM', externalPropertyId: '1234567', status: 'ACTIVE', lastSyncAt: at(day(0), 6) } });
  await prisma.complianceSubmission.create({ data: { propertyId: resort.id, type: 'MOI_GUEST_REPORT', entityType: 'RESERVATION', entityId: inHouse1.id, status: 'ACCEPTED', externalRef: 'MOI-7F3A2B', submittedAt: at(day(-2), 15), attempts: 1, payload: '{}', response: '{"mode":"SANDBOX"}' } });
  await prisma.complianceSubmission.create({ data: { propertyId: resort.id, type: 'MOI_GUEST_REPORT', entityType: 'RESERVATION', entityId: departingToday.id, status: 'PENDING' } });
  await prisma.guestMessage.create({ data: { propertyId: resort.id, guestId: guests[6].id, reservationId: arrivingVip.id, channel: 'WHATSAPP', template: 'PRE_ARRIVAL', body: 'Hi Emily, we look forward to welcoming you today. Your family suite will be ready from 14:00.', status: 'SENT', scheduledFor: at(day(-3), 10), sentAt: at(day(-3), 10) } });
  await prisma.guestMessage.create({ data: { propertyId: resort.id, guestId: guests[9].id, channel: 'WHATSAPP', template: 'DIGITAL_CHECKIN', body: 'Hi Tom, skip the queue: complete your registration here.', status: 'QUEUED', scheduledFor: at(day(1), 9) } });
  for (const [rating, title, body, source] of [
    [5, 'Perfect beach week', 'Staff were friendly and helpful, the room was clean and the animation team was amazing with the kids.', 'GOOGLE'],
    [4, 'Great food', 'Delicious breakfast buffet, beautiful view. Check-in wait was a bit slow.', 'BOOKING_COM'],
    [2, 'Noisy room', 'Room was noisy at night and the AC was broken for a day. Reception helpful in the end.', 'TRIPADVISOR'],
    [5, 'Snorkelling trip', 'The Giftun snorkel excursion was excellent, highly recommend.', 'DIRECT'],
  ] as const) {
    const words = body.toLowerCase();
    const pos = ['friendly', 'helpful', 'clean', 'amazing', 'delicious', 'beautiful', 'excellent', 'recommend', 'perfect'].filter((w) => words.includes(w)).length;
    const neg = ['noisy', 'broken', 'slow', 'wait'].filter((w) => words.includes(w)).length;
    await prisma.review.create({ data: { propertyId: resort.id, source, rating, title, body, sentiment: pos + neg ? Math.round(((pos - neg) / (pos + neg)) * 100) / 100 : 0, topics: JSON.stringify(['staff', 'room', 'food', 'activities'].filter((t) => ({ staff: ['staff', 'reception', 'friendly'], room: ['room', 'ac', 'noisy'], food: ['breakfast', 'food'], activities: ['animation', 'snorkel'] })[t]!.some((k) => words.includes(k)))) } });
  }
  await prisma.webhookSubscription.create({ data: { orgId: org.id, url: 'https://hooks.example.com/pms', events: 'reservation.created,reservation.checked_in,folio.closed,night_audit.completed', secret: 'whsec_demo' } });

  // ---------------- Property 2: Makkah pilgrimage hotel (Saudi regime) ----------------
  const makkah = await prisma.property.create({ data: { orgId: org.id, code: 'MKH', name: 'Ashrafy Al Haram Hotel', city: 'Makkah', country: 'SA', currency: 'SAR', taxRegime: 'SA_ZATCA', calendar: 'BOTH', vatRate: 15, serviceRate: 0, timezone: 'Asia/Riyadh', businessDate: today } });
  await prisma.propertySubscription.create({ data: { propertyId: makkah.id, pricingPlanId: plans[3].id, roomCount: 40 } });
  const mkStd = await prisma.roomType.create({ data: { propertyId: makkah.id, code: 'DBL', name: 'Double Room', maxAdults: 2, baseRate: 450, sortOrder: 1 } });
  const mkQuad = await prisma.roomType.create({ data: { propertyId: makkah.id, code: 'QUAD', name: 'Quad Room', maxAdults: 4, baseRate: 750, sortOrder: 2 } });
  const makkahRooms: string[] = [];
  for (let f = 1; f <= 2; f++) for (let n = 1; n <= 8; n++) makkahRooms.push((await prisma.room.create({ data: { propertyId: makkah.id, roomTypeId: n <= 4 ? mkStd.id : mkQuad.id, number: `${f}0${n}`, floor: String(f) } })).id);
  const mkBar = await prisma.ratePlan.create({ data: { propertyId: makkah.id, code: 'BAR', name: 'Best Available Rate', currency: 'SAR', mealPlan: 'RO' } });
  await prisma.ratePlan.create({ data: { propertyId: makkah.id, code: 'UMRAH', name: 'Umrah group rate', currency: 'SAR', mealPlan: 'BB', derivedFromId: mkBar.id, derivedPct: -12, minLos: 4, bookingEngine: false } });
  const pilgrims = [['Abdullah', 'Al Zahrani', 'SA'], ['Yusuf', 'Rahman', 'PK'], ['Aisha', 'Bello', 'NG'], ['Ibrahim', 'Demir', 'TR'], ['Hasan', 'Karimov', 'UZ']] as const;
  for (const [i, [firstName, lastName, nationality]] of pilgrims.entries()) {
    const g = await prisma.guest.create({ data: { orgId: org.id, firstName, lastName, nationality, documentType: 'PASSPORT', documentNumber: `Q${1000000 + i * 7919}`, phone: `+9665${String(10000000 + i * 12345).slice(0, 8)}` } });
    const rt = i % 2 ? mkQuad : mkStd;
    const status = i < 3 ? 'CHECKED_IN' : 'CONFIRMED';
    const arrival = day(i < 3 ? -1 - i : i - 2);
    const r = await prisma.reservation.create({ data: { propertyId: makkah.id, confirmationNumber: `MKH-${200 + i}`, guestId: g.id, roomTypeId: rt.id, ratePlanId: mkBar.id, roomId: status === 'CHECKED_IN' ? makkahRooms[i % 2 ? 4 + i : i] : undefined, status, source: i % 2 ? 'GROUP' : 'DIRECT', arrival, departure: day((i < 3 ? -1 - i : i - 2) + 5), adults: i % 2 ? 4 : 2, totalAmount: rt.baseRate * 5, checkedInAt: status === 'CHECKED_IN' ? at(arrival, 15) : undefined, nights: { create: Array.from({ length: 5 }, (_, k) => ({ date: new Date(arrival.getTime() + k * DAY), rate: rt.baseRate, posted: status === 'CHECKED_IN' && k < 1 + i })) } } });
    await prisma.folio.create({ data: { propertyId: makkah.id, reservationId: r.id, guestId: g.id, number: `F${String(i + 1).padStart(6, '0')}` } });
    if (status === 'CHECKED_IN') {
      await prisma.room.update({ where: { id: r.roomId! }, data: { status: 'OCCUPIED' } });
      await prisma.complianceSubmission.create({ data: { propertyId: makkah.id, type: 'SHOMOOS_GUEST', entityType: 'RESERVATION', entityId: r.id, status: 'ACCEPTED', externalRef: `SHOMOOS-${i}A1`, attempts: 1, submittedAt: at(arrival, 15), payload: '{}', response: '{"mode":"SANDBOX"}' } });
      await prisma.complianceSubmission.create({ data: { propertyId: makkah.id, type: 'NTMP_REPORT', entityType: 'RESERVATION', entityId: r.id, status: i === 2 ? 'REJECTED' : 'ACCEPTED', lastError: i === 2 ? 'Passport number format invalid' : '', attempts: 1, submittedAt: at(arrival, 15), payload: '{}', response: '{"mode":"SANDBOX"}' } });
    }
  }
  for (let i = 14; i >= 1; i--) {
    const occ = 9 + (i % 4);
    await prisma.nightAuditRun.create({ data: { propertyId: makkah.id, businessDate: day(-i), roomsAvailable: 16, roomsOccupied: occ, roomsOoo: 0, roomChargesPosted: occ, roomRevenue: occ * 600, fnbRevenue: occ * 90, otherRevenue: 0, totalRevenue: occ * 690, occupancyPct: Math.round((occ / 16) * 1000) / 10, adr: 600, revpar: Math.round((occ * 600) / 16), noShows: 0, arrivals: 3, departures: 3 } });
  }

  console.log('Seeded organisation', org.slug, 'with properties', resort.code, makkah.code);
  console.log('Resort property id:', resort.id);
  console.log('Makkah property id:', makkah.id);
  console.log('Dev API key: pms_dev_key_ashrafy');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
