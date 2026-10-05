import { Prisma } from '@prisma/client';
import type { DispatcherDeferral, DispatcherExceptionSummary, DispatcherOrderSummary, DispatcherTripSummary, DispatcherVehicle } from '@waypoint/shared';
import { deliveryProofInclude } from '../proof/dto.js';

export const orderInclude = { outlet: { include: { depot: true } }, _count: { select: { deferrals: true } },
  deferrals: { orderBy: { deferredAt: 'desc' }, take: 1 }, stops: { where: { active: true }, take: 1,
    include: { trip: { include: { vehicle: { include: { depot: true } } } }, load: true, delivery: { include: { proof: { include: deliveryProofInclude }, receipt: true } } } } } satisfies Prisma.OrderInclude;
export type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export const tripInclude = { vehicle: { include: { depot: true } }, driver: { select: { displayName: true } }, planningRun: true,
  stops: { orderBy: { sequence: 'asc' }, include: { order: { include: orderInclude }, allocations: { include: { planningRun: true } } } } } satisfies Prisma.TripInclude;
export type TripRecord = Prisma.TripGetPayload<{ include: typeof tripInclude }>;
const exceptionOrderInclude = { outlet: { include: { depot: true } }, stops: { where: { active: true }, take: 1, include: { trip: { include: { vehicle: { include: { depot: true } } } } } } } satisfies Prisma.OrderInclude;
const exceptionStopInclude = { order: { include: exceptionOrderInclude }, trip: { include: { vehicle: { include: { depot: true } } } } } satisfies Prisma.TripStopInclude;
export const exceptionInclude = { createdBy: { select: { id: true, role: true } }, order: { include: exceptionOrderInclude },
  trip: { include: { vehicle: { include: { depot: true } } } }, loadRecord: { include: { tripStop: { include: exceptionStopInclude } } },
  deliveryRecord: { include: { tripStop: { include: exceptionStopInclude } } },
  receipt: { include: { deliveryRecord: { include: { tripStop: { include: exceptionStopInclude } } } } } } satisfies Prisma.ExceptionInclude;
export type ExceptionRecord = Prisma.ExceptionGetPayload<{ include: typeof exceptionInclude }>;
export function deferralDto(row: OrderRecord['deferrals'][number]): DispatcherDeferral {
  return { id: row.id, reasonCode: row.reasonCode, reasonDetail: row.reasonDetail, deferredAt: row.deferredAt.toISOString(), nextEligibleDate: row.nextEligibleDate?.toISOString().slice(0, 10) ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null };
}
export function orderDto(order: OrderRecord): DispatcherOrderSummary {
  const stop = order.stops[0], delivery = stop?.delivery, receipt = delivery?.receipt, outlet = order.outlet;
  const requested = order.requestedDeliveryDate.toISOString().slice(0, 10), eligible = (order.eligibleDeliveryDate ?? order.requestedDeliveryDate).toISOString().slice(0, 10);
  return { id: order.id, orderRef: order.orderRef, status: order.status, version: order.version, requestedDeliveryDate: requested, eligibleDeliveryDate: eligible,
    eligibilityNotice: eligible !== requested ? `Original requested date: ${requested}; initial eligible run: ${eligible}.` : null,
    createdAt: order.createdAt.toISOString(), confirmedAt: order.confirmedAt?.toISOString() ?? null, temperatureRequirement: order.temperatureRequirement,
    orderedUnits: order.orderedUnits, orderedWeightKg: order.orderedWeightKg.toString(), orderedVolumeM3: order.orderedVolumeM3.toString(),
    loadedUnits: stop?.load?.loadedUnits ?? null, deliveredUnits: delivery?.deliveredUnits ?? null, receivedUnits: receipt?.receivedUnits ?? null,
    plannedArrival: stop?.plannedArrival?.toISOString() ?? null, actualArrival: stop?.actualArrival?.toISOString() ?? null, completedAt: delivery?.completedAt.toISOString() ?? null,
    receiptStatus: receipt?.status ?? null, issueType: receipt?.issueType ?? null,
    outlet: { id: outlet.id, outletRef: outlet.outletRef, brand: outlet.brand, district: outlet.district, depotId: outlet.depotId, depotName: outlet.depot.name,
      dockType: outlet.dockType, accessConstraint: outlet.accessConstraint, source: outlet.source, deliveryWindowOpen: outlet.deliveryWindowOpen,
      deliveryWindowClose: outlet.deliveryWindowClose, mallWindowOpen: outlet.mallWindowOpen, mallWindowClose: outlet.mallWindowClose },
    operationalDate: (stop?.trip.serviceDate ?? order.eligibleDeliveryDate ?? order.requestedDeliveryDate).toISOString().slice(0, 10), operationalDateSource: stop ? 'TRIP' : 'ELIGIBLE_REQUEST',
    deferralCount: order._count.deferrals, latestDeferral: order.deferrals[0] ? deferralDto(order.deferrals[0]) : null,
    trip: stop ? { id: stop.trip.id, tripRef: stop.trip.tripRef, serviceDate: stop.trip.serviceDate.toISOString().slice(0, 10), vehicleRef: stop.trip.vehicle.vehicleRef, tripNumber: stop.trip.tripNumber, status: stop.trip.status } : null };
}
export function vehicleDto(vehicle: TripRecord['vehicle']): DispatcherVehicle {
  return { id: vehicle.id, vehicleRef: vehicle.vehicleRef, depot: { id: vehicle.depotId, name: vehicle.depot.name }, type: vehicle.type,
    temperatureCapability: vehicle.temperatureCapability, active: vehicle.active, weightCapacityKg: vehicle.weightCapacityKg.toString(), volumeCapacityM3: vehicle.volumeCapacityM3.toString(), source: vehicle.source, operationalAvailability: 'UNKNOWN' };
}
export function tripDto(trip: TripRecord): DispatcherTripSummary {
  const orders = trip.stops.filter(stop => stop.active).map(stop => stop.order);
  const run = trip.planningRun ?? trip.stops.flatMap(stop => stop.allocations).find(row => row.decision === 'ASSIGNED')?.planningRun;
  return { id: trip.id, tripRef: trip.tripRef, serviceDate: trip.serviceDate.toISOString().slice(0, 10), status: trip.status, tripNumber: trip.tripNumber,
    version: trip.version, driverUserId: trip.driverUserId, completedAt: trip.completedAt?.toISOString() ?? null,
    planningOrigin: run ? run.strategyVersion ? 'GENERATED' : 'PREPARED' : null, planningRunId: run?.id ?? null, planningStatus: run?.status ?? null,
    vehicle: vehicleDto(trip.vehicle), driverName: trip.driver?.displayName ?? null, plannedDeparture: trip.plannedDeparture?.toISOString() ?? null,
    actualDeparture: trip.actualDeparture?.toISOString() ?? null, plannedReturn: trip.plannedReturn?.toISOString() ?? null, actualReturn: trip.actualReturn?.toISOString() ?? null,
    stopCount: orders.length, orderedUnits: orders.reduce((sum, row) => sum + row.orderedUnits, 0),
    orderedWeightKg: orders.reduce((sum, row) => sum.add(row.orderedWeightKg), new Prisma.Decimal(0)).toString(), orderedVolumeM3: orders.reduce((sum, row) => sum.add(row.orderedVolumeM3), new Prisma.Decimal(0)).toString() };
}
export function exceptionLinks(row: ExceptionRecord) {
  const stop = row.loadRecord?.tripStop ?? row.deliveryRecord?.tripStop ?? row.receipt?.deliveryRecord.tripStop;
  const order = row.order ?? stop?.order ?? null;
  const trip = row.trip ?? stop?.trip ?? order?.stops[0]?.trip ?? null;
  const depot = trip?.vehicle.depot ?? order?.outlet.depot;
  if (!depot) throw new Error('The scoped exception has no operational relationship.');
  const operationalDate = (trip?.serviceDate ?? order!.eligibleDeliveryDate ?? order!.requestedDeliveryDate).toISOString().slice(0, 10);
  return { order, trip, depot, operationalDate };
}
export async function exceptionDtos(db: Prisma.TransactionClient, rows: ExceptionRecord[]): Promise<DispatcherExceptionSummary[]> {
  const links = rows.map(exceptionLinks), ids = links.flatMap(link => link.order ? [link.order.id] : []), actors = rows.flatMap(row => row.createdBy ? [row.createdBy.id] : []);
  const audits = ids.length && actors.length ? await db.auditEvent.findMany({ where: { entityType: 'ORDER', entityId: { in: ids }, actorUserId: { in: actors } }, select: { entityId: true, actorUserId: true, actorRole: true, timestamp: true } }) : [];
  const snapshots = new Map(audits.filter(row => row.actorRole).map(row => [`${row.entityId}:${row.actorUserId}:${row.timestamp.getTime()}`, row.actorRole!]));
  return rows.map((row, index) => {
    const link = links[index], snapshot = link.order && row.createdBy ? snapshots.get(`${link.order.id}:${row.createdBy.id}:${row.createdAt.getTime()}`) : undefined;
    return { id: row.id, type: row.type, status: row.status, message: row.message, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null,
      originRole: snapshot ?? row.createdBy?.role ?? null, originRoleSource: snapshot ? 'AUDIT_SNAPSHOT' : row.createdBy ? 'CURRENT_ACCOUNT' : 'UNKNOWN',
      operationalDate: link.operationalDate, depot: { id: link.depot.id, name: link.depot.name },
      order: link.order ? { id: link.order.id, orderRef: link.order.orderRef, status: link.order.status, outletRef: link.order.outlet.outletRef, brand: link.order.outlet.brand } : null,
      trip: link.trip ? { id: link.trip.id, tripRef: link.trip.tripRef, serviceDate: link.trip.serviceDate.toISOString().slice(0, 10) } : null };
  });
}
