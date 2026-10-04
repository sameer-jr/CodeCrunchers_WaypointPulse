import { randomUUID } from 'node:crypto';
import { PrismaClient, type TemperatureRequirement } from '@prisma/client';
import { appendAudit } from '../../domain/audit.js';
import { dateOnly, isoWeek } from '../../domain/dates.js';
import { transitionOrder } from '../../domain/lifecycle.js';

export const STORE_SYNTHETIC_DATE = '2040-01-02';
const lifecycleOptions = { allowSyntheticReferences: true };
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function addBusinessDays(date: string, days: number) {
  const result = dateOnly(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

// Independently authored scenarios, installed only by tests or an explicit development fixture command.
export async function installStoreFixture(db: PrismaClient, startDate = STORE_SYNTHETIC_DATE) {
  const depot = await db.depot.upsert({ where: { name: 'SYNTHETIC Store Scenario Depot' },
    create: { name: 'SYNTHETIC Store Scenario Depot' }, update: {} });
  for (let index = 0; index < 12; index++) {
    const date = addBusinessDays(startDate, index), weekday = (dateOnly(date).getUTCDay() + 6) % 7;
    const iso = isoWeek(date);
    await db.calendarDay.upsert({ where: { date: dateOnly(date) }, update: {}, create: {
      date: dateOnly(date), operatingDay: index !== 2, dayOfWeek: weekday, dayName: dayNames[weekday],
      weekend: weekday === 6, isoYear: iso.year, isoWeek: iso.week, payday: false, festivalRamp: 0,
      holiday: false, monsoon: false, source: 'SYNTHETIC'
    } });
  }
  const outlets = await Promise.all((['FRESH', 'STYLE', 'TECH', 'OTHER'] as const).map(name =>
    db.outlet.upsert({ where: { outletRef: `SYN-STORE-${name}` }, update: {}, create: {
      outletRef: `SYN-STORE-${name}`, brand: name === 'OTHER' ? 'FRESH' : name,
      district: 'SYNTHETIC Store District', depotId: depot.id, dockType: 'STREET', accessConstraint: 'NORMAL',
      deliveryWindowOpen: 300, deliveryWindowClose: 960, source: 'SYNTHETIC'
    } })));
  const [store, dispatcher, loader, driver] = await Promise.all(['store', 'dispatcher', 'loader', 'driver'].map(name =>
    db.user.findUniqueOrThrow({ where: { email: `${name}@waypoint.local` } })));
  const [fresh, style, tech, other] = outlets;
  await db.userOutlet.upsert({ where: { userId_outletId: { userId: store.id, outletId: fresh.id } },
    update: {}, create: { userId: store.id, outletId: fresh.id } });
  for (const user of [dispatcher, loader]) await db.userDepot.upsert({ where: { userId_depotId: { userId: user.id, depotId: depot.id } },
    update: {}, create: { userId: user.id, depotId: depot.id } });
  return { depot, fresh, style, tech, other, store, dispatcher, loader, driver, startDate };
}
export type StoreFixture = Awaited<ReturnType<typeof installStoreFixture>>;
type Scenario = 'UNPLANNED' | 'PLANNED' | 'DEFERRED' | 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'AWAITING_RECEIPT';
type ScenarioOptions = { scenario: Scenario; requestedDate?: string; orderedUnits?: number; loadedUnits?: number; deliveredUnits?: number;
  temperatureRequirement?: TemperatureRequirement; reasonDetail?: string; orderRef?: string };

export async function prepareStoreScenario(db: PrismaClient, fixture: StoreFixture, options: ScenarioOptions) {
  const serviceDate = options.requestedDate ?? addBusinessDays(fixture.startDate, 1);
  const order = await db.order.create({ data: { orderRef: options.orderRef ?? `SYN-STORE-ORDER-${randomUUID()}`,
    outletId: fixture.fresh.id, requestedDeliveryDate: dateOnly(serviceDate), eligibleDeliveryDate: dateOnly(serviceDate),
    temperatureRequirement: options.temperatureRequirement ?? 'AMBIENT', orderedUnits: options.orderedUnits ?? 73,
    orderedWeightKg: '41.250', orderedVolumeM3: '0.750', createdByUserId: fixture.store.id } });
  await appendAudit(db, { actor: { id: fixture.store.id, role: 'STORE_MANAGER' }, eventType: 'ORDER_CREATED',
    entityType: 'ORDER', entityId: order.id, metadata: { quantities: { orderedUnits: order.orderedUnits, loadedUnits: null, deliveredUnits: null, receivedUnits: null } } });
  let version = order.version;
  const step = async (actorUserId: string, next: Parameters<typeof transitionOrder>[1]['next']) => {
    const result = await transitionOrder(db, { actorUserId, orderId: order.id, next, expectedVersion: version }, lifecycleOptions);
    version = result.version;
    return result;
  };
  await step(fixture.store.id, 'CONFIRMED');
  if (options.scenario === 'UNPLANNED') return db.order.findUniqueOrThrow({ where: { id: order.id } });
  if (options.scenario === 'DEFERRED') {
    const next = await db.calendarDay.findFirst({ where: { date: { gt: dateOnly(serviceDate) }, operatingDay: true }, orderBy: { date: 'asc' } });
    return transitionOrder(db, { actorUserId: fixture.dispatcher.id, orderId: order.id, next: 'DEFERRED', expectedVersion: version,
      deferral: { reasonCode: 'CAPACITY', reasonDetail: options.reasonDetail ?? 'SYNTHETIC fixture: capacity review remains pending.',
        ...(next ? { nextEligibleDate: next.date.toISOString().slice(0, 10) } : {}) } }, lifecycleOptions);
  }
  await step(fixture.dispatcher.id, 'CLOSED_FOR_PLANNING');
  const vehicle = await db.vehicle.create({ data: { vehicleRef: `SYN-STORE-VEHICLE-${randomUUID()}`, type: 'TRUCK',
    temperatureCapability: 'AMBIENT', weightCapacityKg: 1700, volumeCapacityM3: 15, fuelType: 'DIESEL', kmPerLitre: 8,
    weeklyFuelQuotaLitres: 84, depotId: fixture.depot.id, source: 'SYNTHETIC' } });
  const trip = await db.trip.create({ data: { tripRef: `SYN-STORE-TRIP-${randomUUID()}`, vehicleId: vehicle.id,
    serviceDate: dateOnly(serviceDate), tripNumber: 1, status: 'PLANNED', driverUserId: fixture.driver.id,
    plannedDeparture: new Date(`${serviceDate}T00:30:00Z`) } });
  const stop = await db.tripStop.create({ data: { orderId: order.id, tripId: trip.id, sequence: 1,
    plannedArrival: new Date(`${serviceDate}T01:00:00Z`) } });
  const plan = await db.planningRun.create({ data: { planningRef: `SYN-STORE-PLAN-${randomUUID()}`, depotId: fixture.depot.id,
    serviceDate: dateOnly(serviceDate), status: 'VALIDATED', validatedAt: new Date() } });
  await db.allocation.create({ data: { orderId: order.id, planningRunId: plan.id, tripStopId: stop.id, decision: 'ASSIGNED' } });
  await step(fixture.dispatcher.id, 'PLANNED');
  if (options.scenario === 'PLANNED') return db.order.findUniqueOrThrow({ where: { id: order.id } });
  await db.planningRun.update({ where: { id: plan.id }, data: { status: 'RELEASED', releasedAt: new Date() } });
  await db.trip.update({ where: { id: trip.id }, data: { status: 'RELEASED' } });
  await step(fixture.dispatcher.id, 'RELEASED_TO_LOADING');
  const load = await db.loadRecord.create({ data: { tripStopId: stop.id, expectedUnits: order.orderedUnits,
    status: 'LOADING', recordedByUserId: fixture.loader.id, recordedAt: new Date() } });
  await step(fixture.loader.id, 'LOADING');
  const loadedUnits = options.loadedUnits ?? order.orderedUnits;
  await db.loadRecord.update({ where: { id: load.id }, data: { loadedUnits, status: 'COMPLETE',
    ...(loadedUnits !== order.orderedUnits ? { reason: 'SYNTHETIC fixture loading variance reviewed.', reviewStatus: 'APPROVED',
      reviewedByUserId: fixture.dispatcher.id, reviewedAt: new Date() } : {}) } });
  await step(fixture.loader.id, 'READY_FOR_DISPATCH');
  await db.trip.update({ where: { id: trip.id }, data: { status: 'IN_TRANSIT', actualDeparture: new Date(`${serviceDate}T00:35:00Z`) } });
  await step(fixture.driver.id, 'IN_TRANSIT');
  const arrival = new Date(`${serviceDate}T01:03:00Z`), completed = new Date(`${serviceDate}T01:08:00Z`);
  await db.tripStop.update({ where: { id: stop.id }, data: { status: 'ARRIVED', actualArrival: arrival } });
  await step(fixture.driver.id, 'ARRIVED');
  const deliveredUnits = options.deliveredUnits ?? loadedUnits;
  const delivery = await db.deliveryRecord.create({ data: { tripStopId: stop.id, loadRecordId: load.id,
    expectedLoadedUnits: loadedUnits, deliveredUnits, outcome: deliveredUnits === loadedUnits ? 'DELIVERED' : 'PARTIALLY_DELIVERED',
    ...(deliveredUnits !== loadedUnits ? { driverNote: 'SYNTHETIC fixture delivery variance.' } : {}),
    arrivedAt: arrival, completedAt: completed, recordedByDriverId: fixture.driver.id } });
  await db.deliveryProof.create({ data: { deliveryRecordId: delivery.id, recipientName: 'SYNTHETIC Receiving Colleague',
    recipientRole: 'SYNTHETIC Store Assistant', photoStorageKey: `synthetic/${delivery.id}/photo.jpg`,
    signatureStorageKey: `synthetic/${delivery.id}/signature.png` } });
  await db.tripStop.update({ where: { id: stop.id }, data: { status: 'COMPLETED' } });
  await step(fixture.driver.id, deliveredUnits === loadedUnits ? 'DELIVERED' : 'PARTIALLY_DELIVERED');
  if (options.scenario === 'AWAITING_RECEIPT') await step(fixture.driver.id, 'AWAITING_RECEIPT');
  return db.order.findUniqueOrThrow({ where: { id: order.id } });
}
