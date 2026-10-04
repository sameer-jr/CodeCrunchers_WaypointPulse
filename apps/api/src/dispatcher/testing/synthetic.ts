import { PrismaClient, type Order, type Outlet, type TemperatureRequirement } from '@prisma/client';
import { appendAudit } from '../../domain/audit.js';
import { dateOnly } from '../../domain/dates.js';
import { transitionOrder } from '../../domain/lifecycle.js';
import { confirmStoreReceipt } from '../../store/services.js';
import { addBusinessDays, installStoreFixture, prepareStoreScenario, type StoreFixture } from '../../store/testing/synthetic.js';

export const DISPATCHER_SYNTHETIC_DATE = '2040-02-06';
const synthetic = { allowSyntheticReferences: true };
type OrderSpec = { orderRef: string; outlet: Outlet; temperatureRequirement?: TemperatureRequirement; eligibleDate?: string; units?: number };
async function ensureOrder(db: PrismaClient, base: StoreFixture, serviceDate: string, spec: OrderSpec) {
  const existing = await db.order.findUnique({ where: { orderRef: spec.orderRef } });
  if (existing) return existing;
  const assigned = await db.userDepot.findUnique({ where: { userId_depotId: { userId: base.dispatcher.id, depotId: spec.outlet.depotId } } });
  if (!assigned) await db.userDepot.create({ data: { userId: base.dispatcher.id, depotId: spec.outlet.depotId } });
  try {
    const order = await db.order.create({ data: { orderRef: spec.orderRef, outletId: spec.outlet.id,
      requestedDeliveryDate: dateOnly(serviceDate), eligibleDeliveryDate: dateOnly(spec.eligibleDate ?? serviceDate),
      temperatureRequirement: spec.temperatureRequirement ?? 'AMBIENT', orderedUnits: spec.units ?? 31,
      orderedWeightKg: '19.750', orderedVolumeM3: '0.425', createdByUserId: base.dispatcher.id } });
    await appendAudit(db, { actor: { id: base.dispatcher.id, role: 'DISPATCHER' }, eventType: 'ORDER_CREATED', entityType: 'ORDER', entityId: order.id,
      metadata: { toStatus: 'DRAFT', version: 1, quantities: { orderedUnits: order.orderedUnits, loadedUnits: null, deliveredUnits: null, receivedUnits: null } } });
    return await transitionOrder(db, { actorUserId: base.dispatcher.id, orderId: order.id, expectedVersion: 1, next: 'CONFIRMED' }, synthetic);
  } finally {
    if (!assigned) await db.userDepot.delete({ where: { userId_depotId: { userId: base.dispatcher.id, depotId: spec.outlet.depotId } } });
  }
}
async function ensureTrip(db: PrismaClient, base: StoreFixture, serviceDate: string, tripRef: string, orders: Order[]) {
  const existing = await db.trip.findUnique({ where: { tripRef } });
  if (existing) return existing;
  const depotId = (await db.outlet.findUniqueOrThrow({ where: { id: orders[0].outletId } })).depotId;
  const assigned = await db.userDepot.findUnique({ where: { userId_depotId: { userId: base.dispatcher.id, depotId } } });
  if (!assigned) await db.userDepot.create({ data: { userId: base.dispatcher.id, depotId } });
  try {
    const vehicle = await db.vehicle.create({ data: { vehicleRef: `${tripRef}-VEHICLE`, depotId, type: 'TRUCK', temperatureCapability: 'REEFER',
      weightCapacityKg: 1450, volumeCapacityM3: 14, fuelType: 'DIESEL', kmPerLitre: 8, weeklyFuelQuotaLitres: 88, source: 'SYNTHETIC' } });
    const trip = await db.trip.create({ data: { tripRef, vehicleId: vehicle.id, serviceDate: dateOnly(serviceDate), tripNumber: 1, status: 'PLANNED',
      driverUserId: base.driver.id, plannedDeparture: new Date(`${serviceDate}T00:30:00Z`) } });
    const plan = await db.planningRun.create({ data: { planningRef: `${tripRef}-PREPARED-FIXTURE`, depotId,
      serviceDate: dateOnly(serviceDate), status: 'VALIDATED', validatedAt: new Date() } });
    for (const [index, order] of orders.entries()) {
      const closed = await transitionOrder(db, { actorUserId: base.dispatcher.id, orderId: order.id, expectedVersion: order.version, next: 'CLOSED_FOR_PLANNING' }, synthetic);
      const stop = await db.tripStop.create({ data: { tripId: trip.id, orderId: order.id, sequence: index + 1,
        plannedArrival: new Date(`${serviceDate}T0${index + 1}:00:00Z`) } });
      await db.allocation.create({ data: { orderId: order.id, tripStopId: stop.id, planningRunId: plan.id, decision: 'ASSIGNED' } });
      await transitionOrder(db, { actorUserId: base.dispatcher.id, orderId: order.id, expectedVersion: closed.version, next: 'PLANNED' }, synthetic);
    }
    return trip;
  } finally {
    if (!assigned) await db.userDepot.delete({ where: { userId_depotId: { userId: base.dispatcher.id, depotId } } });
  }
}
async function ensureDelivered(db: PrismaClient, base: StoreFixture, serviceDate: string, orderRef: string) {
  return (await db.order.findUnique({ where: { orderRef } })) ?? prepareStoreScenario(db, base, {
    orderRef, requestedDate: serviceDate, scenario: 'AWAITING_RECEIPT', loadedUnits: 69, deliveredUnits: 66
  });
}
async function ensureReceiptIssue(db: PrismaClient, base: StoreFixture, order: Order, issueType: 'QUANTITY_DISCREPANCY' | 'DAMAGED_GOODS') {
  const receipt = await db.receipt.findFirst({ where: { deliveryRecord: { tripStop: { orderId: order.id } } } });
  if (receipt) return receipt;
  const detail = await confirmStoreReceipt(db, base.store.id, order.id, { expectedVersion: order.version, receivedUnits: issueType === 'DAMAGED_GOODS' ? 66 : 65,
    issueType, issueNote: issueType === 'DAMAGED_GOODS' ? 'SYNTHETIC fixture: two cartons show damage for review.' : 'SYNTHETIC fixture: one unit missing from the receipt.' }, synthetic);
  return db.receipt.findUniqueOrThrow({ where: { id: detail.receipt!.id } });
}

// Fixed independent scenario preparation. Its persisted trips are fixtures, never allocation-engine output.
export async function installDispatcherFixture(db: PrismaClient, serviceDate = DISPATCHER_SYNTHETIC_DATE) {
  if (process.env.NODE_ENV === 'production') throw new Error('Dispatcher synthetic fixtures are forbidden in production.');
  const base = await installStoreFixture(db, addBusinessDays(serviceDate, -1));
  const secondaryDepot = await db.depot.upsert({ where: { name: 'SYNTHETIC Secondary Dispatcher Depot' }, update: {}, create: { name: 'SYNTHETIC Secondary Dispatcher Depot' } });
  const foreignDepot = await db.depot.upsert({ where: { name: 'SYNTHETIC Foreign Dispatcher Depot' }, update: {}, create: { name: 'SYNTHETIC Foreign Dispatcher Depot' } });
  const [vanOutlet, secondaryOutlet, foreignOutlet] = await Promise.all([
    { outletRef: 'SYN-DSP-VAN-ONLY', depotId: base.depot.id, district: 'SYNTHETIC Van District', accessConstraint: 'VAN_ONLY' as const },
    { outletRef: 'SYN-DSP-SECONDARY', depotId: secondaryDepot.id, district: 'SYNTHETIC Secondary District', accessConstraint: 'NORMAL' as const },
    { outletRef: 'SYN-DSP-FOREIGN', depotId: foreignDepot.id, district: 'SYNTHETIC Foreign District', accessConstraint: 'NORMAL' as const }
  ].map(outlet => db.outlet.upsert({ where: { outletRef: outlet.outletRef }, update: {}, create: { ...outlet,
    brand: 'FRESH', dockType: 'STREET', deliveryWindowOpen: 300, deliveryWindowClose: 960, source: 'SYNTHETIC' } })));
  for (const outlet of [base.fresh, vanOutlet, secondaryOutlet, foreignOutlet]) await db.districtTravel.upsert({
    where: { depotId_district: { depotId: outlet.depotId, district: outlet.district } }, update: {}, create: {
      depotId: outlet.depotId, district: outlet.district, roadClass: 'URBAN', freeFlowKmh: 35,
      depotDistanceKm: 12, depotMinutes: 24, interStopKm: 2, interStopMinutes: 5, source: 'SYNTHETIC'
    }
  });
  for (const [brand, serviceMinutes] of [['FRESH', 12], ['STYLE', 18], ['TECH', 14]] as const) await db.serviceAllowance.upsert({
    where: { brand_dockType: { brand, dockType: 'STREET' } }, update: {}, create: { brand, dockType: 'STREET', serviceMinutes, source: 'SYNTHETIC' }
  });
  for (const [depotId, name] of [[base.depot.id, 'OWN'], [secondaryDepot.id, 'SECONDARY'], [foreignDepot.id, 'FOREIGN']]) {
    await db.vehicle.upsert({ where: { vehicleRef: `SYN-DSP-${name}-VAN` }, update: {}, create: { vehicleRef: `SYN-DSP-${name}-VAN`,
      depotId, type: 'VAN', temperatureCapability: 'AMBIENT', weightCapacityKg: 410, volumeCapacityM3: 4.5,
      fuelType: 'DIESEL', kmPerLitre: 10, weeklyFuelQuotaLitres: 55, source: 'SYNTHETIC' } });
  }
  await db.vehicle.upsert({ where: { vehicleRef: 'SYN-DSP-INACTIVE-MASTER' }, update: {}, create: { vehicleRef: 'SYN-DSP-INACTIVE-MASTER', depotId: base.depot.id,
    type: 'TRUCK', temperatureCapability: 'AMBIENT', active: false, weightCapacityKg: 1800, volumeCapacityM3: 20,
    fuelType: 'DIESEL', kmPerLitre: 8, weeklyFuelQuotaLitres: 90, source: 'SYNTHETIC' } });
  const specs: OrderSpec[] = [
    { orderRef: 'SYN-DSP-FRESH-AMBIENT', outlet: base.fresh },
    { orderRef: 'SYN-DSP-FRESH-CHILLED', outlet: base.fresh, temperatureRequirement: 'CHILLED', units: 43 },
    { orderRef: 'SYN-DSP-FRESH-FROZEN', outlet: base.fresh, temperatureRequirement: 'FROZEN', units: 57 },
    { orderRef: 'SYN-DSP-STYLE-AMBIENT', outlet: base.style, units: 17 },
    { orderRef: 'SYN-DSP-TECH-AMBIENT', outlet: base.tech, units: 8 },
    { orderRef: 'SYN-DSP-VAN-AMBIENT', outlet: vanOutlet, units: 21 },
    { orderRef: 'SYN-DSP-DEFERRED-TWICE', outlet: base.fresh },
    { orderRef: 'SYN-DSP-PLANNED-ONE', outlet: base.fresh },
    { orderRef: 'SYN-DSP-PLANNED-TWO', outlet: base.style },
    { orderRef: 'SYN-DSP-ELIGIBLE-LATER', outlet: base.fresh, eligibleDate: addBusinessDays(serviceDate, 3) },
    { orderRef: 'SYN-DSP-TRIP-LATER', outlet: base.fresh, eligibleDate: addBusinessDays(serviceDate, 3) },
    { orderRef: 'SYN-DSP-SECONDARY-ORDER', outlet: secondaryOutlet },
    { orderRef: 'SYN-DSP-FOREIGN-ORDER', outlet: foreignOutlet }
  ];
  const orders: Record<string, Order> = {};
  for (const spec of specs) orders[spec.orderRef] = await ensureOrder(db, base, serviceDate, spec);
  let deferred = orders['SYN-DSP-DEFERRED-TWICE'];
  for (const [index, reasonCode] of (['CAPACITY', 'FUEL_UNKNOWN'] as const).entries()) {
    if ((await db.deferralRecord.count({ where: { orderId: deferred.id } })) <= index) deferred = await transitionOrder(db, {
      actorUserId: base.dispatcher.id, orderId: deferred.id, expectedVersion: deferred.version, next: 'DEFERRED',
      deferral: { reasonCode, reasonDetail: `SYNTHETIC fixture: ${index + 1} retained operational review.`, nextEligibleDate: addBusinessDays(serviceDate, 2) }
    }, synthetic);
  }
  const plannedTrip = await ensureTrip(db, base, serviceDate, 'SYN-DSP-PREPARED-TRIP', [orders['SYN-DSP-PLANNED-ONE'], orders['SYN-DSP-PLANNED-TWO']]);
  const laterTrip = await ensureTrip(db, base, addBusinessDays(serviceDate, 4), 'SYN-DSP-PREPARED-LATER-TRIP', [orders['SYN-DSP-TRIP-LATER']]);
  const foreignTrip = await ensureTrip(db, base, serviceDate, 'SYN-DSP-FOREIGN-TRIP', [orders['SYN-DSP-FOREIGN-ORDER']]);
  const ready = await ensureDelivered(db, base, serviceDate, 'SYN-DSP-RECEIPT-READY');
  const discrepancy = await ensureDelivered(db, base, serviceDate, 'SYN-DSP-RECEIPT-DISCREPANCY');
  const damage = await ensureDelivered(db, base, serviceDate, 'SYN-DSP-RECEIPT-DAMAGE');
  const discrepancyReceipt = await ensureReceiptIssue(db, base, discrepancy, 'QUANTITY_DISCREPANCY');
  const damageReceipt = await ensureReceiptIssue(db, base, damage, 'DAMAGED_GOODS');
  return { ...base, serviceDate, secondaryDepot, foreignDepot, vanOutlet, secondaryOutlet, foreignOutlet, orders,
    plannedTrip, laterTrip, foreignTrip, ready, discrepancy, damage, discrepancyReceipt, damageReceipt };
}
export type DispatcherFixture = Awaited<ReturnType<typeof installDispatcherFixture>>;
