export interface Property {
  id: string;
  orgId: string;
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  currency: string;
  calendar: string;
  taxRegime: string;
  vatRate: number;
  serviceRate: number;
  businessDate: string;
  checkInTime: string;
  checkOutTime: string;
}

export interface Me {
  organization: { id: string; name: string; slug: string; currency: string };
  apiKey: { name: string; scopes: string[] };
  properties: Property[];
}

export interface RoomType {
  id: string;
  code: string;
  name: string;
  description: string;
  maxAdults: number;
  maxChildren: number;
  sellMode: 'ROOM' | 'BED';
  bedsPerRoom: number;
  baseRate: number;
  sortOrder: number;
  _count?: { rooms: number };
}

export type RoomStatus = 'VACANT' | 'OCCUPIED' | 'OUT_OF_ORDER' | 'OUT_OF_SERVICE';
export type HkStatus = 'CLEAN' | 'DIRTY' | 'INSPECTED' | 'IN_PROGRESS';

export interface Room {
  id: string;
  roomTypeId: string;
  number: string;
  floor: string;
  status: RoomStatus;
  hkStatus: HkStatus;
  connectedRoomId: string | null;
  notes: string;
  roomType?: RoomType;
  currentGuest?: { reservationId: string; name: string; departure: string; vip: boolean } | null;
}

export interface RatePlan {
  id: string;
  code: string;
  name: string;
  currency: string;
  derivedFromId: string | null;
  derivedPct: number;
  derivedAmount: number;
  minLos: number;
  maxLos: number;
  minLeadDays: number;
  maxLeadDays: number;
  mealPlan: string;
  active: boolean;
  bookingEngine: boolean;
  derivedFrom?: { code: string } | null;
}

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  documentType: string | null;
  documentNumber: string | null;
  vip: boolean;
  preferences?: string | Record<string, unknown>;
  notes?: string;
  _count?: { reservations: number };
}

export type ReservationStatus = 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';

export interface ReservationNight {
  id: string;
  date: string;
  rate: number;
  posted: boolean;
}

export interface FolioSummary {
  id: string;
  number: string;
  kind: string;
  status: 'OPEN' | 'CLOSED';
  balance: number;
  reservationId?: string | null;
  guestId?: string | null;
  guest?: Guest;
  reservation?: { confirmationNumber: string; room: { number: string } | null } | null;
  createdAt?: string;
}

export interface Reservation {
  id: string;
  confirmationNumber: string;
  guestId: string;
  roomTypeId: string;
  roomId: string | null;
  ratePlanId: string;
  status: ReservationStatus;
  source: string;
  channel: string | null;
  externalRef: string | null;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  dayUse: boolean;
  bedsRequested: number;
  promoCode: string | null;
  specialRequests: string;
  totalAmount: number;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  guest: Guest;
  roomType: RoomType;
  room: Room | null;
  ratePlan: RatePlan;
  nights?: ReservationNight[];
  folios?: FolioSummary[];
}

export interface FolioLine {
  id: string;
  kind: 'CHARGE' | 'PAYMENT';
  category: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  taxAmount: number;
  serviceAmount: number;
  businessDate: string;
  source: string;
  postedAt: string;
  postedBy: string | null;
  paymentMethod?: string | null;
}

export interface FolioDetail extends FolioSummary {
  totals: { lines: FolioLine[]; net: number; service: number; tax: number; gross: number; paid: number; balance: number };
}

export interface Dashboard {
  businessDate: { gregorian: string; hijri: string };
  property: { id: string; name: string; currency: string; taxRegime: string };
  rooms: { total: number; sellable: number; occupied: number; outOfOrder: number; vacantClean: number; vacantDirty: number };
  kpis: { occupancyPct: number; adr: number; revpar: number; roomRevenue: number; postedRevenue: number; fnbRevenue: number; inHouseGuests: number };
  arrivals: { id: string; confirmationNumber: string; guest: string; vip: boolean; roomType: string; room: string | null; status: ReservationStatus; adults: number; children: number }[];
  departures: { id: string; confirmationNumber: string; guest: string; roomType: string; room: string | null; status: ReservationStatus; balance: number }[];
  housekeeping: Record<string, number>;
  byRoomType: { roomTypeId: string; code: string; name: string; total: number; occupied: number; ooo: number; dirty: number; occupancyPct: number }[];
  forecast: ForecastDay[];
  attention: Record<string, number>;
}

export interface ForecastDay {
  date: string;
  booked: number;
  available: number;
  occupancyPct: number;
}

export interface Alert {
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  code: string;
  message: string;
  entity?: { type: string; id: string } | null;
}

export interface AvailabilityRow {
  roomTypeId: string;
  code: string;
  name: string;
  sellMode: string;
  physical: number;
  days: { date: string; available: number; booked: number; outOfOrder: number }[];
  minAvailable: number;
}

export interface Quote {
  ratePlanId: string;
  ratePlanCode: string;
  roomTypeId: string;
  nights: { date: string; rate: number }[];
  subtotal: number;
  total: number;
}

export interface HkTask {
  id: string;
  roomId: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  priority: string;
  assignedTo: string | null;
  notes: string;
  dueDate: string | null;
  startedAt: string | null;
  doneAt: string | null;
  room?: Room;
}

export interface HkBoardRoom {
  roomId: string;
  number: string;
  floor: string;
  roomType: string;
  status: RoomStatus;
  hkStatus: HkStatus;
  tasks: { id: string; type: string; status: string; priority: string; assignedTo: string | null }[];
  guest: string | null;
  departsToday: boolean;
  arrivalToday: boolean;
}

export interface NightAuditRun {
  id: string;
  businessDate: string;
  ranAt: string;
  ranBy: string | null;
  roomsAvailable: number;
  roomsOccupied: number;
  roomsOoo: number;
  roomChargesPosted: number;
  roomRevenue: number;
  fnbRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  occupancyPct: number;
  adr: number;
  revpar: number;
  noShows: number;
  arrivals: number;
  departures: number;
  status: string;
  notes: string;
  calendar?: { gregorian: string; hijri: string };
}

export interface Ingredient {
  id: string;
  sku: string;
  name: string;
  unit: string;
  costPerUnit: number;
  parLevel: number;
}

export interface MenuItem {
  id: string;
  outletId: string;
  name: string;
  category: string;
  price: number;
  taxable: boolean;
  active: boolean;
  recipe?: { id: string; ingredientId: string; quantity: number; ingredient: Ingredient }[];
}

export interface Outlet {
  id: string;
  code: string;
  name: string;
  type: string;
  warehouseId: string | null;
  active: boolean;
  warehouse?: { id: string; code: string; name: string } | null;
  menuItems: MenuItem[];
}

export interface PosOrder {
  id: string;
  outletId: string;
  number: string;
  status: 'OPEN' | 'POSTED_TO_ROOM' | 'PAID' | 'VOID' | string;
  roomId: string | null;
  folioId: string | null;
  cashier: string | null;
  covers: number;
  kitchenNotes: string;
  allergyNotes: string;
  subtotal: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
  paymentMethod: string | null;
  closedAt: string | null;
  createdAt: string;
  lines: { id: string; menuItemId: string; quantity: number; unitPrice: number; notes: string; menuItem: MenuItem }[];
  outlet?: Outlet;
  room?: Room | null;
}

export interface CostingRow {
  menuItemId: string;
  name: string;
  price: number;
  cost: number;
  margin: number;
  foodCostPct: number;
}

export interface StockWarehouse {
  warehouseId: string;
  code: string;
  name: string;
  value: number;
  items: { ingredientId: string; sku: string; name: string; unit: string; quantity: number; parLevel: number; value: number; belowPar: boolean }[];
}

export interface StockMovement {
  id: string;
  warehouseId: string;
  ingredientId: string;
  quantity: number;
  reason: string;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  ingredient: Ingredient;
  warehouse: { id: string; code: string; name: string };
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  taxId: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  status: string;
  requestedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  expectedAt: string | null;
  total: number;
  notes: string;
  createdAt: string;
  lines: { id: string; ingredientId: string; quantity: number; unitCost: number; receivedQty: number; ingredient: Ingredient }[];
  supplier: Supplier;
  warehouse: Warehouse;
}

export interface Activity {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  location: string;
  price: number;
  durationMin: number;
  capacity: number;
  team: string;
  minAge: number;
  published: boolean;
  active: boolean;
  _count?: { sessions: number };
}

export interface ProgrammeSession {
  sessionId: string;
  activityId: string;
  code: string;
  name: string;
  category: string;
  location: string;
  team: string;
  host: string;
  startsAt: string;
  endsAt: string;
  price: number;
  capacity: number;
  booked: number;
  remaining: number;
  status: string;
}

export interface ProgrammeDay {
  date: string;
  sessions: ProgrammeSession[];
}

export interface Signup {
  id: string;
  sessionId: string;
  guestId: string | null;
  reservationId: string | null;
  pax: number;
  status: 'BOOKED' | 'WAITLIST' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED' | string;
  folioLineId: string | null;
  createdAt: string;
  guest?: Guest | null;
  reservation?: { confirmationNumber: string; room: { number: string } | null } | null;
}

export interface ComplianceSubmission {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  status: 'PENDING' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | string;
  payload: unknown;
  response: unknown;
  externalRef: string | null;
  attempts: number;
  lastError: string;
  submittedAt: string | null;
  createdAt: string;
}

export interface ComplianceOverview {
  required: Record<string, string[]>;
  submissions: ComplianceSubmission[];
}

export interface ChannelConnection {
  id: string;
  channel: string;
  externalPropertyId: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string;
  syncLogs: { id: string; direction: string; status: string; summary: string; createdAt: string }[];
}

export interface AriPayload {
  propertyId: string;
  propertyCode: string;
  ratePlan: string;
  generatedAt: string;
  roomTypes: {
    roomTypeId: string;
    code: string;
    name: string;
    days: { date: string; available: number; rate: number; currency: string; stopSell: boolean; closedToArrival: boolean; closedToDeparture: boolean; minLos: number }[];
  }[];
}

export interface GuestMessage {
  id: string;
  guestId: string;
  reservationId: string | null;
  channel: string;
  direction: string;
  template: string | null;
  body: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
  guest?: Guest;
  reservation?: { confirmationNumber: string } | null;
}

export interface Reputation {
  count: number;
  averageRating: number;
  bySource: { source: string; count: number }[];
  topics: { topic: string; count: number; avgSentiment: number }[];
  unanswered: number;
  recent: { id: string; source: string; rating: number; title: string | null; sentiment: number; topics: string[]; createdAt: string }[];
}

export interface PortfolioReport {
  period: { from: { gregorian: string; hijri: string }; to: { gregorian: string; hijri: string } };
  properties: {
    propertyId: string;
    code: string;
    name: string;
    country: string;
    currency: string;
    days: number;
    occupancyPct: number;
    adr: number;
    revpar: number;
    roomRevenue: number;
    fnbRevenue: number;
    totalRevenue: number;
    daily: { gregorian: string; hijri: string; occupancyPct: number; adr: number; revpar: number; totalRevenue: number }[];
  }[];
}

export interface PricingPlan {
  id: string;
  code: string;
  name: string;
  model: string;
  currency: string;
  unitPrice: number;
  minimumMonthly: number;
  setupFee: number;
  includedModules: string[];
  uptimeSla: number;
  cancellationDays: number;
  supportLevel: string;
  sortOrder: number;
}

export interface PricingEstimate {
  input: { roomCount: number; averageOccupancyPct?: number; months: number };
  estimates: {
    planCode: string;
    planName: string;
    model: string;
    currency: string;
    basis: string;
    monthly: number;
    minimumMonthly: number;
    setupFee: number;
    months: number;
    total: number;
    perRoomPerMonth: number;
    uptimeSla: number;
    cancellationDays: number;
    includedModules: string[];
    supportLevel: string;
  }[];
  recommended: string;
  benchmarks: {
    perRoomPerMonthUsd: [number, number];
    setupUsd: [number, number];
    smallHotelAllInUsd: [number, number];
    midSizeAllInUsd: [number, number];
    competitorsStartingUsd: Record<string, number>;
  };
}

export interface BookingEngineInfo {
  id: string;
  name: string;
  city: string;
  country: string;
  currency: string;
  checkInTime: string;
  checkOutTime: string;
  roomTypes: { id: string; code: string; name: string; description: string; maxAdults: number; maxChildren: number; sellMode: string }[];
  ratePlans: { id: string; code: string; name: string; mealPlan: string; minLos: number }[];
}

export interface BookingOffer {
  ratePlanId: string;
  code: string;
  name: string;
  mealPlan: string;
  total: number;
  subtotal: number;
  nights: { date: string; rate: number }[];
}

export interface BookingAvailability {
  arrival: string;
  departure: string;
  currency: string;
  roomTypes: { roomTypeId: string; code: string; name: string; available: number; offers: BookingOffer[] }[];
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  _count?: { deliveries: number };
}

export interface AuditEntry {
  id: string;
  propertyId: string | null;
  actor: string | null;
  action: string;
  entityType: string;
  entityId: string;
  data: unknown;
  createdAt: string;
}
