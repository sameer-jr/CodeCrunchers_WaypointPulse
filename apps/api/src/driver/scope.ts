import type { Prisma } from '@prisma/client';
import type { DomainActor } from '../domain/audit.js';
import { DomainError } from '../domain/errors.js';
import { requireRole } from '../domain/scope.js';
import { driverTripInclude, type DriverTripRecord } from './dto.js';

export const DRIVER_VISIBLE_STATES = ['READY_FOR_DISPATCH', 'IN_TRANSIT', 'COMPLETED'] as const;
export function readyDriverSource(trip: DriverTripRecord): boolean {
  const run = trip.planningRun;
  if (!DRIVER_VISIBLE_STATES.some(status => status === trip.status) || !run?.strategyVersion || run.status !== 'RELEASED' || !run.releasedAt ||
    run.supersededAt || run.depotId !== trip.vehicle.depotId || !trip.stops.length) return false;
  if (trip.status === 'READY_FOR_DISPATCH' && trip.actualDeparture || trip.status !== 'READY_FOR_DISPATCH' && !trip.actualDeparture) return false;
  if (trip.exceptions.some(row => row.status !== 'RESOLVED' && (row.type === 'LOADING_SHORTFALL' || trip.status === 'READY_FOR_DISPATCH' && row.type === 'DAMAGED_GOODS'))) return false;
  return trip.stops.every(stop => {
    const load = stop.load;
    return stop.status !== 'CANCELLED' && stop.order.outlet.depotId === trip.vehicle.depotId &&
      stop.allocations.some(row => row.planningRunId === run.id && row.decision === 'ASSIGNED' && row.orderId === stop.orderId) &&
      load?.status === 'COMPLETE' && load.expectedUnits === stop.order.orderedUnits && load.loadedUnits != null &&
      load.loadedUnits > 0 && load.loadedUnits <= load.expectedUnits && !!load.recordedByUserId && !!load.recordedAt &&
      (load.loadedUnits === load.expectedUnits && load.reviewStatus === 'NOT_REQUIRED' ||
        load.reviewStatus === 'APPROVED' && !!load.reviewedAt && !!load.reviewedByUserId) &&
      !load.exceptions.some(row => row.status !== 'RESOLVED') &&
      (trip.status !== 'READY_FOR_DISPATCH' || !stop.order.exceptions.some(row => row.status !== 'RESOLVED' && ['LOADING_SHORTFALL', 'DAMAGED_GOODS'].includes(row.type))) &&
      (trip.status !== 'READY_FOR_DISPATCH' || stop.order.status === 'READY_FOR_DISPATCH');
  });
}
export async function scopedDriverTrip(tx: Prisma.TransactionClient, actor: DomainActor, tripId: string): Promise<DriverTripRecord> {
  requireRole(actor, ['DRIVER']);
  const trip = await tx.trip.findUnique({ where: { id: tripId }, include: driverTripInclude });
  if (!trip || trip.driverUserId !== actor.id) throw new DomainError('DOMAIN_FORBIDDEN', 'This trip is outside your Driver assignment.');
  if (!readyDriverSource(trip)) throw new DomainError('DOMAIN_FORBIDDEN', 'Driver access requires a released generated trip with completed approved loading.');
  return trip;
}
