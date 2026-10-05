import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PROOF_LIMITS, type DriverOperation, type DriverStop, type DriverTripDetail, type LoaderTripDetail, type PlanningRunDetail, type ProofAttachmentInput } from '@waypoint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { installLoaderFixture, LOADER_SYNTHETIC_DATE, type LoaderFixture } from '../loader/testing/synthetic.js';

if (!process.env.DRIVER_TEST_DATABASE_URL) throw new Error('Run npm run test; Driver tests require an isolated PostgreSQL database.');
const db = new PrismaClient({ datasources: { db: { url: process.env.DRIVER_TEST_DATABASE_URL } } });
const config = readConfig({ ...process.env, DATABASE_URL: process.env.DRIVER_TEST_DATABASE_URL, NODE_ENV: 'test', STORE_ALLOW_SYNTHETIC: 'false', PLANNING_ALLOW_SYNTHETIC: 'false' });
const app = createApp(db, config, { planning: { allowSyntheticReferences: true }, store: { allowSyntheticReferences: true }, driver: { demoDate: LOADER_SYNTHETIC_DATE } });
const driver = request.agent(app), dispatcher = request.agent(app), loader = request.agent(app), store = request.agent(app), foreignDriver = request.agent(app);
let base: LoaderFixture, run: PlanningRunDetail, trip: DriverTripDetail, offline: DriverTripDetail;
let assignmentTripId: string;
const password = process.env.SEED_DEMO_PASSWORD;
async function generate(fixture: LoaderFixture) {
  const response = await dispatcher.post('/api/dispatcher/plans').send({ serviceDate: fixture.serviceDate, depotId: fixture.depot.id });
  expect(response.status, JSON.stringify(response.body)).toBe(201); return response.body as PlanningRunDetail;
}
async function validate(plan: PlanningRunDetail) {
  const response = await dispatcher.post(`/api/dispatcher/plans/${plan.id}/validate`).send({ expectedVersion: plan.version });
  expect(response.status, JSON.stringify(response.body)).toBe(200); return response.body as PlanningRunDetail;
}
async function release(plan: PlanningRunDetail) {
  const response = await dispatcher.post(`/api/dispatcher/plans/${plan.id}/release`).send({ expectedVersion: plan.version });
  expect(response.status, JSON.stringify(response.body)).toBe(200); return response.body as PlanningRunDetail;
}
async function assign(tripId: string, driverId = base.driver.id) {
  const current = await db.trip.findUniqueOrThrow({ where: { id: tripId } });
  const response = await dispatcher.post(`/api/dispatcher/trips/${tripId}/driver`).send({ expectedTripVersion: current.version, driverUserId: driverId });
  expect(response.status, JSON.stringify(response.body)).toBe(200); return response.body;
}
async function driverDetail(tripId: string) {
  const response = await driver.get(`/api/driver/trips/${tripId}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200); return response.body as DriverTripDetail;
}
async function loadReady(tripId: string, shortfallOrderId?: string) {
  let current = (await loader.get(`/api/loader/trips/${tripId}`)).body as LoaderTripDetail;
  for (const initial of current.stops) {
    const stop = current.stops.find(row => row.id === initial.id)!;
    const shortfall = stop.order.id === shortfallOrderId;
    const response = await loader.post(`/api/loader/stops/${stop.id}/load`).send({ expectedTripVersion: current.version,
      expectedOrderVersion: stop.order.version, expectedStopUpdatedAt: stop.updatedAt, expectedLoadRevision: stop.load?.revision ?? 0,
      loadedUnits: stop.order.orderedUnits - (shortfall ? 4 : 0), ...(shortfall ? { reasonCode: 'STOCK_UNAVAILABLE', note: 'Synthetic four-unit shortage for Driver continuity.' } : {}) });
    expect(response.status, JSON.stringify(response.body)).toBe(200); current = response.body;
  }
  if (shortfallOrderId) {
    const stop = current.stops.find(row => row.order.id === shortfallOrderId)!;
    const blocked = await loader.post(`/api/loader/trips/${tripId}/ready`).send({ expectedTripVersion: current.version });
    expect(blocked.status).toBe(409);
    expect((await driver.get(`/api/driver/trips/${tripId}`)).status).toBe(403);
    expect((await driver.post(`/api/driver/trips/${tripId}/start`).send({ expectedTripVersion: current.version })).status).toBe(403);
    const exception = stop.exceptions.find(row => row.status !== 'RESOLVED')!;
    const reviewed = await dispatcher.post(`/api/dispatcher/exceptions/${exception.id}/review-load`).send({ expectedTripVersion: current.version,
      expectedOrderVersion: stop.order.version, expectedLoadRevision: stop.load!.revision, decision: 'APPROVE' });
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200); current = reviewed.body;
  }
  const ready = await loader.post(`/api/loader/trips/${tripId}/ready`).send({ expectedTripVersion: current.version });
  expect(ready.status, JSON.stringify(ready.body)).toBe(200); return driverDetail(tripId);
}
async function readyFixture(key: string, shortfall = false) {
  const fixture = await installLoaderFixture(db, { key, assignStore: false });
  const released = await release(await validate(await generate(fixture)));
  const assigned = released.decisions.find(row => row.order.id === fixture.shortfallOrder.id)!;
  await assign(assigned.tripId!);
  return { fixture, trip: await loadReady(assigned.tripId!, shortfall ? fixture.shortfallOrder.id : undefined) };
}
function versions(route: DriverTripDetail, stop: DriverStop) {
  return { expectedTripVersion: route.version, expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version };
}
function deliveryBody(route: DriverTripDetail, stop: DriverStop, changes: Record<string, unknown> = {}) {
  return { ...versions(route, stop), outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits,
    recipientName: 'Synthetic Recipient', recipientRole: 'Store supervisor', driverNote: 'Delivery counted with recipient.', ...changes };
}
async function counts() { return { delivery: await db.deliveryRecord.count(), audit: await db.auditEvent.count(), receipt: await db.receipt.count() }; }
function operation(action: DriverOperation['action'], route: DriverTripDetail, stop?: DriverStop, payload: Record<string, unknown> = {}): DriverOperation {
  const now = new Date().toISOString();
  return { operationId: randomUUID(), entityType: stop ? 'TRIP_STOP' : 'TRIP', entityId: stop?.id ?? route.id, action,
    payload, createdAt: now, clientEventAt: now, baseVersion: route.version, recordedOffline: true };
}
async function sync(operations: DriverOperation[]) {
  const response = await driver.post('/api/driver/sync').send({ operations });
  expect(response.status, JSON.stringify(response.body)).toBe(200); return response.body;
}

beforeAll(async () => {
  base = await installLoaderFixture(db, { key: 'DRIVER-BASE' });
  for (const [agent, email] of [[driver, 'driver@waypoint.local'], [dispatcher, 'dispatcher@waypoint.local'], [loader, 'loader@waypoint.local'], [store, 'store@waypoint.local']] as const) {
    expect((await agent.post('/api/auth/login').send({ email, password })).status).toBe(200);
  }
  await db.user.create({ data: { email: 'foreign-driver@waypoint.local', displayName: 'Synthetic Foreign Driver', role: 'DRIVER', passwordHash: base.driver.passwordHash } });
  expect((await foreignDriver.post('/api/auth/login').send({ email: 'foreign-driver@waypoint.local', password })).status).toBe(200);
}, 30000);
afterAll(async () => { await db.$disconnect(); });

describe('Assigned generated Driver route and versioned delivery', () => {
  it('requires authenticated Driver role on every read, execution and sync endpoint', async () => {
    expect((await request(app).get('/api/driver/routes')).status).toBe(401);
    for (const agent of [dispatcher, loader, store]) {
      expect((await agent.get('/api/driver/routes')).status).toBe(403);
      expect((await agent.post('/api/driver/sync').send({ operations: [] })).status).toBe(403);
      expect((await agent.post(`/api/driver/trips/${randomUUID()}/start`).send({ expectedTripVersion: 1 })).status).toBe(403);
    }
  });
  it('validates resource IDs, dates and rejects empty/missing operation UUIDs', async () => {
    expect((await driver.get('/api/driver/trips/invalid')).status).toBe(400);
    expect((await driver.get('/api/driver/routes?date=2040-02-30')).status).toBe(400);
    expect((await driver.post('/api/driver/sync').send({ operations: [] })).status).toBe(400);
    expect((await driver.post('/api/driver/sync').send({ operations: [{ operationId: 'invalid' }] })).status).toBe(400);
  });
  it('hides draft and validated-unreleased generated trips and prevents their assignment', async () => {
    run = await generate(base); assignmentTripId = run.decisions.find(row => row.order.id === base.shortfallOrder.id)!.tripId!;
    expect((await driver.get(`/api/driver/trips/${assignmentTripId}`)).status).toBe(403);
    const current = await db.trip.findUniqueOrThrow({ where: { id: assignmentTripId } });
    expect((await dispatcher.post(`/api/dispatcher/trips/${current.id}/driver`).send({ driverUserId: base.driver.id, expectedTripVersion: current.version })).status).toBe(409);
    run = await validate(run);
    expect((await driver.get(`/api/driver/trips/${assignmentTripId}`)).status).toBe(403);
    expect((await driver.get('/api/driver/routes')).body.trips).toEqual([]);
  }, 30000);
  it('assigns an active Driver through scoped Dispatcher architecture with one assignment audit', async () => {
    run = await release(run);
    const choices = await dispatcher.get('/api/dispatcher/drivers');
    expect(choices.status).toBe(200); expect(choices.body.drivers.some((row: { id: string }) => row.id === base.driver.id)).toBe(true);
    const assigned = await assign(assignmentTripId);
    expect(assigned.driverUserId).toBe(base.driver.id);
    const before = await counts(); await assign(assignmentTripId); expect(await counts()).toEqual(before);
    expect(await db.auditEvent.count({ where: { entityId: assignmentTripId, eventType: 'TRIP_DRIVER_ASSIGNED' } })).toBe(1);
  });
  it('does not expose a released assigned trip with incomplete loading, even through generic domain URLs', async () => {
    expect((await driver.get(`/api/driver/trips/${assignmentTripId}`)).status).toBe(403);
    expect((await driver.get(`/api/domain/trips/${assignmentTripId}`)).status).toBe(403);
    expect((await driver.get(`/api/domain/orders/${base.shortfallOrder.id}`)).status).toBe(403);
    expect((await driver.get('/api/driver/routes')).body.trips).toEqual([]);
    expect((await driver.post(`/api/driver/trips/${assignmentTripId}/start`).send({ expectedTripVersion: 1 })).status).toBe(403);
  });
  it('rejects wrong-role assignment, stale assignment versions, foreign scope and injected actor fields', async () => {
    const current = await db.trip.findUniqueOrThrow({ where: { id: assignmentTripId } }), body = { driverUserId: base.driver.id, expectedTripVersion: current.version };
    expect((await loader.post(`/api/dispatcher/trips/${current.id}/driver`).send(body)).status).toBe(403);
    expect((await dispatcher.post(`/api/dispatcher/trips/${current.id}/driver`).send({ ...body, expectedTripVersion: current.version - 1 })).status).toBe(409);
    expect((await dispatcher.post(`/api/dispatcher/trips/${current.id}/driver`).send({ ...body, driverUserId: base.store.id })).status).toBe(400);
    expect((await dispatcher.post(`/api/dispatcher/trips/${current.id}/driver`).send({ ...body, actorUserId: base.driver.id })).status).toBe(400);
    const depot = await db.userDepot.findUniqueOrThrow({ where: { userId_depotId: { userId: base.dispatcher.id, depotId: base.depot.id } } });
    await db.userDepot.delete({ where: { userId_depotId: { userId: base.dispatcher.id, depotId: base.depot.id } } });
    try { expect((await dispatcher.post(`/api/dispatcher/trips/${current.id}/driver`).send(body)).status).toBe(403); }
    finally { await db.userDepot.create({ data: depot }); }
  });
  it('carries approved Loader192→188 into the real ready Driver manifest and keeps stops in planner sequence', async () => {
    trip = await loadReady(assignmentTripId, base.shortfallOrder.id);
    expect(trip.status).toBe('READY_FOR_DISPATCH');
    const shortfall = trip.stops.find(stop => stop.order.id === base.shortfallOrder.id)!;
    expect(shortfall.order.orderedUnits).toBe(192); expect(shortfall.loadedUnits).toBe(188); expect(shortfall.delivery).toBeNull();
    expect(trip.stops.map(stop => stop.sequence)).toEqual(trip.stops.map((_stop, index) => index + 1));
    const response = await driver.get('/api/driver/routes'); expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.trips.map((row: { id: string }) => row.id)).toContain(trip.id);
    expect((await driver.get(`/api/domain/trips/${trip.id}`)).status).toBe(200);
  }, 30000);
  it('denies foreign Driver trip and stop IDs without writes', async () => {
    const before = await counts();
    expect((await foreignDriver.get(`/api/driver/trips/${trip.id}`)).status).toBe(403);
    expect((await foreignDriver.get('/api/driver/routes')).body.trips).toEqual([]);
    expect((await foreignDriver.post(`/api/driver/trips/${trip.id}/start`).send({ expectedTripVersion: trip.version })).status).toBe(403);
    expect((await foreignDriver.post(`/api/driver/stops/${trip.stops[0].id}/arrival`).send(versions(trip, trip.stops[0]))).status).toBe(403);
    expect(await counts()).toEqual(before);
  });
  it('starts once with actual departure, optimistic version, immutable quantities and central lifecycle/audit', async () => {
    const units = trip.stops.map(stop => [stop.order.orderedUnits, stop.loadedUnits]);
    const response = await driver.post(`/api/driver/trips/${trip.id}/start`).send({ expectedTripVersion: trip.version });
    expect(response.status, JSON.stringify(response.body)).toBe(200); trip = response.body;
    expect(trip.status).toBe('IN_TRANSIT'); expect(trip.actualDeparture).toBeTruthy();
    expect(trip.stops.every(stop => stop.order.status === 'IN_TRANSIT')).toBe(true);
    expect(trip.stops.map(stop => [stop.order.orderedUnits, stop.loadedUnits])).toEqual(units);
    expect(await db.auditEvent.count({ where: { entityId: trip.id, eventType: 'TRIP_STARTED' } })).toBe(1);
  });
  it('rejects duplicate departure, post-departure reassignment and premature finish without duplicate audit', async () => {
    const before = await counts();
    expect((await driver.post(`/api/driver/trips/${trip.id}/start`).send({ expectedTripVersion: trip.version })).status).toBe(409);
    expect((await dispatcher.post(`/api/dispatcher/trips/${trip.id}/driver`).send({ expectedTripVersion: trip.version, driverUserId: base.driver.id })).status).toBe(409);
    expect((await driver.post(`/api/driver/trips/${trip.id}/finish`).send({ expectedTripVersion: trip.version })).status).toBe(409);
    expect(await counts()).toEqual(before);
  });
  it('enforces current-stop sequence, arrival and optimistic stop/order versions', async () => {
    const current = trip.stops[0], later = trip.stops[1], before = await counts();
    expect((await driver.post(`/api/driver/stops/${later.id}/arrival`).send(versions(trip, later))).status).toBe(409);
    expect((await driver.post(`/api/driver/stops/${current.id}/complete`).send(deliveryBody(trip, current))).status).toBe(409);
    expect((await driver.post(`/api/driver/stops/${current.id}/arrival`).send({ ...versions(trip, current), expectedStopVersion: current.version + 1 })).status).toBe(409);
    expect((await driver.post(`/api/driver/stops/${current.id}/arrival`).send({ ...versions(trip, current), expectedOrderVersion: current.order.version + 1 })).status).toBe(409);
    expect(await counts()).toEqual(before);
    const response = await driver.post(`/api/driver/stops/${current.id}/arrival`).send(versions(trip, current));
    expect(response.status, JSON.stringify(response.body)).toBe(200); trip = response.body;
    expect(trip.stops[0].actualArrival).toBeTruthy(); expect(trip.stops[0].order.status).toBe('ARRIVED');
    expect(await db.auditEvent.count({ where: { entityId: trip.id, eventType: 'STOP_ARRIVED' } })).toBe(1);
  });
  it('validates delivered quantities, outcomes, recipient name/role and controlled reasons without writes', async () => {
    const current = trip.stops[0], before = await counts();
    for (const changes of [{ deliveredUnits: current.loadedUnits + 1 }, { deliveredUnits: current.loadedUnits - 1 },
      { recipientName: '' }, { recipientRole: '' }, { outcome: 'PARTIALLY_DELIVERED', deliveredUnits: 1 },
      { outcome: 'FAILED', deliveredUnits: 0 }, { outcome: 'PARTIALLY_DELIVERED', deliveredUnits: 1, reasonCode: 'OTHER', driverNote: 'x' },
      { outcome: 'FAILED', deliveredUnits: 1, reasonCode: 'OUTLET_CLOSED' }, { actorUserId: base.store.id }]) {
      expect((await driver.post(`/api/driver/stops/${current.id}/complete`).send(deliveryBody(trip, current, changes))).status).toBe(400);
    }
    expect(await counts()).toEqual(before);
  });
  it('persists full188 delivery with proof,192ordered and188loaded, awaiting receipt with no automatic Store receipt', async () => {
    const current = trip.stops[0]; expect(current.order.orderedUnits).toBe(192);
    const response = await driver.post(`/api/driver/stops/${current.id}/complete`).send(deliveryBody(trip, current));
    expect(response.status, JSON.stringify(response.body)).toBe(200); trip = response.body;
    const stop = trip.stops[0]; expect([stop.order.orderedUnits, stop.loadedUnits, stop.delivery?.deliveredUnits]).toEqual([192, 188, 188]);
    expect(stop.order.status).toBe('AWAITING_RECEIPT'); expect(stop.delivery?.proof?.recipientName).toBe('Synthetic Recipient');
    expect(stop.delivery?.proof?.recipientRole).toBe('Store supervisor'); expect(stop.delivery?.proof?.binaryAvailable).toBe(false);
    expect(await db.receipt.count()).toBe(0); expect(await db.deliveryRecord.count({ where: { tripStopId: stop.id } })).toBe(1);
    expect(trip.completedStops).toBe(1); expect(trip.nextStopId).toBe(trip.stops[1].id);
  });
  it('propagates the exact188 delivery to Store with receipt absent and Dispatcher progress from the same rows', async () => {
    const tracked = await store.get(`/api/store/orders/${base.shortfallOrder.id}`);
    expect(tracked.status).toBe(200); expect([tracked.body.orderedUnits, tracked.body.loadedUnits, tracked.body.deliveredUnits]).toEqual([192, 188, 188]);
    expect(tracked.body.receipt).toBeNull(); expect(tracked.body.canReceive).toBe(true);
    const routed = await dispatcher.get(`/api/dispatcher/trips/${trip.id}`);
    expect(routed.status).toBe(200); expect(routed.body.status).toBe('IN_TRANSIT');
    expect(routed.body.stops[0].status).toBe('COMPLETED'); expect(routed.body.stops[0].order.deliveredUnits).toBe(188);
  });
  it('keeps partial and failed lifecycle states, proof metadata and operational exceptions visible to Dispatcher', async () => {
    for (const [index, outcome] of [[1, 'PARTIALLY_DELIVERED'], [2, 'FAILED']] as const) {
      const current = trip.stops[index];
      const arrived = await driver.post(`/api/driver/stops/${current.id}/arrival`).send(versions(trip, current));
      expect(arrived.status).toBe(200); trip = arrived.body;
      const actual = trip.stops[index];
      const completed = await driver.post(`/api/driver/stops/${actual.id}/complete`).send(deliveryBody(trip, actual,
        { outcome, deliveredUnits: outcome === 'FAILED' ? 0 : actual.loadedUnits - 1,
          reasonCode: outcome === 'FAILED' ? 'OUTLET_CLOSED' : 'QUANTITY_REJECTED', driverNote: 'Synthetic operational reason retained.' }));
      expect(completed.status, JSON.stringify(completed.body)).toBe(200); trip = completed.body;
      expect(trip.stops[index].order.status).toBe(outcome === 'FAILED' ? 'DELIVERY_FAILED' : 'PARTIALLY_DELIVERED');
      const exception = await db.exception.findFirstOrThrow({ where: { deliveryRecordId: trip.stops[index].delivery!.id } });
      const detail = await dispatcher.get(`/api/dispatcher/exceptions/${exception.id}`);
      expect(detail.status).toBe(200); expect(detail.body.type).toBe(outcome === 'FAILED' ? 'DELIVERY_FAILED' : 'DELIVERY_PARTIAL');
      expect(detail.body.originRole).toBe('DRIVER'); expect(detail.body.delivery.outcome).toBe(outcome);
    }
  });
  it('finishes only after all stops, records completion without inventing a depot return', async () => {
    for (const initial of trip.stops.filter(stop => !stop.delivery)) {
      let current = trip.stops.find(stop => stop.id === initial.id)!;
      const arrived = await driver.post(`/api/driver/stops/${current.id}/arrival`).send(versions(trip, current)); expect(arrived.status).toBe(200); trip = arrived.body;
      current = trip.stops.find(stop => stop.id === initial.id)!;
      const completed = await driver.post(`/api/driver/stops/${current.id}/complete`).send(deliveryBody(trip, current)); expect(completed.status).toBe(200); trip = completed.body;
    }
    expect(trip.canFinish).toBe(true);
    const response = await driver.post(`/api/driver/trips/${trip.id}/finish`).send({ expectedTripVersion: trip.version }); expect(response.status).toBe(200); trip = response.body;
    expect(trip.status).toBe('COMPLETED'); expect(trip.completedAt).toBeTruthy(); expect((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).actualReturn).toBeNull();
    expect((await driver.post(`/api/driver/trips/${trip.id}/finish`).send({ expectedTripVersion: trip.version })).status).toBe(409);
  });
});

describe('Sequential durable Driver synchronization and retained conflicts', () => {
  it('prepares another real released ready generated route without duplicating prototype data', async () => {
    offline = (await readyFixture('DRIVER-OFFLINE', true)).trip;
    const start = await driver.post(`/api/driver/trips/${offline.id}/start`).send({ expectedTripVersion: offline.version });
    expect(start.status).toBe(200); offline = start.body;
  }, 30000);
  it('processes queued arrival before delivery and persists both client event/creation timestamps', async () => {
    const stop = offline.stops[0];
    const arrival = operation('ARRIVAL', offline, stop, { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version });
    const completion = operation('COMPLETE_DELIVERY', { ...offline, version: offline.version + 1 }, stop,
      { expectedStopVersion: stop.version + 1, expectedOrderVersion: stop.order.version + 1, outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits,
        recipientName: 'Offline Recipient', recipientRole: 'Outlet supervisor', driverNote: 'Offline proof counted and saved.' });
    const response = await sync([arrival, completion]);
    expect(response.results.map((result: { status: string }) => result.status)).toEqual(['SYNCED', 'SYNCED']);
    offline = response.results[1].trip;
    const row = await db.deliveryRecord.findUniqueOrThrow({ where: { tripStopId: stop.id } });
    expect(row.clientEventAt?.toISOString()).toBe(completion.clientEventAt); expect(row.operationCreatedAt?.toISOString()).toBe(completion.createdAt);
    expect(row.expectedLoadedUnits).toBe(188); expect(row.deliveredUnits).toBe(188);
    const before = await counts(), replay = await sync([arrival, completion]);
    expect(replay).toEqual(response); expect(await counts()).toEqual(before);
    expect(await db.offlineOperation.count({ where: { operationId: { in: [arrival.operationId, completion.operationId] }, status: 'SYNCED' } })).toBe(2);
  });
  it('handles concurrent duplicate UUIDs with identical committed results and exactly one audit/delivery', async () => {
    const stop = offline.stops[1], arrival = operation('ARRIVAL', offline, stop, { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version });
    const [first, second] = await Promise.all([sync([arrival]), sync([arrival])]); expect(second).toEqual(first); expect(first.results[0].status).toBe('SYNCED');
    offline = first.results[0].trip;
    const current = offline.stops[1], completion = operation('COMPLETE_DELIVERY', offline, current,
      { expectedStopVersion: current.version, expectedOrderVersion: current.order.version, outcome: 'DELIVERED', deliveredUnits: current.loadedUnits,
        recipientName: 'Replay Recipient', recipientRole: 'Supervisor' });
    const [deliveryFirst, deliverySecond] = await Promise.all([sync([completion]), sync([completion])]);
    expect(deliverySecond).toEqual(deliveryFirst); expect(deliveryFirst.results[0].status).toBe('SYNCED'); offline = deliveryFirst.results[0].trip;
    expect(await db.deliveryRecord.count({ where: { tripStopId: current.id } })).toBe(1);
    expect(await db.auditEvent.count({ where: { eventType: 'OFFLINE_ACTION_SYNCED', metadata: { path: ['driver', 'operationId'], equals: completion.operationId } } })).toBe(1);
  });
  it('returns and retains a structured stale-version conflict without overwriting or deleting local evidence', async () => {
    const stop = offline.stops[2], stale = operation('ARRIVAL', { ...offline, version: offline.version - 1 }, stop,
      { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version });
    const before = await counts(), response = await sync([stale]);
    expect(response.results[0]).toMatchObject({ operationId: stale.operationId, status: 'CONFLICT', serverVersion: offline.version });
    expect(await counts()).toEqual(before);
    const retained = await db.offlineOperation.findUniqueOrThrow({ where: { operationId: stale.operationId } }); expect(retained.status).toBe('CONFLICT');
    expect(retained.payload).toEqual(stale.payload); expect(await sync([stale])).toEqual(response);
    await expect(db.offlineOperation.delete({ where: { operationId: stale.operationId } })).rejects.toThrow();
  });
  it('blocks later dependent operations after an earlier conflict rather than reordering', async () => {
    const stop = offline.stops[2], stale = operation('ARRIVAL', { ...offline, version: offline.version - 1 }, stop,
      { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version });
    const later = operation('COMPLETE_DELIVERY', offline, stop, { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version,
      outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits, recipientName: 'Blocked Recipient', recipientRole: 'Supervisor' });
    const response = await sync([stale, later]); expect(response.results.map((result: { status: string }) => result.status)).toEqual(['CONFLICT', 'FAILED']);
    expect(await db.deliveryRecord.count({ where: { tripStopId: stop.id } })).toBe(0);
  });
  it('retains failed actions and safely retries an unchanged UUID without fabricating success', async () => {
    const stop = offline.stops[2], invalid = operation('COMPLETE_DELIVERY', offline, stop,
      { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version, outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits,
        recipientName: 'Not Arrived Recipient', recipientRole: 'Supervisor' });
    const before = await counts(), response = await sync([invalid]); expect(response.results[0].status).toBe('CONFLICT'); expect(await counts()).toEqual(before);
    const malformed = operation('ARRIVAL', offline, stop, { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version, actorUserId: base.store.id });
    expect((await sync([malformed])).results[0].status).toBe('FAILED');
    expect((await db.offlineOperation.findUniqueOrThrow({ where: { operationId: malformed.operationId } })).status).toBe('FAILED');
    expect((await sync([malformed])).results[0].status).toBe('FAILED'); expect(await counts()).toEqual(before);
  });
  it('rejects UUID reuse with a different payload and prevents another Driver replaying its result', async () => {
    const stop = offline.stops[2], op = operation('ARRIVAL', offline, stop, { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version });
    const result = await sync([op]); expect(result.results[0].status).toBe('SYNCED'); offline = result.results[0].trip;
    const before = await counts(); expect((await sync([{ ...op, payload: { ...op.payload, expectedStopVersion: stop.version + 5 } }])).results[0].status).toBe('CONFLICT');
    const foreign = await foreignDriver.post('/api/driver/sync').send({ operations: [op] }); expect(foreign.status).toBe(200);
    expect(foreign.body.results[0].status).toBe('CONFLICT'); expect(foreign.body.results[0].trip).toBeUndefined(); expect(await counts()).toEqual(before);
  });
  it('rejects future/stale device clocks and inconsistent entity/action pairs before mutation', async () => {
    const stop = offline.stops[2], before = await counts(), op = operation('COMPLETE_DELIVERY', offline, stop,
      { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version, outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits, recipientName: 'Clock Recipient', recipientRole: 'Supervisor' });
    const future = new Date(Date.now() + 3600000).toISOString();
    expect((await sync([{ ...op, operationId: randomUUID(), clientEventAt: future, createdAt: future }])).results[0].status).toBe('FAILED');
    const old = new Date(Date.now() - 8 * 86400000).toISOString();
    expect((await sync([{ ...op, operationId: randomUUID(), clientEventAt: old, createdAt: old }])).results[0].status).toBe('FAILED');
    expect((await sync([{ ...op, operationId: randomUUID(), action: 'FINISH_TRIP' }])).results[0].status).toBe('FAILED');
    expect(await counts()).toEqual(before);
  });
  it('uses server time for fresh online queued operations while retaining original client timestamps', async () => {
    const stop = offline.stops[2], op = operation('COMPLETE_DELIVERY', offline, stop,
      { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version, outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits,
        recipientName: 'Online Recipient', recipientRole: 'Supervisor' });
    op.recordedOffline = false; const lowerBound = Date.now(), response = await sync([op]);
    expect(response.results[0].status).toBe('SYNCED'); offline = response.results[0].trip;
    const delivery = await db.deliveryRecord.findUniqueOrThrow({ where: { tripStopId: stop.id } });
    expect(delivery.completedAt.getTime()).toBeGreaterThanOrEqual(lowerBound); expect(delivery.clientEventAt?.toISOString()).toBe(op.clientEventAt);
    expect((await db.offlineOperation.findUniqueOrThrow({ where: { operationId: op.operationId } })).clientEventAt.toISOString()).toBe(op.clientEventAt);
  });
  it('rolls back arrival completely when the central append-only audit write fails, then retry succeeds once', async () => {
    const stop = offline.stops[3], op = operation('ARRIVAL', offline, stop, { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version });
    const before = await counts();
    await db.$executeRawUnsafe(`CREATE FUNCTION driver_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'STOP_ARRIVED' THEN RAISE EXCEPTION 'synthetic audit rejection'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "Driver_test_reject_audit" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION driver_test_reject_audit()`);
    try {
      expect((await driver.post('/api/driver/sync').send({ operations: [op] })).status).toBe(500);
      expect(await counts()).toEqual(before); expect((await db.tripStop.findUniqueOrThrow({ where: { id: stop.id } })).status).toBe('PLANNED');
      expect(await db.offlineOperation.findUnique({ where: { operationId: op.operationId } })).toBeNull();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "Driver_test_reject_audit" ON "AuditEvent"`); await db.$executeRawUnsafe('DROP FUNCTION driver_test_reject_audit()');
    }
    const response = await sync([op]); expect(response.results[0].status).toBe('SYNCED'); offline = response.results[0].trip;
  });
  it('synchronizes partial delivery then finish in order and replays completion without inventing depot return', async () => {
    const stop = offline.stops[3], complete = operation('COMPLETE_DELIVERY', offline, stop,
      { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version, outcome: 'PARTIALLY_DELIVERED', deliveredUnits: stop.loadedUnits - 1,
        reasonCode: 'QUANTITY_REJECTED', driverNote: 'Synthetic damaged unit rejected during offline delivery.', recipientName: 'Offline Partial Recipient', recipientRole: 'Supervisor' });
    const finish = operation('FINISH_TRIP', { ...offline, version: offline.version + 1 });
    const response = await sync([complete, finish]); expect(response.results.map((result: { status: string }) => result.status)).toEqual(['SYNCED', 'SYNCED']);
    offline = response.results[1].trip; expect(offline.status).toBe('COMPLETED'); expect(offline.completedAt).toBeTruthy();
    expect(offline.stops[3].order.status).toBe('PARTIALLY_DELIVERED');
    expect((await db.trip.findUniqueOrThrow({ where: { id: offline.id } })).actualReturn).toBeNull();
    const before = await counts(); expect(await sync([complete, finish])).toEqual(response); expect(await counts()).toEqual(before);
  });
  it('keeps synchronization results and committed identity immutable in PostgreSQL', async () => {
    const committed = await db.offlineOperation.findFirstOrThrow({ where: { status: 'SYNCED' } });
    await expect(db.offlineOperation.update({ where: { operationId: committed.operationId }, data: { result: { overwritten: true } } })).rejects.toThrow();
    expect((await db.offlineOperation.findUniqueOrThrow({ where: { operationId: committed.operationId } })).result).toEqual(committed.result);
  });
});

describe('Durable scoped delivery pictures and recipient signatures', () => {
  const foreignStore = request.agent(app), foreignDispatcher = request.agent(app);
  let route: DriverTripDetail, fixture: LoaderFixture, photo: ProofAttachmentInput, signature: ProofAttachmentInput;
  let completion: DriverOperation, committedResult: Awaited<ReturnType<typeof sync>>;
  let oversizedDimension: ProofAttachmentInput;
  const attachmentPath = () => route.stops[0].delivery!.proof!.attachments![0].url;
  async function mediaCounts() {
    return { ...await counts(), proof: await db.deliveryProof.count(), attachments: await db.deliveryAttachment.count() };
  }
  async function arriveAt(index: number) {
    const stop = route.stops[index], response = await driver.post(`/api/driver/stops/${stop.id}/arrival`).send(versions(route, stop));
    expect(response.status, JSON.stringify(response.body)).toBe(200); route = response.body;
  }
  beforeAll(async () => {
    const prepared = await readyFixture('DRIVER-MEDIA'); fixture = prepared.fixture; route = prepared.trip;
    await db.userOutlet.deleteMany({ where: { userId: base.store.id } });
    await db.userOutlet.create({ data: { userId: base.store.id, outletId: fixture.storeOutlet.id } });
    for (const [agent, role, suffix] of [[foreignStore, 'STORE_MANAGER', 'store'], [foreignDispatcher, 'DISPATCHER', 'dispatcher']] as const) {
      const user = await db.user.create({ data: { email: `media-foreign-${suffix}@waypoint.local`, displayName: `Synthetic foreign ${suffix}`,
        role, passwordHash: fixture.driver.passwordHash } });
      if (role === 'STORE_MANAGER') await db.userOutlet.create({ data: { userId: user.id, outletId: fixture.foreignOutlet.id } });
      else await db.userDepot.create({ data: { userId: user.id, depotId: fixture.foreignDepot.id } });
      expect((await agent.post('/api/auth/login').send({ email: user.email, password })).status).toBe(200);
    }
    const photoBytes = await sharp(randomBytes(256 * 256 * 3), { raw: { width: 256, height: 256, channels: 3 } })
      .jpeg({ quality: 85 }).withMetadata({ exif: { IFD0: { ImageDescription: 'SYNTHETIC metadata must not survive normalization' } } }).toBuffer();
    photo = { kind: 'PHOTO', contentType: 'image/jpeg', base64: photoBytes.toString('base64') };
    const signatureBytes = await sharp({ create: { width: 2000, height: 1000, channels: 4, background: '#ffffff' } })
      .composite([{ input: Buffer.from('<svg width="2000" height="1000"><path d="M100 700 Q400 100 600 700 T1100 600 T1800 700" stroke="black" stroke-width="20" fill="none"/></svg>') }]).png().toBuffer();
    signature = { kind: 'SIGNATURE', contentType: 'image/png', base64: signatureBytes.toString('base64') };
    oversizedDimension = { kind: 'PHOTO', contentType: 'image/png', base64: (await sharp({ create: { width: 4097, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer()).toString('base64') };
    const started = await driver.post(`/api/driver/trips/${route.id}/start`).send({ expectedTripVersion: route.version });
    expect(started.status).toBe(200); route = started.body; await arriveAt(0);
  }, 60000);

  it('rejects malformed, disguised, truncated and mismatched image bytes before delivery or proof writes', async () => {
    const before = await mediaCounts(), stop = route.stops[0];
    const invalid = [
      { ...photo, base64: 'not-base64' },
      { ...photo, base64: Buffer.from('this is not an image').toString('base64') },
      { ...photo, base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64') },
      { ...photo, base64: Buffer.from(photo.base64, 'base64').subarray(0, 16).toString('base64') },
      { ...photo, contentType: 'image/png' },
      { ...photo, contentType: 'image/svg+xml' }, oversizedDimension
    ];
    for (const attachment of invalid) {
      const response = await driver.post(`/api/driver/stops/${stop.id}/complete`).send(deliveryBody(route, stop, { attachments: [attachment] }));
      expect(response.status, JSON.stringify(response.body)).toBe(400);
    }
    expect(await mediaCounts()).toEqual(before);
    expect((await driverDetail(route.id)).version).toBe(route.version);
  });
  it('enforces three-photo, one-signature and separate decoded byte limits', async () => {
    const before = await mediaCounts(), stop = route.stops[0];
    for (const attachments of [[photo, photo, photo, photo], [signature, signature],
      [{ ...photo, base64: Buffer.alloc(PROOF_LIMITS.maxPhotoBytes + 1).toString('base64') }],
      [{ ...signature, base64: Buffer.alloc(PROOF_LIMITS.maxSignatureBytes + 1).toString('base64') }]]) {
      const response = await driver.post(`/api/driver/stops/${stop.id}/complete`).send(deliveryBody(route, stop, { attachments }));
      expect(response.status, JSON.stringify(response.body)).toBe(400);
    }
    expect(await mediaCounts()).toEqual(before);
  });
  it('authenticates large proof bodies before parsing and keeps ordinary requests at the existing limit', async () => {
    const stop = route.stops[0], body = deliveryBody(route, stop, { attachments: [photo] }), before = await mediaCounts();
    const oversized = { padding: 'x'.repeat(5 * 1024 * 1024) };
    expect(JSON.stringify(body).length).toBeGreaterThan(16384);
    expect((await request(app).post(`/api/driver/stops/${stop.id}/complete`).send(body)).status).toBe(401);
    expect((await loader.post(`/api/driver/stops/${stop.id}/complete`).send(body)).status).toBe(403);
    const oversizedLength = String(JSON.stringify(oversized).length);
    expect((await request(app).post('/api/driver/sync').set('Content-Type', 'application/json').set('Content-Length', oversizedLength)).status).toBe(401);
    expect((await loader.post('/api/driver/sync').set('Content-Type', 'application/json').set('Content-Length', oversizedLength)).status).toBe(403);
    expect((await driver.post('/api/driver/sync').send(oversized)).status).toBe(413);
    expect((await driver.post(`/api/driver/trips/${route.id}/start`).send({ padding: 'x'.repeat(17000) })).status).toBe(413);
    expect(await mediaCounts()).toEqual(before);
  });
  it('stores bounded normalized pictures and signature atomically with one delivery and a metadata-only response', async () => {
    const stop = route.stops[0];
    completion = operation('COMPLETE_DELIVERY', route, stop, { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version,
      outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits, recipientName: 'Synthetic Media Recipient', recipientRole: 'Store supervisor',
      attachments: [photo, signature, photo, photo] });
    committedResult = await sync([completion]); expect(committedResult.results[0].status).toBe('SYNCED'); route = committedResult.results[0].trip;
    const proof = route.stops[0].delivery!.proof!;
    expect(proof).toMatchObject({ hasPhoto: true, hasSignature: true, binaryAvailable: true, recipientName: 'Synthetic Media Recipient' });
    expect(proof.attachments!.map(item => item.kind)).toEqual(['PHOTO', 'PHOTO', 'PHOTO', 'SIGNATURE']);
    expect(proof.attachments!.every(item => item.url === `/api/proof/attachments/${item.id}`)).toBe(true);
    const rows = await db.deliveryAttachment.findMany({ where: { proof: { deliveryRecordId: route.stops[0].delivery!.id } }, orderBy: { ordinal: 'asc' } });
    expect(rows.map(row => row.ordinal)).toEqual([0, 1, 2, 3]);
    for (const row of rows) {
      expect(row.byteLength).toBe(row.bytes.byteLength);
      expect(row.sha256).toBe(createHash('sha256').update(row.bytes).digest('hex'));
      const metadata = await sharp(Buffer.from(row.bytes)).metadata();
      expect(metadata.format).toBe(row.kind === 'PHOTO' ? 'jpeg' : 'png'); expect(metadata.exif).toBeUndefined();
      expect(metadata.width).toBe(row.width); expect(metadata.height).toBe(row.height);
    }
    expect(rows[3]).toMatchObject({ width: 1600, height: 800, contentType: 'image/png' });
    expect(JSON.stringify(committedResult)).not.toContain(photo.base64);
    expect(JSON.stringify(committedResult)).not.toContain('"bytes"');
    expect(await db.receipt.count({ where: { deliveryRecordId: route.stops[0].delivery!.id } })).toBe(0);
  });
  it('replays unchanged offline proof UUIDs with identical results and no duplicate attachments or audits', async () => {
    const before = await mediaCounts(), replay = await sync([completion]);
    expect(replay).toEqual(committedResult); expect(await mediaCounts()).toEqual(before);
    expect(await db.deliveryAttachment.count({ where: { proof: { deliveryRecordId: route.stops[0].delivery!.id } } })).toBe(4);
    expect(await db.auditEvent.count({ where: { eventType: 'STOP_COMPLETED', entityId: route.stops[0].delivery!.id } })).toBe(1);
    expect(await db.auditEvent.count({ where: { eventType: 'OFFLINE_ACTION_SYNCED', metadata: { path: ['driver', 'operationId'], equals: completion.operationId } } })).toBe(1);
  });
  it('rejects changed attachment bytes on a reused UUID while preserving committed proof and results', async () => {
    const before = await mediaCounts();
    const changed = { ...photo, base64: (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#448855' } }).jpeg().toBuffer()).toString('base64') };
    const response = await sync([{ ...completion, payload: { ...completion.payload, attachments: [changed, signature] } }]);
    expect(response.results[0].status).toBe('CONFLICT'); expect(response.results[0].trip).toBeUndefined();
    expect(await mediaCounts()).toEqual(before); expect(await sync([completion])).toEqual(committedResult);
  });
  it('returns matching actual binary proof to the assigned Driver, outlet Store and depot Dispatcher with private response headers', async () => {
    const path = attachmentPath(), row = await db.deliveryAttachment.findUniqueOrThrow({ where: { id: route.stops[0].delivery!.proof!.attachments![0].id } });
    for (const agent of [driver, store, dispatcher]) {
      const response = await agent.get(path);
      expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff'); expect(response.headers['content-type']).toMatch(/^image\/jpeg/);
      expect(Number(response.headers['content-length'])).toBe(row.byteLength);
      expect(Buffer.from(response.body)).toEqual(Buffer.from(row.bytes));
    }
    const signatureResponse = await store.get(route.stops[0].delivery!.proof!.attachments![3].url);
    expect(signatureResponse.status).toBe(200); expect(signatureResponse.headers['content-type']).toMatch(/^image\/png/);
  });
  it('denies anonymous, Loader and foreign Driver, outlet and depot access to actual proof bytes', async () => {
    const path = attachmentPath(), before = await mediaCounts();
    expect((await request(app).get(path)).status).toBe(401);
    for (const agent of [loader, foreignDriver, foreignDispatcher]) {
      const response = await agent.get(path); expect(response.status).toBe(403); expect(response.body.error).toBeTruthy();
    }
    expect((await foreignStore.get(path)).status).toBe(404);
    expect((await driver.get('/api/proof/attachments/not-a-uuid')).status).toBe(400);
    expect((await dispatcher.get(`/api/proof/attachments/${randomUUID()}`)).status).toBe(404);
    expect(await mediaCounts()).toEqual(before);
  });
  it('shows the same metadata in Store and Dispatcher details without disclosing encoded evidence in audit metadata', async () => {
    const stop = route.stops[0], expected = stop.delivery!.proof;
    const tracked = await store.get(`/api/store/orders/${stop.order.id}`), observed = await dispatcher.get(`/api/dispatcher/orders/${stop.order.id}`);
    expect(tracked.status).toBe(200); expect(observed.status).toBe(200);
    expect(tracked.body.delivery.proof).toEqual(expected); expect(observed.body.delivery.proof).toEqual(expected);
    expect(tracked.body.trip.id).toBe(route.id); expect(tracked.body.receipt).toBeNull();
    const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: stop.delivery!.id, eventType: 'STOP_COMPLETED' } });
    const metadata = audit.metadata as { proofAttachments: { id: string; sha256: string }[] };
    expect(metadata.proofAttachments).toHaveLength(4);
    expect(metadata.proofAttachments.every(item => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain(photo.base64); expect(JSON.stringify(metadata)).not.toContain('"bytes"');
    expect(JSON.stringify(metadata)).not.toContain('"base64"');
  });
  it('enforces append-only binary evidence at the PostgreSQL boundary', async () => {
    const id = route.stops[0].delivery!.proof!.attachments![0].id, before = await db.deliveryAttachment.findUniqueOrThrow({ where: { id } });
    await expect(db.deliveryAttachment.update({ where: { id }, data: { bytes: Uint8Array.from([1, 2, 3]) } })).rejects.toThrow();
    await expect(db.deliveryAttachment.delete({ where: { id } })).rejects.toThrow();
    expect(await db.deliveryAttachment.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
  it('rolls back media, delivery, lifecycle and UUID together when the audit write fails, then retries once', async () => {
    await arriveAt(1); const stop = route.stops[1], before = await mediaCounts();
    const op = operation('COMPLETE_DELIVERY', route, stop, { expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version,
      outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits, recipientName: 'Synthetic Atomic Recipient', recipientRole: 'Supervisor', attachments: [photo, signature] });
    await db.$executeRawUnsafe(`CREATE FUNCTION media_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'STOP_COMPLETED' THEN RAISE EXCEPTION 'synthetic media audit rejection'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "Media_test_reject_audit" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION media_test_reject_audit()`);
    try {
      expect((await driver.post('/api/driver/sync').send({ operations: [op] })).status).toBe(500);
      expect(await mediaCounts()).toEqual(before); expect((await db.tripStop.findUniqueOrThrow({ where: { id: stop.id } })).status).toBe('ARRIVED');
      expect(await db.offlineOperation.findUnique({ where: { operationId: op.operationId } })).toBeNull();
      expect((await driverDetail(route.id)).version).toBe(route.version);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "Media_test_reject_audit" ON "AuditEvent"`); await db.$executeRawUnsafe('DROP FUNCTION media_test_reject_audit()');
    }
    const [first, second] = await Promise.all([sync([op]), sync([op])]);
    expect(second).toEqual(first); expect(first.results[0].status).toBe('SYNCED'); route = first.results[0].trip;
    expect(await db.deliveryAttachment.count({ where: { proof: { deliveryRecordId: route.stops[1].delivery!.id } } })).toBe(2);
    expect(await db.deliveryRecord.count({ where: { tripStopId: stop.id } })).toBe(1);
    expect(await db.auditEvent.count({ where: { eventType: 'STOP_COMPLETED', entityId: route.stops[1].delivery!.id } })).toBe(1);
  });
  it('preserves a failed-stop picture without inventing a recipient, delivery quantity or Store receipt', async () => {
    await arriveAt(2); const stop = route.stops[2];
    const response = await driver.post(`/api/driver/stops/${stop.id}/complete`).send({ ...versions(route, stop), outcome: 'FAILED', deliveredUnits: 0,
      reasonCode: 'OUTLET_CLOSED', driverNote: 'Synthetic closed entrance recorded.', attachments: [photo] });
    expect(response.status, JSON.stringify(response.body)).toBe(200); route = response.body;
    const delivery = route.stops[2].delivery!;
    expect(delivery.proof).toMatchObject({ recipientName: null, recipientRole: null, hasPhoto: true, hasSignature: false, binaryAvailable: true });
    expect(delivery.deliveredUnits).toBe(0); expect(route.stops[2].order.status).toBe('DELIVERY_FAILED');
    expect(await db.receipt.count({ where: { deliveryRecordId: delivery.id } })).toBe(0);
    const exception = await db.exception.findFirstOrThrow({ where: { deliveryRecordId: delivery.id } });
    const detail = await dispatcher.get(`/api/dispatcher/exceptions/${exception.id}`);
    expect(detail.status).toBe(200); expect(detail.body.delivery.proof).toEqual(delivery.proof);
  });
});
