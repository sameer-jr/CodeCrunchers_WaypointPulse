import { type PrismaClient } from '@prisma/client';
import { appendAudit } from '../../domain/audit.js';
import { dateOnly } from '../../domain/dates.js';
import { transitionOrderInTransaction } from '../../domain/lifecycle.js';
import { installPlanningFixture, PLANNING_SYNTHETIC_DATE } from '../../planning/testing/synthetic.js';
import { addBusinessDays } from '../../store/testing/synthetic.js';
import { syntheticReferencesPermitted } from '../../domain/synthetic-mode.js';

export const LOADER_SYNTHETIC_DATE = PLANNING_SYNTHETIC_DATE;

export async function installLoaderFixture(db: PrismaClient, options: { key?: string; serviceDate?: string; assignStore?: boolean } = {}) {
  if (!syntheticReferencesPermitted()) throw new Error('Synthetic Loader fixtures require an explicitly enabled public judge demo in production.');
  const key = options.key ?? 'LOADER', serviceDate = options.serviceDate ?? LOADER_SYNTHETIC_DATE;
  const fixture = await installPlanningFixture(db, { ...options, key, serviceDate });
  const orderRef = `SYN-LOADER-${key}-ORDER-192`;
  let shortfallOrder = await db.order.findUnique({ where: { orderRef } });
  if (!shortfallOrder) {
    shortfallOrder = await db.$transaction(async tx => {
      const order = await tx.order.create({ data: { orderRef, outletId: fixture.storeOutlet.id,
      requestedDeliveryDate: dateOnly(serviceDate), eligibleDeliveryDate: dateOnly(serviceDate), temperatureRequirement: 'AMBIENT',
      orderedUnits: 192, orderedWeightKg: '15', orderedVolumeM3: '0.15', createdByUserId: fixture.dispatcher.id,
      createdAt: new Date(`${addBusinessDays(serviceDate, -3)}T04:00:00Z`) } });
      await appendAudit(tx, { actor: { id: fixture.dispatcher.id, role: 'DISPATCHER' }, eventType: 'ORDER_CREATED',
      entityType: 'ORDER', entityId: order.id, metadata: { toStatus: 'DRAFT', version: 1,
        quantities: { orderedUnits: 192, loadedUnits: null, deliveredUnits: null, receivedUnits: null } } });
      return transitionOrderInTransaction(tx, { actorUserId: fixture.dispatcher.id, orderId: order.id,
        expectedVersion: order.version, next: 'CONFIRMED' }, { allowSyntheticReferences: true });
    });
  }
  return { ...fixture, shortfallOrder };
}

export type LoaderFixture = Awaited<ReturnType<typeof installLoaderFixture>>;
