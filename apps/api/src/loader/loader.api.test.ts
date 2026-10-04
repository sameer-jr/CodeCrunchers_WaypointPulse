import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { DispatcherExceptionDetail, LoaderStop, LoaderTripDetail, PlanningRunDetail, RecordStopLoadInput } from '@waypoint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { addBusinessDays } from '../store/testing/synthetic.js';
import { installLoaderFixture, LOADER_SYNTHETIC_DATE, type LoaderFixture } from './testing/synthetic.js';

if (!process.env.LOADER_TEST_DATABASE_URL) throw new Error('Run npm run test; Loader tests require an isolated PostgreSQL database.');
const db = new PrismaClient({ datasources: { db: { url: process.env.LOADER_TEST_DATABASE_URL } } });
const config = readConfig({ ...process.env, DATABASE_URL: process.env.LOADER_TEST_DATABASE_URL, NODE_ENV: 'test',
  STORE_ALLOW_SYNTHETIC: 'false', PLANNING_ALLOW_SYNTHETIC: 'false' });
const app = createApp(db, config, { planning: { allowSyntheticReferences: true }, store: { allowSyntheticReferences: true },
  dispatcher: { demoDate: LOADER_SYNTHETIC_DATE } });
const loader = request.agent(app), dispatcher = request.agent(app), driver = request.agent(app), store = request.agent(app), foreignLoader = request.agent(app);
let base: LoaderFixture, draft: PlanningRunDetail, released: PlanningRunDetail, normal: LoaderTripDetail, shortfallExceptionId: string;

async function generate(fixture: LoaderFixture, changes: Record<string, unknown> = {}) {
  const response = await dispatcher.post('/api/dispatcher/plans').send({ serviceDate: fixture.serviceDate, depotId: fixture.depot.id, ...changes });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as PlanningRunDetail;
}
async function validate(run: PlanningRunDetail) {
  const response = await dispatcher.post(`/api/dispatcher/plans/${run.id}/validate`).send({ expectedVersion: run.version });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.validation.valid).toBe(true);
  return response.body as PlanningRunDetail;
}
async function release(run: PlanningRunDetail) {
  const response = await dispatcher.post(`/api/dispatcher/plans/${run.id}/release`).send({ expectedVersion: run.version });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as PlanningRunDetail;
}
async function releasedFixture(key: string) {
  const fixture = await installLoaderFixture(db, { key, assignStore: false });
  const run = await release(await validate(await generate(fixture)));
  const assignment = run.decisions.find(item => item.order.id === fixture.shortfallOrder.id)!;
  expect(assignment.decision).toBe('ASSIGNED');
  return { fixture, run, trip: await detail(assignment.tripId!) };
}
async function detail(id: string) {
  const response = await loader.get(`/api/loader/trips/${id}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.headers['cache-control']).toContain('no-store');
  return response.body as LoaderTripDetail;
}
function loadBody(trip: LoaderTripDetail, stop: LoaderStop, changes: Record<string, unknown> = {}): RecordStopLoadInput {
  return { expectedTripVersion: trip.version, expectedOrderVersion: stop.order.version, expectedStopUpdatedAt: stop.updatedAt,
    expectedLoadRevision: stop.load?.revision ?? 0, loadedUnits: stop.order.orderedUnits, ...changes } as RecordStopLoadInput;
}
async function load(trip: LoaderTripDetail, stopId: string, changes: Record<string, unknown> = {}) {
  const stop = trip.stops.find(item => item.id === stopId)!;
  const response = await loader.post(`/api/loader/stops/${stop.id}/load`).send(loadBody(trip, stop, changes));
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as LoaderTripDetail;
}
async function completeRemaining(trip: LoaderTripDetail) {
  let current = await detail(trip.id);
  for (const original of current.stops) if (!original.load || original.load.status !== 'COMPLETE') {
    current = await load(current, original.id);
  }
  return current;
}
function reviewBody(trip: LoaderTripDetail, stop: LoaderStop, decision: 'APPROVE' | 'REJECT') {
  return { expectedTripVersion: trip.version, expectedOrderVersion: stop.order.version, expectedLoadRevision: stop.load!.revision, decision };
}
async function review(trip: LoaderTripDetail, stop: LoaderStop, decision: 'APPROVE' | 'REJECT') {
  const exception = stop.exceptions.find(item => item.type === 'LOADING_SHORTFALL' && item.status !== 'RESOLVED')!;
  const response = await dispatcher.post(`/api/dispatcher/exceptions/${exception.id}/review-load`).send(reviewBody(trip, stop, decision));
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as LoaderTripDetail;
}
async function snapshot(depotId: string) {
  const [orders, trips, stops, loads, exceptions, audits] = await Promise.all([
    db.order.findMany({ where: { outlet: { depotId } }, orderBy: { id: 'asc' } }),
    db.trip.findMany({ where: { vehicle: { depotId } }, orderBy: { id: 'asc' } }),
    db.tripStop.findMany({ where: { trip: { vehicle: { depotId } } }, orderBy: { id: 'asc' } }),
    db.loadRecord.findMany({ where: { tripStop: { trip: { vehicle: { depotId } } } }, orderBy: { id: 'asc' } }),
    db.exception.findMany({ where: { OR: [{ order: { outlet: { depotId } } }, { trip: { vehicle: { depotId } } }] }, orderBy: { id: 'asc' } }),
    db.auditEvent.findMany({ orderBy: { id: 'asc' } })
  ]);
  return JSON.stringify({ orders, trips, stops, loads, exceptions, audits });
}
beforeAll(async () => {
  base = await installLoaderFixture(db);
  for (const [agent, name] of [[loader, 'loader'], [dispatcher, 'dispatcher'], [driver, 'driver'], [store, 'store']] as const) {
    expect((await agent.post('/api/auth/login').send({ email: `${name}@waypoint.local`, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
  }
  const foreign = await db.user.create({ data: { email: 'foreign.loader@waypoint.local', displayName: 'SYNTHETIC Foreign Loader', role: 'LOADER', passwordHash: base.loader.passwordHash } });
  await db.userDepot.create({ data: { userId: foreign.id, depotId: base.foreignDepot.id } });
  expect((await foreignLoader.post('/api/auth/login').send({ email: foreign.email, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
});
afterAll(async () => { await db.$disconnect(); });

describe('Released generated Loader visibility and authorization', () => {
  it('installs demand and the original 192 quantity without precomputed Loader trips', async () => {
    expect(base.shortfallOrder).toMatchObject({ orderedUnits: 192, status: 'CONFIRMED' });
    expect(await db.trip.count()).toBe(0); expect(await db.loadRecord.count()).toBe(0); expect(await db.planningRun.count()).toBe(0);
    const audits = await db.auditEvent.findMany({ where: { entityId: base.shortfallOrder.id }, orderBy: { timestamp: 'asc' } });
    expect(audits.map(item => item.eventType)).toEqual(['ORDER_CREATED', 'ORDER_CONFIRMED']);
  });
  it('requires Loader authentication and rejects other roles on reads and writes', async () => {
    expect((await request(app).get('/api/loader/loads')).status).toBe(401);
    expect((await request(app).post(`/api/loader/stops/${randomUUID()}/load`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/loader/trips/${randomUUID()}/ready`).send({})).status).toBe(401);
    for (const agent of [dispatcher, driver, store]) {
      expect((await agent.get('/api/loader/loads')).status).toBe(403);
      expect((await agent.get(`/api/loader/trips/${randomUUID()}`)).status).toBe(403);
      expect((await agent.post(`/api/loader/stops/${randomUUID()}/load`).send({})).status).toBe(403);
      expect((await agent.post(`/api/loader/trips/${randomUUID()}/ready`).send({})).status).toBe(403);
    }
    expect((await loader.get('/api/loader/loads?date=2040-02-30')).status).toBe(400);
    expect((await loader.get(`/api/loader/trips/invalid`)).status).toBe(400);
  });
  it('hides drafts, validated previews and superseded cancelled trips, then shows the real released plan', async () => {
    draft = await generate(base);
    expect((await loader.get(`/api/loader/loads?date=${base.serviceDate}`)).body.trips).toEqual([]);
    for (const trip of draft.trips) expect((await loader.get(`/api/loader/trips/${trip.id}`)).status).toBe(403);
    const validated = await validate(draft);
    expect((await loader.get(`/api/loader/loads?date=${base.serviceDate}`)).body.trips).toEqual([]);
    for (const trip of validated.trips) expect((await loader.get(`/api/loader/trips/${trip.id}`)).status).toBe(403);
    const regenerated = await generate(base, { expectedRunId: draft.id, expectedVersion: validated.version });
    for (const trip of draft.trips) expect((await loader.get(`/api/loader/trips/${trip.id}`)).status).toBe(403);
    released = await release(await validate(regenerated));
    const response = await loader.get(`/api/loader/loads?date=${base.serviceDate}`);
    expect(response.status).toBe(200); expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.trips.map((trip: { id: string }) => trip.id).sort()).toEqual(released.trips.map(trip => trip.id).sort());
    expect((await loader.get(`/api/loader/loads?date=${addBusinessDays(base.serviceDate, 2)}`)).body.trips).toEqual([]);
    const assigned = released.decisions.find(item => item.order.id === base.shortfallOrder.id)!;
    expect(assigned.decision).toBe('ASSIGNED'); normal = await detail(assigned.tripId!);
    expect(normal.stops.map(stop => stop.order.id)).toEqual(released.trips.find(trip => trip.id === normal.id)!.stops.map(stop => stop.orderId));
    expect(normal.stops.map(stop => stop.sequence)).toEqual(normal.stops.map((_stop, index) => index + 1));
    expect(normal.orderedUnits).toBe(normal.stops.reduce((sum, stop) => sum + stop.order.orderedUnits, 0));
  }, 30000);
  it('fails closed without current depot assignments and denies a foreign Loader without writes', async () => {
    const stop = normal.stops[0], before = await snapshot(base.depot.id);
    expect((await foreignLoader.get(`/api/loader/trips/${normal.id}`)).status).toBe(403);
    expect((await foreignLoader.get(`/api/loader/loads?date=${base.serviceDate}`)).body.trips).toEqual([]);
    expect((await foreignLoader.post(`/api/loader/stops/${stop.id}/load`).send(loadBody(normal, stop))).status).toBe(403);
    expect((await foreignLoader.post(`/api/loader/trips/${normal.id}/ready`).send({ expectedTripVersion: normal.version })).status).toBe(403);
    const assignment = await db.userDepot.findUniqueOrThrow({ where: { userId_depotId: { userId: base.loader.id, depotId: base.depot.id } } });
    await db.userDepot.delete({ where: { userId_depotId: { userId: base.loader.id, depotId: base.depot.id } } });
    try {
      const response = await loader.get('/api/loader/loads');
      expect(response.status).toBe(200); expect(response.body.depots).toEqual([]); expect(response.body.trips).toEqual([]);
      expect([403, 404]).toContain((await loader.get(`/api/loader/trips/${normal.id}`)).status);
    } finally { await db.userDepot.create({ data: assignment }); }
    expect(await snapshot(base.depot.id)).toBe(before);
  });
  it('hides a cancelled actual released generated trip', async () => {
    const prepared = await releasedFixture('CANCELLED');
    await db.trip.update({ where: { id: prepared.trip.id }, data: { status: 'CANCELLED', version: { increment: 1 } } });
    expect((await loader.get(`/api/loader/trips/${prepared.trip.id}`)).status).toBe(403);
    const response = await loader.get(`/api/loader/loads?date=${prepared.fixture.serviceDate}`);
    expect(response.body.trips.map((trip: { id: string }) => trip.id)).not.toContain(prepared.trip.id);
  }, 30000);
});

describe('Loading quantities, shortfall evidence and Dispatcher review', () => {
  it('blocks readiness while required stop loads are incomplete', async () => {
    const before = await snapshot(base.depot.id);
    const response = await loader.post(`/api/loader/trips/${normal.id}/ready`).send({ expectedTripVersion: normal.version });
    expect(response.status).toBe(409); expect(await snapshot(base.depot.id)).toBe(before);
  });
  it('records normal loading separately, persists after reload and starts the loading lifecycle', async () => {
    const stop = normal.stops.find(item => item.order.id !== base.shortfallOrder.id)!;
    expect(stop).toBeDefined();
    const original = await db.order.findUniqueOrThrow({ where: { id: stop.order.id } });
    normal = await load(normal, stop.id);
    const loaded = (await detail(normal.id)).stops.find(item => item.id === stop.id)!;
    expect(loaded.load).toMatchObject({ expectedUnits: original.orderedUnits, loadedUnits: original.orderedUnits, status: 'COMPLETE', reviewStatus: 'NOT_REQUIRED', recordedByUserId: base.loader.id });
    expect(loaded.load!.recordedAt).toBeTruthy();
    expect((await db.order.findUniqueOrThrow({ where: { id: original.id } })).orderedUnits).toBe(original.orderedUnits);
    expect(await db.auditEvent.count({ where: { eventType: 'LOADING_STARTED', entityId: original.id } })).toBe(1);
    expect(await db.auditEvent.count({ where: { eventType: 'LOAD_RECORDED', entityId: loaded.load!.id } })).toBe(1);
  });
  it('rejects missing reasons, OTHER without a useful note, invalid quantities and injected identity without any writes', async () => {
    const stop = normal.stops.find(item => item.order.id === base.shortfallOrder.id)!, before = await snapshot(base.depot.id);
    for (const changes of [{ loadedUnits: 188 }, { loadedUnits: 188, reasonCode: 'OTHER' }, { loadedUnits: 188, reasonCode: 'OTHER', note: '   a ' },
      { loadedUnits: 0 }, { loadedUnits: -1 }, { loadedUnits: 192.5 }, { loadedUnits: 193 }, { loadedUnits: 188, reasonCode: 'UNKNOWN' },
      { loadedUnits: 188, reasonCode: 'STOCK_UNAVAILABLE', actorUserId: base.dispatcher.id }, { loadedUnits: 188, reasonCode: 'OTHER', note: 'x'.repeat(451) }]) {
      expect((await loader.post(`/api/loader/stops/${stop.id}/load`).send(loadBody(normal, stop, changes))).status).toBe(400);
    }
    expect(await snapshot(base.depot.id)).toBe(before);
  });
  it('persists the 192→188 shortfall, its real exception, and separate ordered and loaded facts', async () => {
    const stop = normal.stops.find(item => item.order.id === base.shortfallOrder.id)!;
    normal = await load(normal, stop.id, { loadedUnits: 188, reasonCode: 'STOCK_UNAVAILABLE', note: 'Four units unavailable at loading.' });
    const current = normal.stops.find(item => item.id === stop.id)!;
    expect(current.load).toMatchObject({ expectedUnits: 192, loadedUnits: 188, status: 'EXCEPTION', reviewStatus: 'PENDING', reasonCode: 'STOCK_UNAVAILABLE' });
    expect(current.order.orderedUnits).toBe(192); expect(current.order.status).toBe('LOADING_EXCEPTION'); expect(normal.canMarkReady).toBe(false);
    shortfallExceptionId = current.exceptions.find(item => item.type === 'LOADING_SHORTFALL')!.id;
    const persisted = await db.exception.findUniqueOrThrow({ where: { id: shortfallExceptionId } });
    expect(persisted).toMatchObject({ orderId: stop.order.id, tripId: normal.id, loadRecordId: current.load!.id, status: 'OPEN' });
    expect((await db.order.findUniqueOrThrow({ where: { id: stop.order.id } })).orderedUnits).toBe(192);
    const tracked = await store.get(`/api/store/orders/${stop.order.id}`);
    expect(tracked.status).toBe(200); expect(tracked.body).toMatchObject({ orderedUnits: 192, loadedUnits: 188 });
    const reviewDetail = await dispatcher.get(`/api/dispatcher/exceptions/${shortfallExceptionId}`);
    expect(reviewDetail.status).toBe(200);
    expect((reviewDetail.body as DispatcherExceptionDetail).loadingShortfall).toMatchObject({ expectedUnits: 192, loadedUnits: 188, tripId: normal.id, loadRecordId: current.load!.id, canReview: true });
    expect((await dispatcher.get(`/api/dispatcher/exceptions?date=${base.serviceDate}&type=LOADING_SHORTFALL`)).body.exceptions.map((item: { id: string }) => item.id)).toContain(shortfallExceptionId);
  });
  it('keeps unreviewed shortfalls blocked and prevents Loader/Store/Driver from approving them', async () => {
    const stop = normal.stops.find(item => item.order.id === base.shortfallOrder.id)!, before = await snapshot(base.depot.id);
    expect((await loader.post(`/api/loader/trips/${normal.id}/ready`).send({ expectedTripVersion: normal.version })).status).toBe(409);
    for (const agent of [loader, driver, store]) expect((await agent.post(`/api/dispatcher/exceptions/${shortfallExceptionId}/review-load`).send(reviewBody(normal, stop, 'APPROVE'))).status).toBe(403);
    const assignment = await db.userDepot.findUniqueOrThrow({ where: { userId_depotId: { userId: base.dispatcher.id, depotId: base.depot.id } } });
    await db.userDepot.delete({ where: { userId_depotId: { userId: base.dispatcher.id, depotId: base.depot.id } } });
    try { expect([403, 404]).toContain((await dispatcher.post(`/api/dispatcher/exceptions/${shortfallExceptionId}/review-load`).send(reviewBody(normal, stop, 'APPROVE'))).status); }
    finally { await db.userDepot.create({ data: assignment }); }
    expect(await snapshot(base.depot.id)).toBe(before);
  });
  it('approves the same exception transactionally, retains 192/188, and propagates the review on reload', async () => {
    const stop = normal.stops.find(item => item.order.id === base.shortfallOrder.id)!;
    normal = await review(normal, stop, 'APPROVE');
    const approved = (await detail(normal.id)).stops.find(item => item.id === stop.id)!;
    expect(approved.load).toMatchObject({ expectedUnits: 192, loadedUnits: 188, status: 'COMPLETE', reviewStatus: 'APPROVED', reviewedByUserId: base.dispatcher.id });
    expect(approved.loadingState).toBe('APPROVED_REVISION'); expect(approved.order.orderedUnits).toBe(192);
    expect((await db.exception.findUniqueOrThrow({ where: { id: shortfallExceptionId } })).status).toBe('RESOLVED');
    expect((await dispatcher.get(`/api/dispatcher/exceptions/${shortfallExceptionId}`)).body.loadingShortfall).toMatchObject({ reviewStatus: 'APPROVED', loadedUnits: 188, canReview: false });
    expect(await db.auditEvent.count({ where: { eventType: 'MANIFEST_REVISION_APPROVED', entityId: approved.load!.id } })).toBe(1);
  });
  it('marks an approved complete manifest ready and handles duplicate readiness without duplicate audit or departure', async () => {
    normal = await completeRemaining(normal);
    const ready = await loader.post(`/api/loader/trips/${normal.id}/ready`).send({ expectedTripVersion: normal.version });
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    normal = ready.body as LoaderTripDetail;
    expect(normal.status).toBe('READY_FOR_DISPATCH'); expect(normal.loadingState).toBe('READY_FOR_DISPATCH');
    expect((await detail(normal.id)).status).toBe('READY_FOR_DISPATCH');
    const before = await snapshot(base.depot.id);
    expect((await loader.post(`/api/loader/trips/${normal.id}/ready`).send({ expectedTripVersion: normal.version })).status).toBe(200);
    expect(await snapshot(base.depot.id)).toBe(before);
    const stored = await db.trip.findUniqueOrThrow({ where: { id: normal.id } });
    expect(stored.actualDeparture).toBeNull(); expect(stored.status).not.toBe('IN_TRANSIT');
    const stop = normal.stops[0];
    expect((await loader.post(`/api/loader/stops/${stop.id}/load`).send(loadBody(normal, stop))).status).toBe(409);
    expect(await snapshot(base.depot.id)).toBe(before);
  });
  it('persists readiness for an entirely normal manifest without any revision review', async () => {
    const tripId = released.trips.find(trip => trip.id !== normal.id)!.id;
    const current = await completeRemaining(await detail(tripId));
    expect(current.stops.every(stop => stop.load?.loadedUnits === stop.order.orderedUnits && stop.load.reviewStatus === 'NOT_REQUIRED')).toBe(true);
    expect(current.canMarkReady).toBe(true);
    const response = await loader.post(`/api/loader/trips/${tripId}/ready`).send({ expectedTripVersion: current.version });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect((await detail(tripId)).status).toBe('READY_FOR_DISPATCH');
    expect(await db.auditEvent.count({ where: { eventType: 'READY_FOR_DISPATCH', entityType: 'TRIP', entityId: tripId } })).toBe(1);
  });
  it('preserves fixture and loading history when judge setup is repeated', async () => {
    const before = await snapshot(base.depot.id), again = await installLoaderFixture(db);
    expect(again.shortfallOrder.id).toBe(base.shortfallOrder.id); expect(again.shortfallOrder.orderedUnits).toBe(192);
    expect(await snapshot(base.depot.id)).toBe(before);
  });
  it('preserves rejection and blocks readiness until the Loader records a reviewed correction', async () => {
    const prepared = await releasedFixture('REJECT');
    let current = prepared.trip;
    const selected = current.stops.find(stop => stop.order.id === prepared.fixture.shortfallOrder.id)!;
    current = await load(current, selected.id, { loadedUnits: 188, reasonCode: 'COUNT_MISMATCH' });
    const pending = current.stops.find(stop => stop.id === selected.id)!, exceptionId = pending.exceptions.find(item => item.status !== 'RESOLVED')!.id;
    current = await review(current, pending, 'REJECT');
    expect(current.stops.find(stop => stop.id === selected.id)!.load!.reviewStatus).toBe('REJECTED');
    expect((await loader.post(`/api/loader/trips/${current.id}/ready`).send({ expectedTripVersion: current.version })).status).toBe(409);
    expect((await db.order.findUniqueOrThrow({ where: { id: selected.order.id } })).orderedUnits).toBe(192);
    expect(await db.auditEvent.count({ where: { eventType: 'MANIFEST_REVISION_REJECTED', entityId: pending.load!.id } })).toBe(1);
    current = await load(current, selected.id);
    expect(current.stops.find(stop => stop.id === selected.id)!.load).toMatchObject({ loadedUnits: 192, reviewStatus: 'NOT_REQUIRED' });
    expect(await db.exception.findUnique({ where: { id: exceptionId } })).toBeTruthy();
    const retained = await dispatcher.get(`/api/dispatcher/exceptions/${exceptionId}`);
    expect(retained.body.loadingShortfall).toMatchObject({ expectedUnits: 192, loadedUnits: 188, reviewStatus: 'REJECTED', reasonCode: 'COUNT_MISMATCH', canReview: false });
    current = await completeRemaining(current);
    expect((await loader.post(`/api/loader/trips/${current.id}/ready`).send({ expectedTripVersion: current.version })).status).toBe(200);
    const history = await db.auditEvent.findMany({ where: { entityId: pending.load!.id } });
    expect(history.some(item => item.eventType === 'MANIFEST_REVISION_REJECTED')).toBe(true);
  }, 30000);
  it('accepts a useful OTHER note and the damaged-stock reason as real separate shortfalls', async () => {
    const prepared = await releasedFixture('REASONS');
    let current = prepared.trip;
    const selected = current.stops.find(stop => stop.order.id === prepared.fixture.shortfallOrder.id)!;
    current = await load(current, selected.id, { loadedUnits: 188, reasonCode: 'OTHER', note: 'A sealed carton is held for verification.' });
    expect(current.stops.find(stop => stop.id === selected.id)!.load).toMatchObject({ reasonCode: 'OTHER', reviewStatus: 'PENDING', note: 'A sealed carton is held for verification.' });
    const second = current.stops.find(stop => stop.id !== selected.id)!;
    current = await load(current, second.id, { loadedUnits: second.order.orderedUnits - 1, reasonCode: 'DAMAGED_BEFORE_LOADING' });
    expect(current.stops.find(stop => stop.id === second.id)!.load!.reasonCode).toBe('DAMAGED_BEFORE_LOADING');
    expect(current.canMarkReady).toBe(false);
  }, 30000);
});

describe('Optimistic concurrency, read safety and atomicity', () => {
  it('rejects stale trip, order, stop and load versions without writing any partial facts', async () => {
    const prepared = await releasedFixture('STALE'), stop = prepared.trip.stops[0], before = await snapshot(prepared.fixture.depot.id);
    for (const changes of [{ expectedTripVersion: prepared.trip.version + 1 }, { expectedOrderVersion: stop.order.version + 1 },
      { expectedStopUpdatedAt: '2000-01-01T00:00:00.000Z' }, { expectedLoadRevision: 1 }]) {
      expect((await loader.post(`/api/loader/stops/${stop.id}/load`).send(loadBody(prepared.trip, stop, changes))).status).toBe(409);
    }
    expect(await snapshot(prepared.fixture.depot.id)).toBe(before);
    const responses = await Promise.all([loader.post(`/api/loader/stops/${stop.id}/load`).send(loadBody(prepared.trip, stop)),
      loader.post(`/api/loader/stops/${stop.id}/load`).send(loadBody(prepared.trip, stop))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(await db.loadRecord.count({ where: { tripStopId: stop.id } })).toBe(1);
    const loaded = await db.loadRecord.findUniqueOrThrow({ where: { tripStopId: stop.id } });
    expect(await db.auditEvent.count({ where: { entityId: loaded.id, eventType: 'LOAD_RECORDED' } })).toBe(1);
  }, 30000);
  it('rejects stale Dispatcher reviews and malformed decision requests without side effects', async () => {
    const prepared = await releasedFixture('STALE-REVIEW'), selected = prepared.trip.stops.find(stop => stop.order.id === prepared.fixture.shortfallOrder.id)!;
    const current = await load(prepared.trip, selected.id, { loadedUnits: 188, reasonCode: 'STOCK_UNAVAILABLE' });
    const stop = current.stops.find(item => item.id === selected.id)!, exception = stop.exceptions[0], before = await snapshot(prepared.fixture.depot.id);
    for (const changes of [{ expectedTripVersion: current.version + 1 }, { expectedOrderVersion: stop.order.version + 1 }, { expectedLoadRevision: stop.load!.revision + 1 }]) {
      expect((await dispatcher.post(`/api/dispatcher/exceptions/${exception.id}/review-load`).send({ ...reviewBody(current, stop, 'APPROVE'), ...changes })).status).toBe(409);
    }
    expect((await dispatcher.post(`/api/dispatcher/exceptions/${exception.id}/review-load`).send({ ...reviewBody(current, stop, 'APPROVE'), decision: 'AUTO_APPROVE' })).status).toBe(400);
    expect(await snapshot(prepared.fixture.depot.id)).toBe(before);
  }, 30000);
  it('performs no operational writes on Loader and Dispatcher reads', async () => {
    const before = await snapshot(base.depot.id);
    await loader.get(`/api/loader/loads?date=${base.serviceDate}`); await detail(normal.id);
    await dispatcher.get(`/api/dispatcher/exceptions/${shortfallExceptionId}`);
    expect(await snapshot(base.depot.id)).toBe(before);
  });
  it.each(['load', 'review', 'ready'] as const)('rolls back the complete %s mutation if audit persistence fails', async action => {
    const prepared = await releasedFixture(`ROLLBACK-${action.toUpperCase()}`);
    let current = prepared.trip;
    const selected = current.stops.find(stop => stop.order.id === prepared.fixture.shortfallOrder.id)!;
    if (action === 'review') current = await load(current, selected.id, { loadedUnits: 188, reasonCode: 'STOCK_UNAVAILABLE' });
    if (action === 'ready') current = await completeRemaining(current);
    const eventType = action === 'load' ? 'LOAD_RECORDED' : action === 'review' ? 'MANIFEST_REVISION_APPROVED' : 'READY_FOR_DISPATCH';
    await db.$executeRawUnsafe(`CREATE FUNCTION waypoint_test_loader_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"::text = '${eventType}' THEN RAISE EXCEPTION 'Synthetic Loader audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER "Test_loader_audit_failure" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION waypoint_test_loader_audit_failure()');
    const before = await snapshot(prepared.fixture.depot.id);
    try {
      const stop = current.stops.find(item => item.id === selected.id)!;
      const response = action === 'load' ? await loader.post(`/api/loader/stops/${stop.id}/load`).send(loadBody(current, stop))
        : action === 'review' ? await dispatcher.post(`/api/dispatcher/exceptions/${stop.exceptions[0].id}/review-load`).send(reviewBody(current, stop, 'APPROVE'))
          : await loader.post(`/api/loader/trips/${current.id}/ready`).send({ expectedTripVersion: current.version });
      expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(await snapshot(prepared.fixture.depot.id)).toBe(before);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER "Test_loader_audit_failure" ON "AuditEvent"');
      await db.$executeRawUnsafe('DROP FUNCTION waypoint_test_loader_audit_failure()');
    }
  }, 30000);
});
