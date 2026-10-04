import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { PlanningRunDetail } from '@waypoint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { dateOnly, weekStart } from '../domain/dates.js';
import { transitionOrder } from '../domain/lifecycle.js';
import { addBusinessDays } from '../store/testing/synthetic.js';
import { installPlanningFixture, PLANNING_SYNTHETIC_DATE, type PlanningFixture } from './testing/synthetic.js';

if (!process.env.ALLOCATION_TEST_DATABASE_URL) throw new Error('Run npm run test; allocation tests require a separate isolated PostgreSQL database.');
const db = new PrismaClient({ datasources: { db: { url: process.env.ALLOCATION_TEST_DATABASE_URL } } });
const config = readConfig({ ...process.env, DATABASE_URL: process.env.ALLOCATION_TEST_DATABASE_URL, NODE_ENV: 'test',
  STORE_ALLOW_SYNTHETIC: 'false', PLANNING_ALLOW_SYNTHETIC: 'false' });
const app = createApp(db, config, { store: { allowSyntheticReferences: true, now: () => new Date('2040-03-04T10:00:00Z') },
  planning: { allowSyntheticReferences: true, now: () => new Date('2026-10-03T12:00:00Z') },
  dispatcher: { demoDate: PLANNING_SYNTHETIC_DATE } });
const dispatcher = request.agent(app), store = request.agent(app), loader = request.agent(app), driver = request.agent(app);
let base: PlanningFixture;
const path = '/api/dispatcher/plans';
const requestBody = (fixture: PlanningFixture, changes: Record<string, unknown> = {}) => ({ serviceDate: fixture.serviceDate, depotId: fixture.depot.id, ...changes });
async function fixture(key: string) { return installPlanningFixture(db, { key, assignStore: false }); }
async function generate(fixture: PlanningFixture, changes: Record<string, unknown> = {}): Promise<PlanningRunDetail> {
  const response = await dispatcher.post(path).send(requestBody(fixture, changes));
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as PlanningRunDetail;
}
async function validate(run: PlanningRunDetail): Promise<PlanningRunDetail> {
  const response = await dispatcher.post(`${path}/${run.id}/validate`).send({ expectedVersion: run.version });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.validation).toMatchObject({ valid: true, issues: [] });
  return response.body as PlanningRunDetail;
}
async function snapshot(depotId: string) {
  const [orders, runs, trips, stops, allocations, deferrals, fuel, audits] = await Promise.all([
    db.order.findMany({ where: { outlet: { depotId } }, orderBy: { id: 'asc' } }),
    db.planningRun.findMany({ where: { depotId }, orderBy: { id: 'asc' } }),
    db.trip.findMany({ where: { vehicle: { depotId } }, orderBy: { id: 'asc' } }),
    db.tripStop.findMany({ where: { trip: { vehicle: { depotId } } }, orderBy: { id: 'asc' } }),
    db.allocation.findMany({ where: { order: { outlet: { depotId } } }, orderBy: { id: 'asc' } }),
    db.deferralRecord.findMany({ where: { order: { outlet: { depotId } } }, orderBy: { id: 'asc' } }),
    db.fuelUsage.findMany({ where: { ledger: { vehicle: { depotId } } }, orderBy: { id: 'asc' } }),
    db.auditEvent.findMany({ orderBy: { id: 'asc' } })
  ]);
  return JSON.stringify({ orders, runs, trips, stops, allocations, deferrals, fuel, audits });
}
beforeAll(async () => {
  base = await installPlanningFixture(db, { key: 'API' });
  for (const [agent, name] of [[dispatcher, 'dispatcher'], [store, 'store'], [loader, 'loader'], [driver, 'driver']] as const) {
    expect((await agent.post('/api/auth/login').send({ email: `${name}@waypoint.local`, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
  }
});
afterAll(async () => { await db.$disconnect(); });

describe('Scoped authenticated planning transport', () => {
  it('denies unauthenticated and every other role on generation, reads, validation and release', async () => {
    expect((await request(app).post(path).send(requestBody(base))).status).toBe(401);
    for (const agent of [store, loader, driver]) {
      expect((await agent.post(path).send(requestBody(base))).status).toBe(403);
      expect((await agent.get(`${path}?date=${base.serviceDate}&depotId=${base.depot.id}`)).status).toBe(403);
      expect((await agent.get(`${path}/${randomUUID()}`)).status).toBe(403);
      for (const action of ['validate', 'release']) expect((await agent.post(`${path}/${randomUUID()}/${action}`).send({ expectedVersion: 1 })).status).toBe(403);
    }
  });
  it('rejects foreign depots and ownership/role injection without creating a run', async () => {
    const before = await snapshot(base.depot.id);
    expect((await dispatcher.post(path).send(requestBody(base, { depotId: base.foreignDepot.id }))).status).toBe(403);
    for (const field of ['role', 'actorUserId', 'status', 'allocations']) {
      expect((await dispatcher.post(path).send(requestBody(base, { [field]: field === 'allocations' ? [] : fixture.name }))).status).toBe(400);
    }
    expect(await snapshot(base.depot.id)).toBe(before);
  });
  it('fails closed without current depot assignments', async () => {
    const assignments = await db.userDepot.findMany({ where: { userId: base.dispatcher.id } });
    await db.userDepot.deleteMany({ where: { userId: base.dispatcher.id } });
    try { expect((await dispatcher.post(path).send(requestBody(base))).status).toBe(403); }
    finally { await db.userDepot.createMany({ data: assignments.map(row => ({ userId: row.userId, depotId: row.depotId })) }); }
  });
  it('requires an explicit non-production opt-in for synthetic planning provenance', async () => {
    const denied = request.agent(createApp(db, config));
    expect((await denied.post('/api/auth/login').send({ email: 'dispatcher@waypoint.local', password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
    expect((await denied.post(path).send(requestBody(base))).status).toBe(409);
    expect(await db.planningRun.count({ where: { depotId: base.depot.id } })).toBe(0);
    expect(() => readConfig({ ...process.env, NODE_ENV: 'production', WEB_ORIGIN: 'https://example.test', STORE_ALLOW_SYNTHETIC: 'false', PLANNING_ALLOW_SYNTHETIC: 'true' })).toThrow(/Synthetic planning/);
  });
  it('rejects nonoperating/absent calendar generation with no partial writes', async () => {
    const before = await snapshot(base.depot.id);
    for (const serviceDate of [addBusinessDays(base.serviceDate, 1), '2041-06-01']) {
      expect((await dispatcher.post(path).send(requestBody(base, { serviceDate }))).status).toBe(409);
    }
    expect((await dispatcher.post(path).send(requestBody(base, { serviceDate: '2040-02-30' }))).status).toBe(400);
    expect(await snapshot(base.depot.id)).toBe(before);
  });
  it('does not leak foreign or missing planning run IDs', async () => {
    const foreign = await db.planningRun.create({ data: { planningRef: 'SYN-PLAN-FOREIGN-PRIVATE', depotId: base.foreignDepot.id,
      serviceDate: dateOnly(base.serviceDate), strategyVersion: 'deterministic-depot-v1', generatedAt: new Date(), revision: 1 } });
    const denied = await dispatcher.get(`${path}/${foreign.id}`), missing = await dispatcher.get(`${path}/${randomUUID()}`);
    expect(denied.status).toBe(404); expect(denied.body).toEqual(missing.body);
    for (const action of ['validate', 'release']) expect((await dispatcher.post(`${path}/${foreign.id}/${action}`).send({ expectedVersion: 1 })).status).toBe(404);
    expect((await dispatcher.get(`${path}?date=${base.serviceDate}&depotId=${base.foreignDepot.id}`)).status).toBe(403);
    expect((await dispatcher.get(`${path}/invalid`)).status).toBe(400);
  });
});

describe('Real persisted generation, independent validation and transactional release', () => {
  it('keeps the same Store order through preview, validation, release and all role reads', async () => {
    const created = await store.post('/api/store/orders').send({ requestedDeliveryDate: base.serviceDate, temperatureRequirement: 'CHILLED',
      orderedUnits: 37, orderedWeightKg: 41.25, orderedVolumeM3: 0.75 });
    expect(created.status).toBe(201);
    const future = await store.post('/api/store/orders').send({ requestedDeliveryDate: addBusinessDays(base.serviceDate, 2), temperatureRequirement: 'AMBIENT',
      orderedUnits: 11, orderedWeightKg: 12, orderedVolumeM3: 0.12 });
    expect(future.status).toBe(201);
    const initialFacts = await db.order.findUniqueOrThrow({ where: { id: created.body.id } });
    const context = await dispatcher.get(`/api/dispatcher/planning-context?date=${base.serviceDate}`);
    expect(context.status).toBe(200);
    expect(context.body.orders.map((order: { id: string }) => order.id)).toContain(created.body.id);
    expect(context.body.orders.map((order: { id: string }) => order.id)).not.toContain(future.body.id);
    const run = await generate(base);
    expect(run).toMatchObject({ status: 'DRAFT', version: 1, revision: 1, canRelease: false, summary: { eligibleOrders: 13 } });
    expect(run.summary.served).toBeGreaterThan(0); expect(run.summary.deferred).toBeGreaterThan(0);
    expect(run.summary.served + run.summary.deferred).toBe(13);
    writeFileSync(resolve('.local/m5-judge-benchmark.json'), JSON.stringify(run.summary, null, 2));
    console.info(`SYNTHETIC persisted judge: ${run.summary.eligibleOrders} eligible / ${run.summary.served} served / ${run.summary.deferred} deferred / ${run.summary.trips} trips / generation ${run.summary.generationDurationMs.toFixed(1)}ms`);
    expect(run.decisions.map(decision => decision.order.id)).not.toContain(base.orders.FOREIGN.id);
    expect(run.decisions.map(decision => decision.order.id)).not.toContain(future.body.id);
    expect(new Set(run.decisions.map(decision => decision.order.id)).size).toBe(13);
    const decision = run.decisions.find(item => item.order.id === created.body.id)!;
    expect(decision.decision).toBe('ASSIGNED'); expect(decision.order.orderRef).toBe(created.body.orderRef);
    expect(run.trips.every(trip => trip.status === 'DRAFT')).toBe(true);
    for (const trip of run.trips) {
      expect((await loader.get(`/api/domain/trips/${trip.id}`)).status).toBe(403);
      expect(trip.capacity.weight).toMatchObject({ used: trip.orderedWeightKg }); expect(trip.capacity.volume).toMatchObject({ used: trip.orderedVolumeM3 });
      expect(trip.stops.map(stop => stop.sequence)).toEqual(trip.stops.map((_stop, index) => index + 1));
    }
    expect((await db.order.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe('CLOSED_FOR_PLANNING');
    for (const item of run.decisions.filter(item => item.decision === 'DEFERRED')) {
      expect(item.tripId).toBeNull(); expect(item.reasonCode).toBeTruthy();
      expect(await db.deferralRecord.count({ where: { orderId: item.order.id, planningRunId: run.id } })).toBe(1);
      expect(await db.tripStop.count({ where: { orderId: item.order.id, active: true } })).toBe(0);
    }
    expect(await db.deferralRecord.count({ where: { orderId: base.orders['PREVIOUSLY-DEFERRED'].id } })).toBeGreaterThanOrEqual(2);
    const unvalidatedSnapshot = await snapshot(base.depot.id);
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: run.version })).status).toBe(409);
    expect(await snapshot(base.depot.id)).toBe(unvalidatedSnapshot);
    const valid = await validate(run);
    expect(valid).toMatchObject({ status: 'VALIDATED', canRelease: true });
    expect(valid.decisions.find(item => item.order.id === created.body.id)?.order.id).toBe(created.body.id);
    expect(valid.trips.every(trip => trip.status === 'PLANNED')).toBe(true);
    for (const trip of valid.trips) expect((await loader.get(`/api/domain/trips/${trip.id}`)).status).toBe(403);
    expect((await db.order.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe('PLANNED');
    const response = await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const released = response.body as PlanningRunDetail;
    expect(released).toMatchObject({ status: 'RELEASED', canRelease: false, canRegenerate: false });
    expect(released.trips.every(trip => trip.status === 'RELEASED')).toBe(true);
    const persisted = await db.order.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(persisted).toMatchObject({ status: 'RELEASED_TO_LOADING', orderedUnits: 37 });
    expect(persisted.requestedDeliveryDate).toEqual(initialFacts.requestedDeliveryDate); expect(persisted.eligibleDeliveryDate).toEqual(initialFacts.eligibleDeliveryDate);
    expect(persisted.orderedWeightKg.toString()).toBe('41.25'); expect(persisted.orderedVolumeM3.toString()).toBe('0.75');
    const reservations = await db.fuelUsage.findMany({ where: { tripId: { in: released.trips.map(trip => trip.id) }, kind: 'RESERVED', status: 'ACTIVE' }, include: { ledger: true } });
    expect(reservations).toHaveLength(released.trips.length);
    for (const row of reservations) {
      expect(row.ledger.weekStart).toEqual(weekStart(base.serviceDate));
      expect(weekStart(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(row.occurredAt))).toEqual(row.ledger.weekStart);
      expect(row.litres.toString()).toBe(released.trips.find(trip => trip.id === row.tripId)!.estimatedFuelLitres);
    }
    expect(released.decisions.find(item => item.order.id === created.body.id)?.order.id).toBe(created.body.id);
    for (const trip of released.trips) {
      const readable = await loader.get(`/api/domain/trips/${trip.id}`);
      expect(readable.status).toBe(200); expect(readable.body.data).toMatchObject({ id: trip.id, status: 'RELEASED' });
    }
    await db.userDepot.delete({ where: { userId_depotId: { userId: base.loader.id, depotId: base.depot.id } } });
    try { expect((await loader.get(`/api/domain/trips/${released.trips[0].id}`)).status).toBe(403); }
    finally { await db.userDepot.create({ data: { userId: base.loader.id, depotId: base.depot.id } }); }
    expect((await store.get(`/api/store/orders/${created.body.id}`)).body.id).toBe(created.body.id);
    expect((await dispatcher.get(`/api/dispatcher/orders/${created.body.id}`)).body.id).toBe(created.body.id);
    const pulse = await dispatcher.get(`/api/dispatcher/pulse?date=${base.serviceDate}`);
    expect(pulse.body.metrics.loadingReady).toBeGreaterThanOrEqual(run.summary.served);
    const audits = await db.auditEvent.findMany({ where: { entityId: run.id }, orderBy: { timestamp: 'asc' } });
    expect(audits.map(row => row.eventType).sort()).toEqual(['PLAN_GENERATED', 'PLAN_RELEASED', 'PLAN_VALIDATED']);
    expect(audits.every(row => row.actorUserId === base.dispatcher.id && row.actorRole === 'DISPATCHER')).toBe(true);
    const releasedSnapshot = await snapshot(base.depot.id);
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: released.version })).status).toBe(409);
    expect((await dispatcher.post(path).send(requestBody(base, { expectedRunId: run.id, expectedVersion: released.version }))).status).toBe(409);
    expect(await snapshot(base.depot.id)).toBe(releasedSnapshot);
    const detail = await dispatcher.get(`${path}/${run.id}`);
    expect(detail.status).toBe(200); expect(detail.body.status).toBe('RELEASED'); expect(detail.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(detail.body)).not.toMatch(/passwordHash|tokenHash|AUTH_SECRET|photoStorageKey|signatureStorageKey/);
  }, 30000);
  it('regenerates only its own unreleased draft and reconsiders every prior decision without deleting history', async () => {
    const prepared = await fixture('REGEN'), first = await generate(prepared), validated = await validate(first);
    const formerlyDeferred = first.decisions.filter(item => item.decision === 'DEFERRED');
    expect(formerlyDeferred.length).toBeGreaterThan(0);
    expect(formerlyDeferred.every(item => item.nextEligibleDate && item.nextEligibleDate > prepared.serviceDate)).toBe(true);
    const oldAllocationIds = (await db.allocation.findMany({ where: { planningRunId: first.id } })).map(row => row.id);
    const oldDeferrals = await db.deferralRecord.findMany({ where: { planningRunId: first.id }, orderBy: { id: 'asc' } });
    const next = await generate(prepared, { expectedRunId: first.id, expectedVersion: validated.version });
    expect(next).toMatchObject({ revision: 2, status: 'DRAFT' });
    expect(next.decisions.map(item => item.order.id).sort()).toEqual(first.decisions.map(item => item.order.id).sort());
    for (const item of formerlyDeferred) expect(next.decisions.some(decision => decision.order.id === item.order.id)).toBe(true);
    const previous = await db.planningRun.findUniqueOrThrow({ where: { id: first.id } });
    expect(previous.status).toBe('SUPERSEDED'); expect(previous.supersededAt).not.toBeNull();
    expect((await db.trip.findMany({ where: { planningRunId: first.id } })).every(trip => trip.status === 'CANCELLED')).toBe(true);
    expect(await db.tripStop.count({ where: { trip: { planningRunId: first.id }, active: true } })).toBe(0);
    expect((await db.allocation.findMany({ where: { planningRunId: first.id } })).map(row => row.id).sort()).toEqual(oldAllocationIds.sort());
    expect(await db.deferralRecord.findMany({ where: { planningRunId: first.id }, orderBy: { id: 'asc' } })).toEqual(oldDeferrals);
    expect(await db.fuelUsage.count({ where: { trip: { planningRunId: first.id }, status: 'ACTIVE', kind: 'RESERVED' } })).toBe(0);
    for (const item of next.decisions.filter(item => item.decision === 'ASSIGNED')) expect(await db.tripStop.count({ where: { orderId: item.order.id, active: true } })).toBe(1);
    const listing = await dispatcher.get(`${path}?date=${prepared.serviceDate}&depotId=${prepared.depot.id}&limit=1&page=1`);
    expect(listing.status).toBe(200); expect(listing.body).toMatchObject({ total: 2, latestActiveId: next.id, page: 1, limit: 1 });
    expect(listing.body.runs[0].id).toBe(next.id);
  }, 30000);
  it('excludes terminal, future-deferred and actively assigned demand and counts existing trip slots', async () => {
    const prepared = await fixture('ELIGIBILITY');
    const excluded = [['CHILLED', 'DELIVERED'], ['FROZEN', 'RECEIPT_CONFIRMED'], ['VAN-NEW', 'AWAITING_RECEIPT'], ['TECH', 'DRAFT']] as const;
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('waypoint.lifecycle', 'on', true)`;
      for (const [name, status] of excluded) await tx.order.update({ where: { id: prepared.orders[name].id }, data: { status, version: { increment: 1 } } });
    });
    await transitionOrder(db, { actorUserId: prepared.dispatcher.id, orderId: prepared.orders['VAN-EXCESS'].id,
      expectedVersion: prepared.orders['VAN-EXCESS'].version, next: 'DEFERRED', deferral: { reasonCode: 'CAPACITY',
        reasonDetail: 'SYNTHETIC future backlog eligibility boundary.', nextEligibleDate: addBusinessDays(prepared.serviceDate, 2) } }, { allowSyntheticReferences: true });
    const existingOrder = await transitionOrder(db, { actorUserId: prepared.dispatcher.id, orderId: prepared.orders['NEWER-AMBIENT'].id,
      expectedVersion: prepared.orders['NEWER-AMBIENT'].version, next: 'CLOSED_FOR_PLANNING' }, { allowSyntheticReferences: true });
    const existingRun = await db.planningRun.create({ data: { planningRef: 'SYN-PLAN-ELIGIBILITY-PREPARED', depotId: prepared.depot.id,
      serviceDate: dateOnly(prepared.serviceDate), status: 'VALIDATED', validatedAt: new Date() } });
    const existingTrip = await db.trip.create({ data: { tripRef: 'SYN-PLAN-ELIGIBILITY-PREPARED-1', vehicleId: prepared.vehicles.AMBIENT.id,
      serviceDate: dateOnly(prepared.serviceDate), tripNumber: 1, status: 'PLANNED', plannedDeparture: new Date(`${prepared.serviceDate}T00:00:00+05:30`),
      plannedReturn: new Date(`${prepared.serviceDate}T04:00:00+05:30`) } });
    const existingStop = await db.tripStop.create({ data: { tripId: existingTrip.id, orderId: existingOrder.id, sequence: 1 } });
    await db.allocation.create({ data: { planningRunId: existingRun.id, orderId: existingOrder.id, decision: 'ASSIGNED', tripStopId: existingStop.id } });
    const planned = await transitionOrder(db, { actorUserId: prepared.dispatcher.id, orderId: existingOrder.id,
      expectedVersion: existingOrder.version, next: 'PLANNED' }, { allowSyntheticReferences: true });
    await db.planningRun.update({ where: { id: existingRun.id }, data: { status: 'RELEASED', releasedAt: new Date() } });
    await db.trip.update({ where: { id: existingTrip.id }, data: { status: 'RELEASED' } });
    await transitionOrder(db, { actorUserId: prepared.dispatcher.id, orderId: planned.id,
      expectedVersion: planned.version, next: 'RELEASED_TO_LOADING' }, { allowSyntheticReferences: true });
    await db.trip.create({ data: { tripRef: 'SYN-PLAN-ELIGIBILITY-PREPARED-2', vehicleId: prepared.vehicles.AMBIENT.id,
      serviceDate: dateOnly(prepared.serviceDate), tripNumber: 2, status: 'RELEASED', plannedDeparture: new Date(`${prepared.serviceDate}T04:15:00+05:30`),
      plannedReturn: new Date(`${prepared.serviceDate}T05:00:00+05:30`) } });
    const run = await generate(prepared), ids = run.decisions.map(item => item.order.id);
    expect(run.summary.eligibleOrders).toBe(6);
    for (const [name] of excluded) expect(ids).not.toContain(prepared.orders[name].id);
    expect(ids).not.toContain(existingOrder.id); expect(ids).not.toContain(prepared.orders['VAN-EXCESS'].id);
    expect(ids).toContain(prepared.orders['PREVIOUSLY-DEFERRED'].id); expect(ids).toContain(prepared.orders['VAN-OLD'].id);
    expect(run.trips.some(trip => trip.vehicle.id === prepared.vehicles.AMBIENT.id)).toBe(false);
    expect(await db.tripStop.count({ where: { orderId: existingOrder.id, active: true } })).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: existingOrder.id } })).status).toBe('RELEASED_TO_LOADING');
    expect((await validate(run)).validation?.valid).toBe(true);
  }, 30000);
  it('rejects stale order-version actions and missing optimistic version fields', async () => {
    const prepared = await fixture('VERSIONS'), run = await generate(prepared);
    expect((await dispatcher.post(`${path}/${run.id}/validate`).send({ expectedVersion: run.version + 1 })).status).toBe(409);
    expect((await dispatcher.post(`${path}/${run.id}/validate`).send({})).status).toBe(400);
    expect((await dispatcher.post(path).send(requestBody(prepared))).status).toBe(409);
    expect((await dispatcher.post(path).send(requestBody(prepared, { expectedRunId: run.id }))).status).toBe(400);
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: run.version, role: 'DISPATCHER' })).status).toBe(400);
  });
  it('rejects validation and release after a captured order version changes', async () => {
    const prepared = await fixture('STALE-ORDER'), run = await generate(prepared), valid = await validate(run);
    const decision = valid.decisions.find(item => item.decision === 'ASSIGNED')!;
    await db.order.update({ where: { id: decision.order.id }, data: { version: { increment: 1 } } });
    const before = await snapshot(prepared.depot.id);
    expect((await dispatcher.get(`${path}/${run.id}`)).body).toMatchObject({ stale: true, canRelease: false });
    expect((await dispatcher.post(`${path}/${run.id}/validate`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect(await snapshot(prepared.depot.id)).toBe(before);
  });
  it('retains the captured order, outlet and vehicle facts in superseded history', async () => {
    const prepared = await fixture('HISTORY'), first = await generate(prepared), valid = await validate(first);
    await generate(prepared, { expectedRunId: first.id, expectedVersion: valid.version });
    const historical = (await dispatcher.get(`${path}/${first.id}`)).body as PlanningRunDetail;
    expect(historical.status).toBe('SUPERSEDED');
    const order = historical.decisions.find(item => item.decision === 'ASSIGNED')!.order;
    const trip = historical.trips.find(item => item.stops.some(stop => stop.orderId === order.id))!;
    await db.outlet.update({ where: { id: order.outlet.id }, data: { outletRef: 'SYN-PLAN-HISTORY-CHANGED', district: 'SYNTHETIC Changed', deliveryWindowClose: order.outlet.deliveryWindowClose + 1 } });
    await db.vehicle.update({ where: { id: trip.vehicle.id }, data: { vehicleRef: 'SYN-PLAN-HISTORY-CHANGED-VEHICLE', weightCapacityKg: '999', volumeCapacityM3: '99' } });
    await db.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
    const retained = await dispatcher.get(`${path}/${first.id}`);
    expect(retained.status).toBe(200);
    expect(retained.body.decisions).toEqual(historical.decisions);
    expect(retained.body.trips).toEqual(historical.trips);
    expect(retained.body.vehicles).toEqual(historical.vehicles);
  }, 30000);
  it.each(['vehicle', 'availability', 'fuel', 'travel'] as const)('rejects validation/release after %s source facts change', async source => {
    const prepared = await fixture(`STALE-${source.toUpperCase()}`), run = await generate(prepared), valid = await validate(run);
    const vehicle = prepared.vehicles.AMBIENT;
    if (source === 'vehicle') await db.vehicle.update({ where: { id: vehicle.id }, data: { weightCapacityKg: '239' } });
    if (source === 'availability') await db.vehicleAvailability.update({ where: { vehicleId_serviceDate: { vehicleId: vehicle.id, serviceDate: dateOnly(prepared.serviceDate) } }, data: { status: 'UNAVAILABLE', availableFromMinute: null, availableUntilMinute: null } });
    if (source === 'fuel') {
      const ledger = await db.fuelLedger.findUniqueOrThrow({ where: { vehicleId_weekStart: { vehicleId: vehicle.id, weekStart: weekStart(prepared.serviceDate) } } });
      await db.fuelUsage.create({ data: { ledgerId: ledger.id, kind: 'CONSUMED', litres: '0.001', source: 'SYNTHETIC', occurredAt: new Date(`${prepared.serviceDate}T00:00:00Z`), recordedByUserId: prepared.dispatcher.id } });
    }
    if (source === 'travel') await db.districtTravel.update({ where: { depotId_district: { depotId: prepared.depot.id, district: 'SYNTHETIC Alpha' } }, data: { depotMinutes: '21' } });
    expect((await dispatcher.get(`${path}/${run.id}`)).body).toMatchObject({ stale: true, canRelease: false });
    const before = await snapshot(prepared.depot.id);
    expect((await dispatcher.post(`${path}/${run.id}/validate`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect(await snapshot(prepared.depot.id)).toBe(before);
  }, 30000);
  it('detects new eligible demand after validation and requires regeneration before release', async () => {
    const prepared = await fixture('NEW-DEMAND'), run = await generate(prepared), valid = await validate(run);
    const created = await db.order.create({ data: { orderRef: 'SYN-PLAN-NEW-DEMAND-ADDED', outletId: prepared.storeOutlet.id,
      requestedDeliveryDate: dateOnly(prepared.serviceDate), eligibleDeliveryDate: dateOnly(prepared.serviceDate), temperatureRequirement: 'AMBIENT', orderedUnits: 5, orderedWeightKg: 1, orderedVolumeM3: '0.01' } });
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('waypoint.lifecycle', 'on', true)`;
      await tx.order.update({ where: { id: created.id }, data: { status: 'CONFIRMED', version: 2, confirmedAt: new Date() } });
    });
    expect((await dispatcher.get(`${path}/${run.id}`)).body.stale).toBe(true);
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version })).status).toBe(409);
  });
  it('independently rejects tampered persisted stop timing and never releases the invalid result', async () => {
    const prepared = await fixture('BAD-TIMING'), run = await generate(prepared), stop = run.trips[0].stops[0];
    await db.tripStop.update({ where: { id: stop.id }, data: { plannedArrival: new Date(new Date(stop.plannedArrival).getTime() - 60000) } });
    const result = await dispatcher.post(`${path}/${run.id}/validate`).send({ expectedVersion: run.version });
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ status: 'DRAFT', validation: { valid: false } });
    expect(result.body.validation.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TIMING' })]));
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: result.body.version })).status).toBe(409);
    expect(await db.order.count({ where: { outlet: { depotId: prepared.depot.id }, status: 'RELEASED_TO_LOADING' } })).toBe(0);
  });
  it('rejects a missing persisted eligible-order decision', async () => {
    const prepared = await fixture('MISSING-DECISION'), run = await generate(prepared);
    const decision = run.decisions.find(item => item.decision === 'DEFERRED')!;
    await db.allocation.delete({ where: { id: decision.id } });
    const result = await dispatcher.post(`${path}/${run.id}/validate`).send({ expectedVersion: run.version });
    expect(result.status).toBe(200); expect(result.body.validation.valid).toBe(false);
    expect(result.body.validation.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'COVERAGE' })]));
  });
  it('rejects a voided own fuel reservation even though it is excluded from the source opening snapshot', async () => {
    const prepared = await fixture('VOID-RESERVATION'), run = await generate(prepared), valid = await validate(run);
    const reservation = await db.fuelUsage.findFirstOrThrow({ where: { trip: { planningRunId: run.id }, kind: 'RESERVED', status: 'ACTIVE' } });
    await db.fuelUsage.update({ where: { id: reservation.id }, data: { status: 'VOIDED' } });
    const before = await snapshot(prepared.depot.id);
    expect((await dispatcher.post(`${path}/${run.id}/validate`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect(await snapshot(prepared.depot.id)).toBe(before);
  });
  it.each(['duplicate', 'estimate', 'consumption'] as const)('rejects a validated plan with %s reservation inconsistency', async change => {
    const prepared = await fixture(`RESERVE-${change.toUpperCase()}`), run = await generate(prepared), valid = await validate(run);
    const reservation = await db.fuelUsage.findFirstOrThrow({ where: { trip: { planningRunId: run.id }, kind: 'RESERVED', status: 'ACTIVE' } });
    if (change === 'estimate') await db.trip.update({ where: { id: reservation.tripId! }, data: { estimatedFuelLitres: reservation.litres.add('0.001') } });
    else await db.fuelUsage.create({ data: { ledgerId: reservation.ledgerId, tripId: reservation.tripId,
      kind: change === 'duplicate' ? 'RESERVED' : 'CONSUMED', litres: '0.001', occurredAt: reservation.occurredAt, source: 'SYNTHETIC', recordedByUserId: prepared.dispatcher.id } });
    const before = await snapshot(prepared.depot.id);
    expect((await dispatcher.get(`${path}/${run.id}`)).body.canRelease).toBe(false);
    expect((await dispatcher.post(`${path}/${run.id}/validate`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect(await snapshot(prepared.depot.id)).toBe(before);
  }, 30000);
  it('enforces the trip vehicle and weekly ledger relationship in PostgreSQL', async () => {
    const prepared = await fixture('RESERVE-LEDGER'), run = await generate(prepared), valid = await validate(run);
    const reservation = await db.fuelUsage.findFirstOrThrow({ where: { trip: { planningRunId: run.id }, kind: 'RESERVED', status: 'ACTIVE' }, include: { ledger: true } });
    const foreignLedger = await db.fuelLedger.findFirstOrThrow({ where: { vehicleId: { not: reservation.ledger.vehicleId }, vehicle: { depotId: prepared.depot.id } } });
    const before = await snapshot(prepared.depot.id);
    await expect(db.fuelUsage.create({ data: { ledgerId: foreignLedger.id, tripId: reservation.tripId, kind: 'RESERVED', litres: '0.001',
      occurredAt: reservation.occurredAt, source: 'SYNTHETIC', recordedByUserId: prepared.dispatcher.id } })).rejects.toThrow(/Fuel trip does not belong/);
    await expect(db.fuelUsage.create({ data: { ledgerId: reservation.ledgerId, tripId: reservation.tripId, kind: 'RESERVED', litres: '0.001',
      occurredAt: new Date(reservation.occurredAt.getTime() + 7 * 86400000), source: 'SYNTHETIC', recordedByUserId: prepared.dispatcher.id } })).rejects.toThrow(/Fuel usage is outside/);
    expect(await snapshot(prepared.depot.id)).toBe(before);
    expect((await dispatcher.get(`${path}/${run.id}`)).body).toMatchObject({ version: valid.version, canRelease: true });
  }, 30000);
  it('rejects release when a validated run trip no longer has the expected planned stage', async () => {
    const prepared = await fixture('BAD-STAGE'), run = await generate(prepared), valid = await validate(run);
    await db.trip.update({ where: { id: run.trips[0].id }, data: { status: 'DRAFT' } });
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version })).status).toBe(409);
    expect((await db.planningRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('VALIDATED');
  });
  it('rolls back the complete release if the final audit insert fails', async () => {
    const prepared = await fixture('ROLLBACK'), run = await generate(prepared), valid = await validate(run);
    await db.$executeRawUnsafe(`CREATE FUNCTION waypoint_test_reject_release_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."eventType"::text = 'PLAN_RELEASED' THEN RAISE EXCEPTION 'SYNTHETIC release rollback probe'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER "waypoint_test_release_rollback" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION waypoint_test_reject_release_audit()');
    try {
      const before = await snapshot(prepared.depot.id), response = await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version });
      expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(await snapshot(prepared.depot.id)).toBe(before);
      expect((await db.planningRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('VALIDATED');
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER "waypoint_test_release_rollback" ON "AuditEvent"');
      await db.$executeRawUnsafe('DROP FUNCTION waypoint_test_reject_release_audit()');
    }
    expect((await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version })).status).toBe(200);
  }, 30000);
  it('rejects changes to released generated planning history at the database boundary', async () => {
    const prepared = await fixture('IMMUTABLE'), run = await generate(prepared), valid = await validate(run);
    const response = await dispatcher.post(`${path}/${run.id}/release`).send({ expectedVersion: valid.version });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const released = response.body as PlanningRunDetail, trip = released.trips[0], stop = trip.stops[0], allocation = released.decisions[0];
    const before = await snapshot(prepared.depot.id), immutable = /Released generated planning history is immutable/;
    await expect(db.planningRun.update({ where: { id: run.id }, data: { summary: { ...released.summary, served: 0 } } })).rejects.toThrow(immutable);
    await expect(db.planningRun.update({ where: { id: run.id }, data: { status: 'DRAFT', version: { increment: 1 } } })).rejects.toThrow(immutable);
    await expect(db.planningRun.delete({ where: { id: run.id } })).rejects.toThrow(immutable);
    await expect(db.allocation.update({ where: { id: allocation.id }, data: { checkMetadata: { reason: 'SYNTHETIC attempted history overwrite' } } })).rejects.toThrow(immutable);
    await expect(db.allocation.delete({ where: { id: allocation.id } })).rejects.toThrow(immutable);
    await expect(db.allocation.create({ data: { planningRunId: run.id, orderId: allocation.order.id, decision: 'DEFERRED' } })).rejects.toThrow(immutable);
    await expect(db.trip.update({ where: { id: trip.id }, data: { estimatedFuelLitres: '0' } })).rejects.toThrow(immutable);
    await expect(db.trip.delete({ where: { id: trip.id } })).rejects.toThrow(immutable);
    await expect(db.tripStop.update({ where: { id: stop.id }, data: { plannedArrival: new Date(new Date(stop.plannedArrival).getTime() - 60000) } })).rejects.toThrow(immutable);
    await expect(db.tripStop.delete({ where: { id: stop.id } })).rejects.toThrow(immutable);
    expect(await snapshot(prepared.depot.id)).toBe(before);
    expect((await dispatcher.get(`${path}/${run.id}`)).body).toEqual(released);
  }, 30000);
  it('handles concurrent generation with one current draft and no duplicate active assignments', async () => {
    const prepared = await fixture('CONCURRENT'), responses = await Promise.all([dispatcher.post(path).send(requestBody(prepared)), dispatcher.post(path).send(requestBody(prepared))]);
    expect(responses.map(response => response.status).sort(), JSON.stringify(responses.map(response => ({ status: response.status, error: response.body.error })))).toEqual([201, 409]);
    expect(await db.planningRun.count({ where: { depotId: prepared.depot.id, status: 'DRAFT' } })).toBe(1);
    const stops = await db.tripStop.findMany({ where: { active: true, order: { outlet: { depotId: prepared.depot.id } } } });
    expect(new Set(stops.map(stop => stop.orderId)).size).toBe(stops.length);
  }, 30000);
  it('preserves installed judge fixtures and all operational history on repeated setup', async () => {
    const before = await snapshot(base.depot.id);
    await installPlanningFixture(db, { key: 'API' });
    expect(await snapshot(base.depot.id)).toBe(before);
    expect(await db.user.count()).toBe(4);
  });
});
