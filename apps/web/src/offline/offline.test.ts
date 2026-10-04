import { describe, expect, it } from 'vitest';
import type { DriverTripDetail } from '@waypoint/shared';
import { createLocalOperation, orderedOperations, projectTrip, serverOperation, syncOperations, withSyncResult } from './engine';
import type { LocalDriverOperation } from './model';

const userId = '10000000-0000-4000-8000-000000000001', tripId = '20000000-0000-4000-8000-000000000001';
const stopId = '30000000-0000-4000-8000-000000000001', orderId = '40000000-0000-4000-8000-000000000001';
function route(): DriverTripDetail {
  return { id: tripId, tripRef: 'SYN-OFFLINE-TRIP', tripNumber: 1, version: 7, serviceDate: '2040-03-05', status: 'IN_TRANSIT',
    vehicle: { id: '50000000-0000-4000-8000-000000000001', vehicleRef: 'SYN-REEFER', depot: { id: '60000000-0000-4000-8000-000000000001', name: 'Synthetic depot' },
      type: 'TRUCK', temperatureCapability: 'REEFER', active: true, weightCapacityKg: '1000', volumeCapacityM3: '10', source: 'SYNTHETIC', operationalAvailability: 'UNKNOWN' },
    plannedDeparture: null, actualDeparture: '2040-03-05T00:00:00.000Z', completedAt: null, orderedUnits: 192, loadedUnits: 188,
    deliveredUnits: 0, stopCount: 1, completedStops: 0, nextStopId: stopId, canStart: false, canFinish: false,
    stops: [{ id: stopId, sequence: 1, version: 2, status: 'PLANNED', plannedArrival: null, actualArrival: null, completedAt: null,
      order: { id: orderId, orderRef: 'SYN-192', version: 9, status: 'IN_TRANSIT', orderedUnits: 192, temperatureRequirement: 'AMBIENT',
        outlet: { id: '70000000-0000-4000-8000-000000000001', outletRef: 'SYN-FRESH', brand: 'FRESH', district: 'Synthetic district', depotName: 'Synthetic depot',
          dockType: 'STREET', accessConstraint: 'NORMAL', source: 'SYNTHETIC', deliveryWindowOpen: 300, deliveryWindowClose: 480, mallWindowOpen: null, mallWindowClose: null } },
      loadedUnits: 188, delivery: null, canArrive: true, canComplete: false, exceptions: [] }] };
}
function arrival(): LocalDriverOperation {
  return createLocalOperation(userId, route(), 'ARRIVAL', stopId, { expectedTripVersion: 7, expectedStopVersion: 2, expectedOrderVersion: 9 },
    new Date('2026-10-04T00:00:00.000Z'), '80000000-0000-4000-8000-000000000001');
}
function completion(first = arrival()): LocalDriverOperation {
  const arrived = projectTrip(route(), [first]);
  return createLocalOperation(userId, arrived, 'COMPLETE_DELIVERY', stopId, { expectedTripVersion: 8, expectedStopVersion: 3, expectedOrderVersion: 10,
    outcome: 'DELIVERED', deliveredUnits: 188, recipientName: 'Synthetic recipient', recipientRole: 'Store Manager', driverNote: 'Synthetic offline delivery' },
    new Date('2026-10-04T00:01:00.000Z'), '80000000-0000-4000-8000-000000000002');
}
describe('Driver offline domain', () => {
  it('requires a real UUID and retains safe operation facts', () => {
    expect(() => createLocalOperation(userId, route(), 'ARRIVAL', stopId, { expectedTripVersion: 7, expectedStopVersion: 2, expectedOrderVersion: 9 }, new Date(), 'not-a-uuid')).toThrow();
    expect(arrival()).toMatchObject({ userId, tripId, entityType: 'TRIP_STOP', action: 'ARRIVAL', baseVersion: 7, syncStatus: 'PENDING', attempts: 0 });
    expect(arrival().createdAt).toBe(arrival().clientEventAt);
  });
  it('does not send local identity, queue status or cached route to the server', () => {
    const outbound = serverOperation(arrival());
    expect(Object.keys(outbound).sort()).toEqual(['action', 'baseVersion', 'clientEventAt', 'createdAt', 'entityId', 'entityType', 'operationId', 'payload', 'recordedOffline']);
    expect(outbound.payload).toEqual({ expectedStopVersion: 2, expectedOrderVersion: 9 });
  });
  it('rejects injected identity and foreign stop before device save', () => {
    expect(() => createLocalOperation(userId, route(), 'ARRIVAL', stopId, { expectedTripVersion: 7, expectedStopVersion: 2, expectedOrderVersion: 9, actorUserId: userId })).toThrow();
    expect(() => createLocalOperation(userId, route(), 'ARRIVAL', orderId, { expectedTripVersion: 7, expectedStopVersion: 2, expectedOrderVersion: 9 })).toThrow(/cached assigned/);
  });
  it('rejects stale trip, stop and order versions', () => {
    for (const field of ['expectedTripVersion', 'expectedStopVersion', 'expectedOrderVersion']) {
      expect(() => createLocalOperation(userId, route(), 'ARRIVAL', stopId, { expectedTripVersion: 7, expectedStopVersion: 2, expectedOrderVersion: 9, [field]: 1 })).toThrow();
    }
  });
  it('projects arrival then completion while preserving original server facts and ordered/loaded quantities', () => {
    const server = route(), first = arrival(), second = completion(first), local = projectTrip(server, [second, first]);
    expect(server.stops[0].actualArrival).toBeNull(); expect(server.stops[0].delivery).toBeNull(); expect(server.version).toBe(7);
    expect(local.stops[0]).toMatchObject({ status: 'COMPLETED', version: 4, loadedUnits: 188, order: { orderedUnits: 192, version: 12, status: 'AWAITING_RECEIPT' }, delivery: { deliveredUnits: 188, expectedLoadedUnits: 188 } });
    expect(local.version).toBe(9); expect(local.canFinish).toBe(true); expect(local.nextStopId).toBeNull();
    expect(local.stops[0].delivery?.proof).toMatchObject({ recipientName: 'Synthetic recipient', hasPhoto: false, hasSignature: false });
  });
  it('retains a local captured snapshot when server version diverges without overwriting the server object', () => {
    const first = arrival(), changed = route(); changed.version = 19; changed.stops[0].order.version = 20;
    const local = projectTrip(changed, [first, completion(first)]);
    expect(local.version).toBe(9); expect(local.stops[0].delivery?.deliveredUnits).toBe(188);
    expect(changed.version).toBe(19); expect(changed.stops[0].delivery).toBeNull();
  });
  it('uses acknowledged server result when the query is older than a successful sync', () => {
    const first = arrival(), acknowledged = projectTrip(route(), [first]);
    const synced = { ...first, syncStatus: 'SYNCED' as const, serverTrip: acknowledged }, second = completion(first); delete second.baseTrip;
    expect(projectTrip(route(), [synced, second]).stops[0].delivery?.deliveredUnits).toBe(188);
  });
  it('requires arrival before completion and enforces the actual loaded manifest', () => {
    expect(() => createLocalOperation(userId, route(), 'COMPLETE_DELIVERY', stopId, { expectedTripVersion: 7, expectedStopVersion: 2, expectedOrderVersion: 9, outcome: 'DELIVERED', deliveredUnits: 188, recipientName: 'Synthetic recipient', recipientRole: 'Manager' })).toThrow(/cached assigned/);
    const arrived = projectTrip(route(), [arrival()]);
    for (const deliveredUnits of [192, 0, 187]) expect(() => createLocalOperation(userId, arrived, 'COMPLETE_DELIVERY', stopId, { expectedTripVersion: 8, expectedStopVersion: 3, expectedOrderVersion: 10, outcome: 'DELIVERED', deliveredUnits, recipientName: 'Synthetic recipient', recipientRole: 'Manager' })).toThrow();
  });
  it('requires controlled reasons and useful context for partial or failed delivery', () => {
    const arrived = projectTrip(route(), [arrival()]), versions = { expectedTripVersion: 8, expectedStopVersion: 3, expectedOrderVersion: 10 };
    expect(() => createLocalOperation(userId, arrived, 'COMPLETE_DELIVERY', stopId, { ...versions, outcome: 'PARTIALLY_DELIVERED', deliveredUnits: 180, recipientName: 'Synthetic recipient' })).toThrow();
    expect(() => createLocalOperation(userId, arrived, 'COMPLETE_DELIVERY', stopId, { ...versions, outcome: 'FAILED', deliveredUnits: 0, reasonCode: 'OTHER', driverNote: 'x' })).toThrow();
    expect(() => createLocalOperation(userId, arrived, 'COMPLETE_DELIVERY', stopId, { ...versions, outcome: 'FAILED', deliveredUnits: 0, reasonCode: 'OUTLET_CLOSED' })).not.toThrow();
  });
  it('orders dependent arrival before completion even when input queue is reversed', () => {
    const first = arrival(), second = completion(first); second.createdAt = first.createdAt;
    expect(orderedOperations([second, first]).map(operation => operation.action)).toEqual(['ARRIVAL', 'COMPLETE_DELIVERY']);
  });
  it('sends sequentially and persists PENDING to SYNCING to SYNCED', async () => {
    const first = arrival(), second = completion(first), sent: string[] = [], states: string[] = [];
    const results = await syncOperations([second, first], async operation => { sent.push(operation.action); return { operationId: operation.operationId, status: 'SYNCED' }; }, async operation => { states.push(operation.syncStatus); });
    expect(sent).toEqual(['ARRIVAL', 'COMPLETE_DELIVERY']); expect(states).toEqual(['SYNCING', 'SYNCED', 'SYNCING', 'SYNCED']);
    expect(results.every(operation => operation.syncStatus === 'SYNCED')).toBe(true); expect(first.syncStatus).toBe('PENDING');
  });
  it('retains structured conflict and stops dependent actions without deleting work', async () => {
    const first = arrival(), second = completion(first), sent: string[] = [], saved: LocalDriverOperation[] = [];
    const changed = await syncOperations([second, first], async operation => { sent.push(operation.action); return { operationId: operation.operationId, status: 'CONFLICT', reason: 'Trip changed', serverVersion: 20 }; }, async operation => { saved.push(operation); });
    expect(sent).toEqual(['ARRIVAL']); expect(changed[0]).toMatchObject({ syncStatus: 'CONFLICT', reason: 'Trip changed', serverVersion: 20 });
    expect(saved.at(-1)?.payload).toEqual(first.payload); expect(second.syncStatus).toBe('PENDING');
  });
  it('does not automatically retry conflicted work or send its dependents', async () => {
    const first = { ...arrival(), syncStatus: 'CONFLICT' as const }, second = completion(); let count = 0;
    expect(await syncOperations([first, second], async operation => { count += 1; return { operationId: operation.operationId, status: 'SYNCED' }; }, async () => undefined)).toEqual([]);
    expect(count).toBe(0); expect(first.syncStatus).toBe('CONFLICT'); expect(second.syncStatus).toBe('PENDING');
    const local = projectTrip(route(), [first, second]);
    expect(local.canFinish).toBe(false); expect(local.stops.every(stop => !stop.canArrive && !stop.canComplete)).toBe(true);
    expect(local.stops[0].delivery?.deliveredUnits).toBe(188);
  });
  it('retains failed network work and retries the identical operation UUID', async () => {
    const first = arrival(); const failure = await syncOperations([first], async () => { throw new Error('Connection unavailable'); }, async () => undefined);
    expect(failure[0]).toMatchObject({ syncStatus: 'FAILED', reason: 'Connection unavailable', attempts: 1 });
    let sentId = ''; const success = await syncOperations(failure, async operation => { sentId = operation.operationId; return { operationId: sentId, status: 'SYNCED' }; }, async () => undefined);
    expect(sentId).toBe(first.operationId); expect(success[0]).toMatchObject({ syncStatus: 'SYNCED', attempts: 2 });
  });
  it('recovers an interrupted SYNCING operation with its original idempotency key', async () => {
    const first = { ...arrival(), syncStatus: 'SYNCING' as const, attempts: 1 };
    const changed = await syncOperations([first], async operation => ({ operationId: operation.operationId, status: 'SYNCED' }), async () => undefined);
    expect(changed[0]).toMatchObject({ operationId: first.operationId, syncStatus: 'SYNCED', attempts: 2 });
  });
  it('never resends already synchronized actions or accepts an unrelated acknowledgement', async () => {
    const first = { ...arrival(), syncStatus: 'SYNCED' as const }; let sent = false;
    await syncOperations([first], async operation => { sent = true; return { operationId: operation.operationId, status: 'SYNCED' }; }, async () => undefined);
    expect(sent).toBe(false);
    expect(() => withSyncResult(arrival(), { operationId: orderId, status: 'SYNCED' })).toThrow(/unrelated/);
  });
});
