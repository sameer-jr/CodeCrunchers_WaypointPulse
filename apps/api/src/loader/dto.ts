import { Prisma } from '@prisma/client';
import { LOADING_SHORTFALL_REASONS, type LoaderLoadRecord, type LoaderLoadState, type LoaderShortfallReview, type LoaderStop, type LoaderTripDetail, type LoaderTripSummary } from '@waypoint/shared';
import { vehicleDto } from '../dispatcher/dto.js';

export const loaderTripInclude = { vehicle: { include: { depot: true } }, planningRun: true,
  exceptions: true, stops: { where: { active: true }, orderBy: { sequence: 'asc' }, include: { allocations: true,
    order: { include: { outlet: { include: { depot: true } }, exceptions: true } }, load: { include: { exceptions: true } } } }
} satisfies Prisma.TripInclude;
export type LoaderTripRecord = Prisma.TripGetPayload<{ include: typeof loaderTripInclude }>;
type StopRecord = LoaderTripRecord['stops'][number];
export function loadDto(load: StopRecord['load']): LoaderLoadRecord | null {
  if (!load) return null;
  const [code, ...rest] = (load.reason ?? '').split(': ');
  const reasonCode = LOADING_SHORTFALL_REASONS.find(reason => reason === code) ?? null;
  return { id: load.id, expectedUnits: load.expectedUnits, loadedUnits: load.loadedUnits, status: load.status, revision: load.revision,
    reviewStatus: load.reviewStatus, reasonCode, note: rest.length ? rest.join(': ') : null,
    recordedByUserId: load.recordedByUserId, recordedAt: load.recordedAt?.toISOString() ?? null,
    reviewedByUserId: load.reviewedByUserId, reviewedAt: load.reviewedAt?.toISOString() ?? null };
}
function loadState(stop: StopRecord): LoaderLoadState {
  const load = stop.load;
  if (!load || load.status === 'PENDING') return 'NOT_STARTED';
  if (load.reviewStatus === 'PENDING') return 'AWAITING_APPROVAL';
  if (load.reviewStatus === 'REJECTED') return 'CORRECTION_REQUIRED';
  if (load.reviewStatus === 'APPROVED') return 'APPROVED_REVISION';
  return load.status === 'COMPLETE' ? 'COMPLETE' : 'LOADING';
}
export function readinessBlockers(trip: LoaderTripRecord): string[] {
  const blockers: string[] = [];
  if (!trip.stops.length) blockers.push('This trip has no active stops.');
  for (const stop of trip.stops) {
    const load = stop.load;
    if (!load || load.loadedUnits == null || load.loadedUnits <= 0 || load.status !== 'COMPLETE') blockers.push(`Stop ${stop.sequence}: loading is incomplete.`);
    if (load && load.expectedUnits !== stop.order.orderedUnits) blockers.push(`Stop ${stop.sequence}: expected quantity changed.`);
    if (load && load.reviewStatus !== 'NOT_REQUIRED' && (load.reviewStatus !== 'APPROVED' || !load.reviewedAt || !load.reviewedByUserId)) blockers.push(`Stop ${stop.sequence}: manifest revision awaits Dispatcher approval.`);
    if (load?.loadedUnits != null && (load.loadedUnits > stop.order.orderedUnits || (load.loadedUnits < stop.order.orderedUnits && load.reviewStatus !== 'APPROVED'))) blockers.push(`Stop ${stop.sequence}: quantity revision is not approved.`);
    if (!['LOADING', 'LOADING_EXCEPTION', 'READY_FOR_DISPATCH'].includes(stop.order.status)) blockers.push(`Stop ${stop.sequence}: order is not in the loading lifecycle.`);
  }
  if (trip.exceptions.some(row => ['LOADING_SHORTFALL', 'DAMAGED_GOODS'].includes(row.type) && row.status !== 'RESOLVED') ||
    trip.stops.some(stop => stop.load?.exceptions.some(row => row.status !== 'RESOLVED') ||
      stop.order.exceptions.some(row => ['LOADING_SHORTFALL', 'DAMAGED_GOODS'].includes(row.type) && row.status !== 'RESOLVED'))) blockers.push('An unresolved loading exception blocks dispatch.');
  return [...new Set(blockers)];
}
export function loaderTripSummary(trip: LoaderTripRecord): LoaderTripSummary {
  const states = trip.stops.map(loadState), blockers = readinessBlockers(trip);
  const completedStops = states.filter(state => ['COMPLETE', 'APPROVED_REVISION'].includes(state)).length;
  const loadingState: LoaderLoadState = trip.status === 'READY_FOR_DISPATCH' ? 'READY_FOR_DISPATCH' : states.includes('AWAITING_APPROVAL') ? 'AWAITING_APPROVAL' :
    states.includes('CORRECTION_REQUIRED') ? 'CORRECTION_REQUIRED' : completedStops === trip.stops.length && completedStops > 0 ? 'COMPLETE' : states.every(state => state === 'NOT_STARTED') ? 'NOT_STARTED' : 'LOADING';
  return { id: trip.id, tripRef: trip.tripRef, version: trip.version, serviceDate: trip.serviceDate.toISOString().slice(0, 10), status: trip.status,
    tripNumber: trip.tripNumber, planningRunId: trip.planningRunId!, vehicle: vehicleDto(trip.vehicle), plannedDeparture: trip.plannedDeparture?.toISOString() ?? null,
    stopCount: trip.stops.length, orderedUnits: trip.stops.reduce((sum, stop) => sum + stop.order.orderedUnits, 0),
    expectedUnits: trip.stops.reduce((sum, stop) => sum + stop.order.orderedUnits, 0), loadedUnits: trip.stops.reduce((sum, stop) => sum + (stop.load?.loadedUnits ?? 0), 0),
    orderedWeightKg: trip.stops.reduce((sum, stop) => sum.add(stop.order.orderedWeightKg), new Prisma.Decimal(0)).toString(),
    orderedVolumeM3: trip.stops.reduce((sum, stop) => sum.add(stop.order.orderedVolumeM3), new Prisma.Decimal(0)).toString(),
    temperatureRequirements: [...new Set(trip.stops.map(stop => stop.order.temperatureRequirement))].sort(), completedStops,
    pendingStops: trip.stops.length - completedStops, shortfallStops: trip.stops.filter(stop => stop.load?.loadedUnits != null && stop.load.loadedUnits < stop.order.orderedUnits).length,
    loadingState, canMarkReady: trip.status === 'LOADING' && !blockers.length, readinessBlockers: blockers };
}
export function loaderTripDetail(trip: LoaderTripRecord): LoaderTripDetail {
  const canLoad = ['RELEASED', 'LOADING'].includes(trip.status);
  const stops: LoaderStop[] = trip.stops.map(stop => {
    const outlet = stop.order.outlet;
    return { id: stop.id, sequence: stop.sequence, updatedAt: stop.updatedAt.toISOString(), status: stop.status, plannedArrival: stop.plannedArrival?.toISOString() ?? null,
      order: { id: stop.order.id, orderRef: stop.order.orderRef, version: stop.order.version, status: stop.order.status, orderedUnits: stop.order.orderedUnits,
        orderedWeightKg: stop.order.orderedWeightKg.toString(), orderedVolumeM3: stop.order.orderedVolumeM3.toString(), temperatureRequirement: stop.order.temperatureRequirement,
        outlet: { id: outlet.id, outletRef: outlet.outletRef, brand: outlet.brand, district: outlet.district, depotName: outlet.depot.name, dockType: outlet.dockType,
          accessConstraint: outlet.accessConstraint, source: outlet.source, deliveryWindowOpen: outlet.deliveryWindowOpen, deliveryWindowClose: outlet.deliveryWindowClose,
          mallWindowOpen: outlet.mallWindowOpen, mallWindowClose: outlet.mallWindowClose } }, load: loadDto(stop.load),
      loadingState: trip.status === 'READY_FOR_DISPATCH' ? 'READY_FOR_DISPATCH' : loadState(stop),
      canRecord: canLoad && ['RELEASED_TO_LOADING', 'LOADING', 'LOADING_EXCEPTION'].includes(stop.order.status) &&
        (!stop.load || stop.load.status === 'PENDING' || stop.load.reviewStatus === 'REJECTED'),
      exceptions: (stop.load?.exceptions ?? []).map(row => ({ id: row.id, type: row.type, status: row.status, message: row.message,
        createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null })) };
  });
  return { ...loaderTripSummary(trip), stops };
}
export function shortfallReviewDto(trip: LoaderTripRecord, stop: StopRecord, exceptionId: string): LoaderShortfallReview | null {
  const load = loadDto(stop.load);
  if (!load) return null;
  const exception = stop.load!.exceptions.find(row => row.id === exceptionId);
  return { tripId: trip.id, tripVersion: trip.version, tripStopId: stop.id, stopSequence: stop.sequence, orderId: stop.order.id,
    orderVersion: stop.order.version, orderRef: stop.order.orderRef, orderedUnits: stop.order.orderedUnits, expectedUnits: load.expectedUnits,
    loadedUnits: load.loadedUnits, loadRecordId: load.id, loadRevision: load.revision, reviewStatus: load.reviewStatus, reasonCode: load.reasonCode, note: load.note,
    recordedAt: load.recordedAt, reviewedAt: load.reviewedAt, reviewedByUserId: load.reviewedByUserId,
    canReview: !!exception && exception.status !== 'RESOLVED' && load.reviewStatus === 'PENDING' && trip.status === 'LOADING' && stop.order.status === 'LOADING_EXCEPTION' };
}
