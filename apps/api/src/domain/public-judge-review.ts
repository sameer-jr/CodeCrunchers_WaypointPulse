import { Prisma, type PrismaClient } from '@prisma/client';
import { appendAudit } from './audit.js';
import { dateOnly, isoWeek, weekStart } from './dates.js';
import { transitionOrderInTransaction } from './lifecycle.js';
import { PUBLIC_JUDGE_DATES, PUBLIC_JUDGE_OPERATING_DATES } from './public-judge-dates.js';
import { syntheticReferencesPermitted } from './synthetic-mode.js';

export async function assertPublicJudgeDatabase(db: Prisma.TransactionClient) {
  const officialCounts = await Promise.all([
    db.referenceImport.count({ where: { source: 'OFFICIAL' } }), db.outlet.count({ where: { source: 'OFFICIAL' } }),
    db.vehicle.count({ where: { source: 'OFFICIAL' } }), db.calendarDay.count({ where: { source: 'OFFICIAL' } }),
    db.districtTravel.count({ where: { source: 'OFFICIAL' } }), db.serviceAllowance.count({ where: { source: 'OFFICIAL' } }),
    db.vehicleAvailability.count({ where: { source: 'OFFICIAL' } }), db.fuelLedger.count({ where: { openingSource: 'OFFICIAL' } }),
    db.fuelUsage.count({ where: { source: 'OFFICIAL' } })
  ]);
  if (officialCounts.some(count => count > 0)) throw new Error('Public judge installation requires a separate database without official reference data.');
}

export const PUBLIC_JUDGE_REVIEW_ORDERS = [
  { orderRef: 'DEMO-REVIEW-AMBIENT-192', serviceDate: PUBLIC_JUDGE_DATES.executionDate, temperatureRequirement: 'AMBIENT', orderedUnits: 192, orderedWeightKg: '15', orderedVolumeM3: '0.15' },
  { orderRef: 'DEMO-REVIEW-CHILLED-25', serviceDate: PUBLIC_JUDGE_DATES.executionDate, temperatureRequirement: 'CHILLED', orderedUnits: 25, orderedWeightKg: '80', orderedVolumeM3: '1' },
  { orderRef: 'DEMO-REVIEW-FROZEN-25', serviceDate: PUBLIC_JUDGE_DATES.executionDate, temperatureRequirement: 'FROZEN', orderedUnits: 25, orderedWeightKg: '90', orderedVolumeM3: '1.2' },
  { orderRef: 'DEMO-PLAN-AMBIENT-100', serviceDate: PUBLIC_JUDGE_DATES.planningDate, temperatureRequirement: 'AMBIENT', orderedUnits: 100, orderedWeightKg: '30', orderedVolumeM3: '0.3' }
] as const;

export type JudgeFixture = { depot: { id: string }; storeOutlet: { id: string }; store: { id: string }; dispatcher: { id: string } };

export async function preparePublicJudgeReview(db: PrismaClient, fixture: JudgeFixture) {
  if (!syntheticReferencesPermitted()) throw new Error('Public judge preparation requires an explicitly enabled public judge demo in production.');
  return db.$transaction(tx => preparePublicJudgeReviewInTransaction(tx, fixture), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
}

export async function preparePublicJudgeReviewInTransaction(tx: Prisma.TransactionClient, fixture: JudgeFixture) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waypoint-public-judge-review-v1'))`;
    await assertPublicJudgeDatabase(tx);
    const assignments = await tx.userOutlet.findMany({ where: { userId: fixture.store.id }, take: 2 });
    if (assignments.length !== 1 || assignments[0].outletId !== fixture.storeOutlet.id) throw new Error('Public judge preparation requires the existing single Store outlet assignment.');
    const outlet = await tx.outlet.findUniqueOrThrow({ where: { id: fixture.storeOutlet.id } });
    if (outlet.source !== 'SYNTHETIC' || outlet.depotId !== fixture.depot.id) throw new Error('Public judge preparation requires the existing synthetic Store depot and outlet.');

    for (const serviceDate of PUBLIC_JUDGE_OPERATING_DATES) {
      const date = dateOnly(serviceDate), weekday = (date.getUTCDay() + 6) % 7, iso = isoWeek(serviceDate);
      const day = await tx.calendarDay.upsert({ where: { date }, update: {}, create: { date, dayOfWeek: weekday,
        dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday], weekend: weekday === 6,
        isoYear: iso.year, isoWeek: iso.week, operatingDay: true, payday: false, festivalRamp: 0, holiday: false, monsoon: false, source: 'SYNTHETIC' } });
      if (!day.operatingDay || day.source !== 'SYNTHETIC') throw new Error('A registered public judge date already has incompatible calendar data.');
    }

    for (const vehicleRef of ['SYN-PLAN-DRIVER-AMBIENT', 'SYN-PLAN-DRIVER-REEFER']) {
      const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { vehicleRef } });
      if (!vehicle.active || vehicle.source !== 'SYNTHETIC' || vehicle.depotId !== fixture.depot.id) throw new Error('Public judge preparation requires the existing active synthetic vehicles.');
      for (const serviceDate of [PUBLIC_JUDGE_DATES.executionDate, PUBLIC_JUDGE_DATES.planningDate]) {
        await tx.vehicleAvailability.upsert({ where: { vehicleId_serviceDate: { vehicleId: vehicle.id, serviceDate: dateOnly(serviceDate) } }, update: {},
          create: { vehicleId: vehicle.id, serviceDate: dateOnly(serviceDate), status: 'AVAILABLE', availableFromMinute: 300, availableUntilMinute: 1080,
            source: 'SYNTHETIC', note: 'Independent competition review scenario: explicitly available from 05:00 to 18:00.', createdByUserId: fixture.dispatcher.id } });
      }
      const ledger = await tx.fuelLedger.upsert({ where: { vehicleId_weekStart: { vehicleId: vehicle.id, weekStart: weekStart(PUBLIC_JUDGE_DATES.executionDate) } }, update: {},
        create: { vehicleId: vehicle.id, weekStart: weekStart(PUBLIC_JUDGE_DATES.executionDate), openingConsumedLitres: '0', openingSource: 'SYNTHETIC' } });
      if (ledger.openingSource !== 'SYNTHETIC' || !ledger.openingConsumedLitres?.equals(0)) throw new Error('The review week already has an incompatible opening fuel ledger; existing fuel is never reset.');
    }

    const orders = [];
    for (const { serviceDate, ...spec } of PUBLIC_JUDGE_REVIEW_ORDERS) {
      const existing = await tx.order.findUnique({ where: { orderRef: spec.orderRef } });
      if (existing) {
        if (existing.outletId !== fixture.storeOutlet.id || existing.requestedDeliveryDate.getTime() !== dateOnly(serviceDate).getTime()
          || existing.temperatureRequirement !== spec.temperatureRequirement || existing.orderedUnits !== spec.orderedUnits
          || !existing.orderedWeightKg.equals(spec.orderedWeightKg) || !existing.orderedVolumeM3.equals(spec.orderedVolumeM3)) {
          throw new Error('A review order reference already contains different demand; existing orders are never reset.');
        }
        orders.push(existing);
        continue;
      }
      const order = await tx.order.create({ data: { ...spec, outletId: fixture.storeOutlet.id, createdByUserId: fixture.store.id,
        requestedDeliveryDate: dateOnly(serviceDate), eligibleDeliveryDate: dateOnly(serviceDate) } });
      await appendAudit(tx, { actor: { id: fixture.store.id, role: 'STORE_MANAGER' }, eventType: 'ORDER_CREATED', entityType: 'ORDER', entityId: order.id,
        metadata: { source: 'SYNTHETIC', toStatus: 'DRAFT', version: 1, quantities: { orderedUnits: spec.orderedUnits, loadedUnits: null, deliveredUnits: null, receivedUnits: null } } });
      orders.push(await transitionOrderInTransaction(tx, { actorUserId: fixture.store.id, orderId: order.id, expectedVersion: 1, next: 'CONFIRMED' }, { allowSyntheticReferences: true }));
    }
    return orders.map(order => ({ id: order.id, orderRef: order.orderRef, serviceDate: order.requestedDeliveryDate.toISOString().slice(0, 10), orderedUnits: order.orderedUnits }));
}
