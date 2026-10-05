import { Prisma } from '@prisma/client';
import { DELIVERY_REASONS, type DriverStop, type DriverTripDetail } from '@waypoint/shared';
import { vehicleDto } from '../dispatcher/dto.js';
import { deliveryProofDto, deliveryProofInclude } from '../proof/dto.js';

export const driverTripInclude = { vehicle: { include: { depot: true } }, planningRun: true, exceptions: true,
  stops: { where: { active: true }, orderBy: { sequence: 'asc' }, include: { allocations: true,
    order: { include: { outlet: { include: { depot: true } }, exceptions: true } }, load: { include: { exceptions: true } },
    delivery: { include: { proof: { include: deliveryProofInclude }, receipt: true, exceptions: true } } } }
} satisfies Prisma.TripInclude;
export type DriverTripRecord = Prisma.TripGetPayload<{ include: typeof driverTripInclude }>;
export function driverTripDetail(trip: DriverTripRecord): DriverTripDetail {
  const current = trip.stops.find(stop => !stop.delivery && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(stop.status));
  const stops: DriverStop[] = trip.stops.map(stop => {
    const outlet = stop.order.outlet, delivery = stop.delivery;
    return { id: stop.id, sequence: stop.sequence, version: stop.version, status: stop.status,
      plannedArrival: stop.plannedArrival?.toISOString() ?? null, actualArrival: stop.actualArrival?.toISOString() ?? null,
      completedAt: delivery?.completedAt.toISOString() ?? null,
      order: { id: stop.orderId, orderRef: stop.order.orderRef, version: stop.order.version, status: stop.order.status,
        orderedUnits: stop.order.orderedUnits, temperatureRequirement: stop.order.temperatureRequirement,
        outlet: { id: outlet.id, outletRef: outlet.outletRef, brand: outlet.brand, district: outlet.district, depotName: outlet.depot.name,
          dockType: outlet.dockType, accessConstraint: outlet.accessConstraint, source: outlet.source,
          deliveryWindowOpen: outlet.deliveryWindowOpen, deliveryWindowClose: outlet.deliveryWindowClose,
          mallWindowOpen: outlet.mallWindowOpen, mallWindowClose: outlet.mallWindowClose } },
      loadedUnits: stop.load!.loadedUnits!,
      delivery: delivery ? { id: delivery.id, outcome: delivery.outcome, expectedLoadedUnits: delivery.expectedLoadedUnits,
        deliveredUnits: delivery.deliveredUnits, reasonCode: DELIVERY_REASONS.find(code => code === delivery.reasonCode) ?? null,
        driverNote: delivery.driverNote, arrivedAt: delivery.arrivedAt.toISOString(), completedAt: delivery.completedAt.toISOString(),
        proof: deliveryProofDto(delivery.proof) } : null,
      canArrive: trip.status === 'IN_TRANSIT' && current?.id === stop.id && stop.status === 'PLANNED' && !delivery,
      canComplete: trip.status === 'IN_TRANSIT' && current?.id === stop.id && stop.status === 'ARRIVED' && !!stop.actualArrival && !delivery,
      exceptions: [...(stop.load?.exceptions ?? []), ...(delivery?.exceptions ?? [])].map(row => ({ id: row.id, type: row.type,
        status: row.status, message: row.message, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null })) };
  });
  const completedStops = stops.filter(stop => stop.delivery && ['COMPLETED', 'FAILED'].includes(stop.status)).length;
  return { id: trip.id, tripRef: trip.tripRef, tripNumber: trip.tripNumber, version: trip.version,
    serviceDate: trip.serviceDate.toISOString().slice(0, 10), status: trip.status as DriverTripDetail['status'], vehicle: vehicleDto(trip.vehicle),
    plannedDeparture: trip.plannedDeparture?.toISOString() ?? null, actualDeparture: trip.actualDeparture?.toISOString() ?? null,
    completedAt: trip.completedAt?.toISOString() ?? null, orderedUnits: stops.reduce((sum, stop) => sum + stop.order.orderedUnits, 0),
    loadedUnits: stops.reduce((sum, stop) => sum + stop.loadedUnits, 0), deliveredUnits: stops.reduce((sum, stop) => sum + (stop.delivery?.deliveredUnits ?? 0), 0),
    stopCount: stops.length, completedStops, nextStopId: current?.id ?? null, canStart: trip.status === 'READY_FOR_DISPATCH' && !trip.actualDeparture,
    canFinish: trip.status === 'IN_TRANSIT' && stops.length > 0 && completedStops === stops.length, stops };
}
