import { driverArrivalSchema, driverDeliverySchema, driverOperationSchema, driverTripMutationSchema,
  type DriverAction, type DriverOperation, type DriverRouteList, type DriverSyncResult, type DriverTripDetail } from '@waypoint/shared';
import type { LocalDriverOperation } from './model';

export function createLocalOperation(userId: string, trip: DriverTripDetail, action: DriverAction, entityId: string, input: unknown,
  instant = new Date(), operationId: string = crypto.randomUUID()): LocalDriverOperation {
  const parsed = (action === 'ARRIVAL' ? driverArrivalSchema : action === 'COMPLETE_DELIVERY' ? driverDeliverySchema : driverTripMutationSchema).safeParse(input);
  if (!parsed.success) throw new Error('Check the delivery fields and quantities before saving.');
  const { expectedTripVersion, ...payload } = parsed.data as { expectedTripVersion: number } & Record<string, unknown>;
  if (trip.version !== expectedTripVersion) throw new Error('The route changed. Review the current stop before saving.');
  const stop = trip.stops.find(item => item.id === entityId);
  if (action === 'START_TRIP' ? entityId !== trip.id || !trip.canStart : action === 'FINISH_TRIP' ? entityId !== trip.id || !trip.canFinish :
    !stop || ('expectedStopVersion' in payload && (stop.version !== payload.expectedStopVersion || stop.order.version !== payload.expectedOrderVersion)) ||
    (action === 'ARRIVAL' ? !stop.canArrive : !stop.canComplete)) throw new Error('This action is not available for the cached assigned route.');
  if (action === 'COMPLETE_DELIVERY' && stop && 'deliveredUnits' in payload && typeof payload.deliveredUnits === 'number') {
    if (payload.deliveredUnits > stop.loadedUnits || (payload.outcome === 'DELIVERED' && payload.deliveredUnits !== stop.loadedUnits) ||
      (payload.outcome === 'PARTIALLY_DELIVERED' && (payload.deliveredUnits <= 0 || payload.deliveredUnits >= stop.loadedUnits))) throw new Error('Delivery quantity must match the selected outcome and actual loaded quantity.');
  }
  const timestamp = instant.toISOString();
  const operation = driverOperationSchema.parse({ operationId, entityType: action === 'START_TRIP' || action === 'FINISH_TRIP' ? 'TRIP' : 'TRIP_STOP',
    entityId, action, payload, baseVersion: expectedTripVersion, createdAt: timestamp, clientEventAt: timestamp,
    recordedOffline: typeof navigator !== 'undefined' && navigator.onLine === false });
  return { ...operation, userId, tripId: trip.id, syncStatus: 'PENDING', attempts: 0, baseTrip: structuredClone(trip) };
}
export function orderedOperations(operations: LocalDriverOperation[]): LocalDriverOperation[] {
  return [...operations].sort((a, b) => a.tripId.localeCompare(b.tripId) || a.baseVersion - b.baseVersion ||
    a.createdAt.localeCompare(b.createdAt) || actionRank(a.action) - actionRank(b.action) || a.operationId.localeCompare(b.operationId));
}
function actionRank(action: DriverAction) { return ['START_TRIP', 'ARRIVAL', 'COMPLETE_DELIVERY', 'FINISH_TRIP'].indexOf(action); }
export function serverOperation(operation: LocalDriverOperation): DriverOperation {
  const { operationId, entityType, entityId, action, payload, createdAt, clientEventAt, baseVersion, recordedOffline } = operation;
  return { operationId, entityType, entityId, action, payload, createdAt, clientEventAt, baseVersion, recordedOffline };
}
export function withSyncResult(operation: LocalDriverOperation, result: DriverSyncResult): LocalDriverOperation {
  if (operation.operationId !== result.operationId) throw new Error('Synchronization returned an unrelated operation. Local work was retained.');
  return { ...operation, syncStatus: result.status, reason: result.reason, serverVersion: result.serverVersion, serverTrip: result.trip,
    ...(result.status === 'SYNCED' ? { syncedAt: new Date().toISOString() } : {}) };
}
export async function syncOperations(operations: LocalDriverOperation[], send: (operation: DriverOperation) => Promise<DriverSyncResult>,
  save: (operation: LocalDriverOperation) => Promise<void>): Promise<LocalDriverOperation[]> {
  const changed: LocalDriverOperation[] = [], blocked = new Set(operations.filter(item => item.syncStatus === 'CONFLICT').map(item => item.tripId));
  for (const operation of orderedOperations(operations)) {
    if (operation.syncStatus === 'SYNCED' || operation.syncStatus === 'CONFLICT' || blocked.has(operation.tripId)) continue;
    const syncing = { ...operation, syncStatus: 'SYNCING' as const, attempts: operation.attempts + 1, reason: undefined };
    await save(syncing);
    try {
      const updated = withSyncResult(syncing, await send(serverOperation(syncing)));
      await save(updated);
      changed.push(updated);
      if (updated.syncStatus !== 'SYNCED') blocked.add(operation.tripId);
    } catch (error) {
      const failed = { ...syncing, syncStatus: 'FAILED' as const, reason: error instanceof Error ? error.message : 'Synchronization failed. Local work was retained.' };
      await save(failed);
      changed.push(failed);
      break;
    }
  }
  return changed;
}
function updatePermissions(trip: DriverTripDetail) {
  const next = [...trip.stops].sort((a, b) => a.sequence - b.sequence).find(stop => !stop.delivery);
  trip.nextStopId = next?.id ?? null;
  trip.completedStops = trip.stops.filter(stop => !!stop.delivery).length;
  trip.deliveredUnits = trip.stops.reduce((sum, stop) => sum + (stop.delivery?.deliveredUnits ?? 0), 0);
  trip.canStart = trip.status === 'READY_FOR_DISPATCH';
  trip.canFinish = trip.status === 'IN_TRANSIT' && trip.stops.length > 0 && !next;
  for (const stop of trip.stops) {
    stop.canArrive = trip.status === 'IN_TRANSIT' && stop.id === next?.id && stop.status === 'PLANNED' && !stop.delivery;
    stop.canComplete = trip.status === 'IN_TRANSIT' && stop.id === next?.id && stop.status === 'ARRIVED' && !stop.delivery;
  }
}
export function projectTrip(server: DriverTripDetail, operations: LocalDriverOperation[]): DriverTripDetail {
  const pending = orderedOperations(operations).filter(item => item.tripId === server.id && item.syncStatus !== 'SYNCED');
  const acknowledged = operations.filter(item => item.tripId === server.id && item.syncStatus === 'SYNCED' && item.serverTrip)
    .map(item => item.serverTrip!).sort((a, b) => b.version - a.version)[0];
  const confirmed = acknowledged && acknowledged.version > server.version ? acknowledged : server;
  const trip = structuredClone(pending.find(operation => operation.baseTrip)?.baseTrip ?? confirmed);
  for (const operation of pending) {
    if (operation.baseVersion < trip.version) continue;
    if (operation.baseVersion !== trip.version) break;
    const stop = trip.stops.find(item => item.id === operation.entityId), payload = operation.payload;
    if (operation.action === 'START_TRIP') {
      trip.status = 'IN_TRANSIT'; trip.actualDeparture = operation.clientEventAt;
      for (const item of trip.stops) { item.order.status = 'IN_TRANSIT'; item.order.version += 1; }
    } else if (operation.action === 'ARRIVAL' && stop) {
      stop.status = 'ARRIVED'; stop.actualArrival = operation.clientEventAt; stop.version += 1;
      stop.order.status = 'ARRIVED'; stop.order.version += 1;
    } else if (operation.action === 'COMPLETE_DELIVERY' && stop) {
      const parsed = driverDeliverySchema.safeParse({ expectedTripVersion: operation.baseVersion, ...payload });
      if (!parsed.success) break;
      const delivery = parsed.data;
      stop.status = delivery.outcome === 'FAILED' ? 'FAILED' : 'COMPLETED'; stop.version += 1; stop.completedAt = operation.clientEventAt;
      stop.order.status = delivery.outcome === 'DELIVERED' ? 'AWAITING_RECEIPT' : delivery.outcome === 'FAILED' ? 'DELIVERY_FAILED' : 'PARTIALLY_DELIVERED';
      stop.order.version += delivery.outcome === 'DELIVERED' ? 2 : 1;
      stop.delivery = { id: operation.operationId, outcome: delivery.outcome, expectedLoadedUnits: stop.loadedUnits, deliveredUnits: delivery.deliveredUnits,
        reasonCode: delivery.reasonCode ?? null, driverNote: delivery.driverNote ?? null, arrivedAt: stop.actualArrival ?? operation.clientEventAt,
        completedAt: operation.clientEventAt, proof: delivery.outcome === 'FAILED' ? null : { recipientName: delivery.recipientName ?? null,
          recipientRole: delivery.recipientRole ?? null, hasPhoto: false, hasSignature: false, binaryAvailable: false } };
    } else if (operation.action === 'FINISH_TRIP') { trip.status = 'COMPLETED'; trip.completedAt = operation.clientEventAt; }
    trip.version += 1;
    updatePermissions(trip);
  }
  if (pending.some(operation => operation.syncStatus === 'CONFLICT')) {
    trip.canStart = false; trip.canFinish = false;
    for (const stop of trip.stops) { stop.canArrive = false; stop.canComplete = false; }
  }
  return trip;
}
export function projectRoutes(routes: DriverRouteList, operations: LocalDriverOperation[]): DriverRouteList {
  return { ...routes, trips: routes.trips.map(trip => projectTrip(trip, operations)) };
}
