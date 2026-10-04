import type { PrismaClient } from '@prisma/client';
import { assertOrderScope, assertOutletScope, assertTripScope, resolveActor } from './scope.js';

export async function readOutlet(db: PrismaClient, userId: string, id: string) {
  const outlet = await assertOutletScope(db, await resolveActor(db, userId), id);
  return { id: outlet.id, outletRef: outlet.outletRef, brand: outlet.brand, district: outlet.district, depotId: outlet.depotId,
    dockType: outlet.dockType, accessConstraint: outlet.accessConstraint, deliveryWindowOpen: outlet.deliveryWindowOpen,
    deliveryWindowClose: outlet.deliveryWindowClose, mallWindowOpen: outlet.mallWindowOpen, mallWindowClose: outlet.mallWindowClose, source: outlet.source };
}
export async function readOrder(db: PrismaClient, userId: string, id: string) {
  const order = await assertOrderScope(db, await resolveActor(db, userId), id);
  const stop = await db.tripStop.findFirst({ where: { orderId: id, active: true }, include: { load: true, delivery: { include: { receipt: true } } } });
  return { id: order.id, orderRef: order.orderRef, outletId: order.outletId, requestedDeliveryDate: order.requestedDeliveryDate.toISOString().slice(0, 10),
    status: order.status, version: order.version, temperatureRequirement: order.temperatureRequirement,
    orderedUnits: order.orderedUnits, orderedWeightKg: order.orderedWeightKg.toString(), orderedVolumeM3: order.orderedVolumeM3.toString(),
    loadedUnits: stop?.load?.loadedUnits ?? null, deliveredUnits: stop?.delivery?.deliveredUnits ?? null,
    receivedUnits: stop?.delivery?.receipt?.receivedUnits ?? null };
}
export async function readTrip(db: PrismaClient, userId: string, id: string) {
  const trip = await assertTripScope(db, await resolveActor(db, userId), id);
  const stops = await db.tripStop.findMany({ where: { tripId: id, active: true }, orderBy: { sequence: 'asc' }, select: { id: true, orderId: true, sequence: true, status: true } });
  return { id: trip.id, tripRef: trip.tripRef, serviceDate: trip.serviceDate.toISOString().slice(0, 10),
    vehicleRef: trip.vehicle.vehicleRef, tripNumber: trip.tripNumber, status: trip.status, version: trip.version, stops };
}
