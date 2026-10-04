import { PrismaClient, type Order, type Outlet, type TemperatureRequirement } from '@prisma/client';
import { appendAudit } from '../../domain/audit.js';
import { dateOnly, isoWeek, weekStart } from '../../domain/dates.js';
import { transitionOrder } from '../../domain/lifecycle.js';
import { addBusinessDays } from '../../store/testing/synthetic.js';
import type { GeneratedPlan, PlanningInput, PlanningOrder, PlanningVehicle } from '../model.js';

export const PLANNING_SYNTHETIC_DATE = '2040-03-05';

// Explicit independent values; these fixtures never import the competition's precomputed decisions.
export function planningOrder(overrides: Partial<PlanningOrder> = {}): PlanningOrder {
  return { id: 'synthetic-order-1', orderRef: 'SYN-PLAN-ORDER-1', version: 2, status: 'CONFIRMED',
    requestedDate: PLANNING_SYNTHETIC_DATE, eligibleDate: PLANNING_SYNTHETIC_DATE, createdAt: '2040-03-04T04:00:00.000Z',
    temperature: 'AMBIENT', units: 100, weightKg: '100', volumeM3: '1', deferralCount: 0, nextEligibleDate: null,
    outlet: { id: 'synthetic-outlet-1', outletRef: 'SYN-PLAN-FRESH', depotId: 'synthetic-depot', district: 'SYNTHETIC Alpha',
      brand: 'FRESH', dockType: 'STREET', access: 'NORMAL', windowOpen: 300, windowClose: 480, mallOpen: null, mallClose: null },
    ...overrides };
}

export function planningVehicle(overrides: Partial<PlanningVehicle> = {}): PlanningVehicle {
  return { id: 'synthetic-vehicle-1', vehicleRef: 'SYN-PLAN-AMBIENT', depotId: 'synthetic-depot', active: true,
    type: 'TRUCK', temperature: 'AMBIENT', weightCapacityKg: '1000', volumeCapacityM3: '10', kmPerLitre: '10',
    availability: 'AVAILABLE', availableFromMinute: 300, availableUntilMinute: 1080,
    fuelKnown: true, remainingFuelLitres: '20', ...overrides };
}

export function planningInput(overrides: Partial<PlanningInput> = {}): PlanningInput {
  return { serviceDate: PLANNING_SYNTHETIC_DATE, depotId: 'synthetic-depot', operatingDay: true,
    orders: [planningOrder()], vehicles: [planningVehicle()],
    travel: [{ depotId: 'synthetic-depot', district: 'SYNTHETIC Alpha', depotKm: '20', depotMinutes: '20', interStopKm: '2', interStopMinutes: '5' }],
    allowances: [{ brand: 'FRESH', dockType: 'STREET', minutes: '10' }, { brand: 'STYLE', dockType: 'STREET', minutes: '10' },
      { brand: 'STYLE', dockType: 'MALL_BAY', minutes: '10' }, { brand: 'TECH', dockType: 'STREET', minutes: '10' }],
    existingTrips: [], ...overrides };
}

// This valid plan is calculated by hand: 05:00 depart, 20min outbound, 10min service, 20min return; 40km / 10km/L.
export function handAuthoredPlan(): GeneratedPlan {
  return { strategyVersion: 'deterministic-depot-v1', trips: [{ key: 'synthetic-vehicle-1:1', vehicleId: 'synthetic-vehicle-1', tripNumber: 1,
    departureMinute: 300, returnMinute: 350, distanceKm: '40', fuelLitres: '4', weightKg: '100', volumeM3: '1',
    stops: [{ orderId: 'synthetic-order-1', sequence: 1, arrivalMinute: 320, serviceStartMinute: 320,
      serviceCompleteMinute: 330, waitingMinutes: 0, serviceMinutes: 10 }] }],
    decisions: [{ orderId: 'synthetic-order-1', orderRef: 'SYN-PLAN-ORDER-1', orderVersion: 2, decision: 'ASSIGNED',
      tripKey: 'synthetic-vehicle-1:1', reasonCode: null, reason: 'SYNTHETIC hand-calculated valid assignment.', checks: [], alternatives: [],
      priority: { previousDeferrals: 0, compatibleVehicles: 1, windowMinutes: 180, eligibleDate: PLANNING_SYNTHETIC_DATE,
        createdAt: '2040-03-04T04:00:00.000Z' } }] };
}

type FixtureOptions = { key?: string; serviceDate?: string; assignStore?: boolean };
type OrderSpec = { ref: string; outlet: Outlet; weight: string; volume: string; temperature?: TemperatureRequirement; previousDeferrals?: number };

async function ensureFixtureOrder(db: PrismaClient, dispatcherId: string, serviceDate: string, spec: OrderSpec) {
  const existing = await db.order.findUnique({ where: { orderRef: spec.ref } });
  if (existing) return existing;
  const requested = addBusinessDays(serviceDate, spec.previousDeferrals ? -2 : 0);
  const created = await db.order.create({ data: { orderRef: spec.ref, outletId: spec.outlet.id,
    requestedDeliveryDate: dateOnly(requested), eligibleDeliveryDate: dateOnly(requested), orderedUnits: 25,
    orderedWeightKg: spec.weight, orderedVolumeM3: spec.volume, temperatureRequirement: spec.temperature ?? 'AMBIENT',
    createdByUserId: dispatcherId, createdAt: new Date(`${addBusinessDays(requested, -1)}T04:00:00Z`) } });
  await appendAudit(db, { actor: { id: dispatcherId, role: 'DISPATCHER' }, eventType: 'ORDER_CREATED', entityType: 'ORDER', entityId: created.id,
    metadata: { toStatus: 'DRAFT', version: 1, quantities: { orderedUnits: 25, loadedUnits: null, deliveredUnits: null, receivedUnits: null } } });
  let order = await transitionOrder(db, { actorUserId: dispatcherId, orderId: created.id, expectedVersion: 1, next: 'CONFIRMED' }, { allowSyntheticReferences: true });
  for (let index = 0; index < (spec.previousDeferrals ?? 0); index++) {
    order = await transitionOrder(db, { actorUserId: dispatcherId, orderId: order.id, expectedVersion: order.version, next: 'DEFERRED',
      deferral: { reasonCode: index === 0 ? 'CAPACITY' : 'FUEL_UNKNOWN', reasonDetail: 'SYNTHETIC prior planning decision retained for the allocation priority scenario.',
        nextEligibleDate: index + 1 === spec.previousDeferrals ? serviceDate : addBusinessDays(serviceDate, -1) } }, { allowSyntheticReferences: true });
  }
  return order;
}

// Explicit fixture preparation only. Repetition never resets orders, planning runs, receipts, audits or fuel use created by review.
export async function installPlanningFixture(db: PrismaClient, options: FixtureOptions = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Synthetic allocation fixtures are forbidden in production.');
  const serviceDate = options.serviceDate ?? PLANNING_SYNTHETIC_DATE, key = options.key ?? 'JUDGE';
  if (!/^[A-Z0-9-]{1,24}$/.test(key)) throw new Error('Use a short uppercase synthetic fixture key.');
  const prefix = `SYN-PLAN-${key}`;
  const depot = await db.depot.upsert({ where: { name: `SYNTHETIC Allocation ${key} Depot` }, update: {}, create: { name: `SYNTHETIC Allocation ${key} Depot` } });
  const foreignDepot = await db.depot.upsert({ where: { name: `SYNTHETIC Allocation ${key} Foreign Depot` }, update: {}, create: { name: `SYNTHETIC Allocation ${key} Foreign Depot` } });
  for (let index = -2; index <= 3; index++) {
    const day = addBusinessDays(serviceDate, index), weekday = (dateOnly(day).getUTCDay() + 6) % 7, iso = isoWeek(day);
    await db.calendarDay.upsert({ where: { date: dateOnly(day) }, update: {}, create: { date: dateOnly(day), dayOfWeek: weekday,
      dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday], weekend: weekday === 6, isoYear: iso.year, isoWeek: iso.week,
      operatingDay: index !== 1, payday: false, festivalRamp: 0, holiday: false, monsoon: false, source: 'SYNTHETIC' } });
  }
  const [store, dispatcher, loader, driver] = await Promise.all(['store', 'dispatcher', 'loader', 'driver'].map(name => db.user.findUniqueOrThrow({ where: { email: `${name}@waypoint.local` } })));
  for (const user of [dispatcher, loader]) await db.userDepot.upsert({ where: { userId_depotId: { userId: user.id, depotId: depot.id } }, update: {}, create: { userId: user.id, depotId: depot.id } });
  const outletSpecs = [
    { key: 'FRESH', brand: 'FRESH' as const, district: 'SYNTHETIC Alpha', dockType: 'STREET' as const, accessConstraint: 'NORMAL' as const, deliveryWindowOpen: 300, deliveryWindowClose: 480 },
    { key: 'VAN', brand: 'FRESH' as const, district: 'SYNTHETIC Alpha', dockType: 'STREET' as const, accessConstraint: 'VAN_ONLY' as const, deliveryWindowOpen: 300, deliveryWindowClose: 480 },
    { key: 'TECH', brand: 'TECH' as const, district: 'SYNTHETIC Beta', dockType: 'STREET' as const, accessConstraint: 'NORMAL' as const, deliveryWindowOpen: 540, deliveryWindowClose: 1020 },
    { key: 'MALL', brand: 'STYLE' as const, district: 'SYNTHETIC Beta', dockType: 'MALL_BAY' as const, accessConstraint: 'MALL_DOCK' as const, deliveryWindowOpen: 540, deliveryWindowClose: 840, mallWindowOpen: 600, mallWindowClose: 630 }
  ];
  const outlets: Record<string, Outlet> = {};
  for (const { key: outletKey, ...spec } of outletSpecs) outlets[outletKey] = await db.outlet.upsert({ where: { outletRef: `${prefix}-${outletKey}` }, update: {},
    create: { ...spec, outletRef: `${prefix}-${outletKey}`, depotId: depot.id, source: 'SYNTHETIC' } });
  const foreignOutlet = await db.outlet.upsert({ where: { outletRef: `${prefix}-FOREIGN` }, update: {}, create: { outletRef: `${prefix}-FOREIGN`,
    depotId: foreignDepot.id, district: 'SYNTHETIC Alpha', brand: 'FRESH', dockType: 'STREET', accessConstraint: 'NORMAL', deliveryWindowOpen: 300, deliveryWindowClose: 480, source: 'SYNTHETIC' } });
  if (options.assignStore !== false) await db.userOutlet.upsert({ where: { userId_outletId: { userId: store.id, outletId: outlets.FRESH.id } }, update: {}, create: { userId: store.id, outletId: outlets.FRESH.id } });
  for (const [district, km, minutes] of [['SYNTHETIC Alpha', 20, 20], ['SYNTHETIC Beta', 30, 30]] as const) {
    await db.districtTravel.upsert({ where: { depotId_district: { depotId: depot.id, district } }, update: {}, create: { depotId: depot.id, district,
      roadClass: 'URBAN', freeFlowKmh: 30, depotDistanceKm: km, depotMinutes: minutes, interStopKm: 2, interStopMinutes: 5, source: 'SYNTHETIC' } });
  }
  for (const [brand, dockType, serviceMinutes] of [['FRESH', 'STREET', 10], ['TECH', 'STREET', 14], ['STYLE', 'MALL_BAY', 20]] as const) {
    await db.serviceAllowance.upsert({ where: { brand_dockType: { brand, dockType } }, update: {}, create: { brand, dockType, serviceMinutes, source: 'SYNTHETIC' } });
  }
  const vehicleSpecs = [
    { key: 'AMBIENT', type: 'TRUCK' as const, temperatureCapability: 'AMBIENT' as const, weight: '240', volume: '3', kmPerLitre: '10', quota: '20', opening: '1', consumed: '1', reserved: '0.5', active: true, available: 'AVAILABLE' as const },
    { key: 'REEFER', type: 'TRUCK' as const, temperatureCapability: 'REEFER' as const, weight: '180', volume: '3', kmPerLitre: '8', quota: '20', opening: '2', consumed: '1', reserved: '1', active: true, available: 'AVAILABLE' as const },
    { key: 'VAN', type: 'VAN' as const, temperatureCapability: 'AMBIENT' as const, weight: '100', volume: '1.2', kmPerLitre: '10', quota: '10', opening: '0', consumed: '1', reserved: '0', active: true, available: 'AVAILABLE' as const },
    { key: 'FUEL-LIMITED', type: 'TRUCK' as const, temperatureCapability: 'AMBIENT' as const, weight: '1000', volume: '10', kmPerLitre: '10', quota: '2', opening: '0.1', consumed: '0', reserved: '0', active: true, available: 'AVAILABLE' as const },
    { key: 'UNAVAILABLE', type: 'TRUCK' as const, temperatureCapability: 'REEFER' as const, weight: '1000', volume: '10', kmPerLitre: '10', quota: '20', opening: '0', consumed: '0', reserved: '0', active: true, available: 'UNAVAILABLE' as const },
    { key: 'UNKNOWN', type: 'TRUCK' as const, temperatureCapability: 'AMBIENT' as const, weight: '1000', volume: '10', kmPerLitre: '10', quota: '20', opening: null, consumed: '0', reserved: '0', active: true, available: null },
    { key: 'INACTIVE', type: 'TRUCK' as const, temperatureCapability: 'REEFER' as const, weight: '1000', volume: '10', kmPerLitre: '10', quota: '20', opening: '0', consumed: '0', reserved: '0', active: false, available: 'AVAILABLE' as const }
  ];
  const vehicles: Record<string, Awaited<ReturnType<typeof db.vehicle.findUniqueOrThrow>>> = {};
  for (const spec of vehicleSpecs) {
    const vehicle = await db.vehicle.upsert({ where: { vehicleRef: `${prefix}-${spec.key}` }, update: {}, create: { vehicleRef: `${prefix}-${spec.key}`,
      depotId: depot.id, type: spec.type, temperatureCapability: spec.temperatureCapability, weightCapacityKg: spec.weight, volumeCapacityM3: spec.volume,
      kmPerLitre: spec.kmPerLitre, weeklyFuelQuotaLitres: spec.quota, fuelType: 'DIESEL', active: spec.active, source: 'SYNTHETIC' } });
    vehicles[spec.key] = vehicle;
    if (spec.available) await db.vehicleAvailability.upsert({ where: { vehicleId_serviceDate: { vehicleId: vehicle.id, serviceDate: dateOnly(serviceDate) } }, update: {},
      create: { vehicleId: vehicle.id, serviceDate: dateOnly(serviceDate), status: spec.available,
        availableFromMinute: spec.available === 'AVAILABLE' ? 300 : null, availableUntilMinute: spec.available === 'AVAILABLE' ? 1080 : null,
        source: 'SYNTHETIC', note: 'SYNTHETIC explicit day-specific planning status.', createdByUserId: dispatcher.id } });
    const ledger = await db.fuelLedger.upsert({ where: { vehicleId_weekStart: { vehicleId: vehicle.id, weekStart: weekStart(serviceDate) } }, update: {},
      create: { vehicleId: vehicle.id, weekStart: weekStart(serviceDate), openingConsumedLitres: spec.opening,
        openingSource: spec.opening == null ? null : 'SYNTHETIC' } });
    if (!(await db.fuelUsage.count({ where: { ledgerId: ledger.id } }))) {
      for (const [kind, litres] of [['CONSUMED', spec.consumed], ['RESERVED', spec.reserved]] as const) if (Number(litres) > 0) {
        await db.fuelUsage.create({ data: { ledgerId: ledger.id, kind, litres, source: 'SYNTHETIC', occurredAt: new Date(`${serviceDate}T00:00:00Z`), recordedByUserId: dispatcher.id } });
      }
    }
  }
  const specs: Omit<OrderSpec, 'ref'>[] = [
    { outlet: outlets.FRESH, weight: '90', volume: '1', previousDeferrals: 2 }, { outlet: outlets.FRESH, weight: '90', volume: '1' },
    { outlet: outlets.FRESH, weight: '80', volume: '1', temperature: 'CHILLED' }, { outlet: outlets.FRESH, weight: '90', volume: '1.2', temperature: 'FROZEN' },
    { outlet: outlets.VAN, weight: '70', volume: '1', previousDeferrals: 1 }, { outlet: outlets.VAN, weight: '60', volume: '0.7' },
    { outlet: outlets.VAN, weight: '60', volume: '0.7' }, { outlet: outlets.MALL, weight: '40', volume: '0.6' },
    { outlet: outlets.TECH, weight: '80', volume: '0.8' }, { outlet: outlets.FRESH, weight: '500', volume: '1' },
    { outlet: outlets.FRESH, weight: '20', volume: '5' }, { outlet: outlets.VAN, weight: '30', volume: '0.5', temperature: 'CHILLED' }
  ];
  const names = ['PREVIOUSLY-DEFERRED', 'NEWER-AMBIENT', 'CHILLED', 'FROZEN', 'VAN-OLD', 'VAN-NEW', 'VAN-EXCESS', 'MALL', 'TECH', 'OVERWEIGHT', 'OVERVOLUME', 'COLD-VAN'];
  const orders: Record<string, Order> = {};
  for (const [index, spec] of specs.entries()) orders[names[index]] = await ensureFixtureOrder(db, dispatcher.id, serviceDate, { ...spec, ref: `${prefix}-ORDER-${names[index]}` });
  const foreignAssigned = await db.userDepot.findUnique({ where: { userId_depotId: { userId: dispatcher.id, depotId: foreignDepot.id } } });
  if (!foreignAssigned) await db.userDepot.create({ data: { userId: dispatcher.id, depotId: foreignDepot.id } });
  try { orders.FOREIGN = await ensureFixtureOrder(db, dispatcher.id, serviceDate, { ref: `${prefix}-ORDER-FOREIGN`, outlet: foreignOutlet, weight: '25', volume: '0.25' }); }
  finally { if (!foreignAssigned) await db.userDepot.delete({ where: { userId_depotId: { userId: dispatcher.id, depotId: foreignDepot.id } } }); }
  return { key, serviceDate, depot, foreignDepot, storeOutlet: outlets.FRESH, store, dispatcher, loader, driver, outlets, foreignOutlet, vehicles, orders,
    refs: Object.fromEntries(Object.entries(orders).map(([name, order]) => [name, order.orderRef])) };
}

export type PlanningFixture = Awaited<ReturnType<typeof installPlanningFixture>>;
