import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { DriverTripDetail, LoaderTripDetail, OutletLocation, PlanningRunDetail, TripLocation, TripPosition } from '@waypoint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { appendAudit } from '../domain/audit.js';
import { dateOnly } from '../domain/dates.js';
import { transitionOrderInTransaction } from '../domain/lifecycle.js';
import { installLoaderFixture, LOADER_SYNTHETIC_DATE, type LoaderFixture } from '../loader/testing/synthetic.js';

if (!process.env.LOCATION_TEST_DATABASE_URL) throw new Error('Run npm run test; location tests require an isolated PostgreSQL database.');
const db = new PrismaClient({ datasources: { db: { url: process.env.LOCATION_TEST_DATABASE_URL } } });
const config = readConfig({ ...process.env, DATABASE_URL: process.env.LOCATION_TEST_DATABASE_URL, NODE_ENV: 'test',
  STORE_ALLOW_SYNTHETIC: 'false', PLANNING_ALLOW_SYNTHETIC: 'false' });
let clock = new Date('2040-03-05T05:00:00Z');
const appOptions = { planning: { allowSyntheticReferences: true }, store: { allowSyntheticReferences: true },
  driver: { now: () => clock }, location: { now: () => clock } };
const app = createApp(db, config, appOptions);
const driver = request.agent(app), dispatcher = request.agent(app), loader = request.agent(app), store = request.agent(app);
const foreignDriver = request.agent(app), foreignDispatcher = request.agent(app), foreignStore = request.agent(app);
let fixture: LoaderFixture, trip: DriverTripDetail, secondOutletId: string, location: OutletLocation, position: TripPosition;
let draftId: string;
const coordinateBody = { expectedVersion: 0, latitude: 6.9270786, longitude: 79.861243, label: 'Synthetic test entrance', reason: 'Coordinates explicitly entered for isolated tests.' };
function reading(changes: Record<string, unknown> = {}) {
  return { latitude: 6.926, longitude: 79.862, accuracyMetres: 12.5, eventAt: clock.toISOString(), ...changes };
}
function stopVersions(route: DriverTripDetail, stop: DriverTripDetail['stops'][number]) {
  return { expectedTripVersion: route.version, expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version };
}
async function detail() {
  const response = await driver.get(`/api/driver/trips/${trip.id}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as DriverTripDetail;
}
async function versions() {
  const row = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { stops: { include: { order: true }, orderBy: { sequence: 'asc' } } } });
  return { trip: row.version, tripUpdatedAt: row.updatedAt, stops: row.stops.map(stop => ({ id: stop.id, version: stop.version, updatedAt: stop.updatedAt,
    orderVersion: stop.order.version, orderUpdatedAt: stop.order.updatedAt })), audit: await db.auditEvent.count(), deliveries: await db.deliveryRecord.count() };
}
beforeAll(async () => {
  fixture = await installLoaderFixture(db, { key: 'LOCATION' });
  const outlet = await db.outlet.create({ data: { outletRef: 'SYN-LOCATION-SECOND', brand: 'FRESH', district: fixture.storeOutlet.district,
    depotId: fixture.depot.id, dockType: 'STREET', accessConstraint: 'NORMAL', deliveryWindowOpen: 300, deliveryWindowClose: 480, source: 'SYNTHETIC' } });
  secondOutletId = outlet.id;
  await db.$transaction(async tx => {
    const order = await tx.order.create({ data: { orderRef: 'SYN-LOCATION-SECOND-ORDER', outletId: outlet.id,
      requestedDeliveryDate: dateOnly(LOADER_SYNTHETIC_DATE), eligibleDeliveryDate: dateOnly(LOADER_SYNTHETIC_DATE),
      orderedUnits: 10, orderedWeightKg: 10, orderedVolumeM3: '0.1', temperatureRequirement: 'AMBIENT', createdByUserId: fixture.dispatcher.id } });
    await appendAudit(tx, { actor: { id: fixture.dispatcher.id, role: 'DISPATCHER' }, eventType: 'ORDER_CREATED', entityType: 'ORDER', entityId: order.id,
      metadata: { toStatus: 'DRAFT', version: order.version, quantities: { orderedUnits: 10, loadedUnits: null, deliveredUnits: null, receivedUnits: null } } });
    await transitionOrderInTransaction(tx, { actorUserId: fixture.dispatcher.id, orderId: order.id, expectedVersion: order.version, next: 'CONFIRMED' }, { allowSyntheticReferences: true });
  });
  for (const [agent, email] of [[driver, 'driver@waypoint.local'], [dispatcher, 'dispatcher@waypoint.local'], [loader, 'loader@waypoint.local'], [store, 'store@waypoint.local']] as const) {
    expect((await agent.post('/api/auth/login').send({ email, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
  }
  for (const [agent, role, suffix] of [[foreignDriver, 'DRIVER', 'driver'], [foreignDispatcher, 'DISPATCHER', 'dispatcher'], [foreignStore, 'STORE_MANAGER', 'store']] as const) {
    const user = await db.user.create({ data: { email: `location-foreign-${suffix}@waypoint.local`, displayName: `Synthetic foreign ${suffix}`,
      role, passwordHash: fixture.driver.passwordHash } });
    if (role === 'DISPATCHER') await db.userDepot.create({ data: { userId: user.id, depotId: fixture.foreignDepot.id } });
    if (role === 'STORE_MANAGER') await db.userOutlet.create({ data: { userId: user.id, outletId: fixture.foreignOutlet.id } });
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
  }
  let generated = (await dispatcher.post('/api/dispatcher/plans').send({ serviceDate: fixture.serviceDate, depotId: fixture.depot.id })).body as PlanningRunDetail;
  draftId = generated.decisions.find(row => row.order.id === fixture.shortfallOrder.id)!.tripId!;
  expect((await driver.get(`/api/location/trips/${draftId}`)).status).toBe(403);
  expect((await store.get(`/api/location/trips/${draftId}`)).status).toBe(403);
  generated = (await dispatcher.post(`/api/dispatcher/plans/${generated.id}/validate`).send({ expectedVersion: generated.version })).body;
  expect((await driver.get(`/api/location/trips/${draftId}`)).status).toBe(403);
  expect((await store.get(`/api/location/trips/${draftId}`)).status).toBe(403);
  expect((await dispatcher.post(`/api/dispatcher/plans/${generated.id}/release`).send({ expectedVersion: generated.version })).status).toBe(200);
  const source = await db.trip.findUniqueOrThrow({ where: { id: draftId } });
  expect((await dispatcher.post(`/api/dispatcher/trips/${draftId}/driver`).send({ expectedTripVersion: source.version, driverUserId: fixture.driver.id })).status).toBe(200);
  expect((await driver.get(`/api/location/trips/${draftId}`)).status).toBe(403);
  expect((await store.get(`/api/location/trips/${draftId}`)).status).toBe(403);
  let loading = (await loader.get(`/api/loader/trips/${draftId}`)).body as LoaderTripDetail;
  for (const initial of loading.stops) {
    const stop = loading.stops.find(row => row.id === initial.id)!;
    const response = await loader.post(`/api/loader/stops/${stop.id}/load`).send({ expectedTripVersion: loading.version,
      expectedOrderVersion: stop.order.version, expectedStopUpdatedAt: stop.updatedAt, expectedLoadRevision: stop.load?.revision ?? 0, loadedUnits: stop.order.orderedUnits });
    expect(response.status, JSON.stringify(response.body)).toBe(200); loading = response.body;
  }
  const ready = await loader.post(`/api/loader/trips/${draftId}/ready`).send({ expectedTripVersion: loading.version });
  expect(ready.status, JSON.stringify(ready.body)).toBe(200);
  trip = (await driver.get(`/api/driver/trips/${draftId}`)).body;
  expect(trip.stops.some(stop => stop.order.outlet.id === secondOutletId)).toBe(true);
}, 60000);
afterAll(async () => { await db.$disconnect(); });

describe('Scoped recorded outlet coordinates and latest opt-in Driver position', () => {
  it('requires authentication and rejects the Loader role from location reads', async () => {
    expect((await request(app).get(`/api/location/trips/${trip.id}`)).status).toBe(401);
    expect((await request(app).put(`/api/location/outlets/${fixture.storeOutlet.id}`).send(coordinateBody)).status).toBe(401);
    expect((await request(app).post(`/api/location/trips/${trip.id}/position`).send(reading())).status).toBe(401);
    expect((await loader.get(`/api/location/trips/${trip.id}`)).status).toBe(403);
  });
  it('returns null for unknown coordinates and GPS without fabricating map data', async () => {
    const response = await driver.get(`/api/location/trips/${trip.id}`);
    expect(response.status).toBe(200); expect(response.headers['cache-control']).toContain('no-store');
    const map = response.body as TripLocation;
    expect(map.stops.every(stop => stop.location === null)).toBe(true);
    expect(map.position).toBeNull(); expect(map.positionStale).toBe(false); expect(map.positionStaleAfterSeconds).toBe(120);
  });
  it('denies foreign Driver, Dispatcher and Store access to the assigned route', async () => {
    for (const agent of [foreignDriver, foreignDispatcher, foreignStore]) expect((await agent.get(`/api/location/trips/${trip.id}`)).status).toBe(403);
    expect((await driver.get('/api/location/trips/invalid')).status).toBe(400);
    expect((await driver.get(`/api/location/trips/${randomUUID()}`)).status).toBe(403);
  });
  it('checks current Store assignments and current roles instead of trusting login-time scope', async () => {
    const assignment = await db.userOutlet.findUniqueOrThrow({ where: { userId_outletId: { userId: fixture.store.id, outletId: fixture.storeOutlet.id } } });
    await db.userOutlet.delete({ where: { userId_outletId: { userId: fixture.store.id, outletId: fixture.storeOutlet.id } } });
    try { expect((await store.get(`/api/location/trips/${trip.id}`)).status).toBe(403); }
    finally { await db.userOutlet.create({ data: assignment }); }
    await db.userOutlet.create({ data: { userId: fixture.store.id, outletId: secondOutletId } });
    try { expect((await store.get(`/api/location/trips/${trip.id}`)).status).toBe(403); }
    finally { await db.userOutlet.delete({ where: { userId_outletId: { userId: fixture.store.id, outletId: secondOutletId } } }); }
    await db.user.update({ where: { id: fixture.driver.id }, data: { role: 'LOADER' } });
    try {
      expect((await driver.get(`/api/location/trips/${trip.id}`)).status).toBe(403);
      expect((await driver.post(`/api/location/trips/${trip.id}/position`).send(reading())).status).toBe(403);
    } finally { await db.user.update({ where: { id: fixture.driver.id }, data: { role: 'DRIVER' } }); }
    expect(await db.tripPosition.count()).toBe(0);
  });
  it('requires scoped Dispatcher role and assigned depots for coordinate edits', async () => {
    for (const agent of [driver, loader, store, foreignDispatcher]) expect((await agent.put(`/api/location/outlets/${fixture.storeOutlet.id}`).send(coordinateBody)).status).toBe(403);
    expect((await dispatcher.put(`/api/location/outlets/${fixture.foreignOutlet.id}`).send(coordinateBody)).status).toBe(403);
    const assignment = await db.userDepot.findUniqueOrThrow({ where: { userId_depotId: { userId: fixture.dispatcher.id, depotId: fixture.depot.id } } });
    await db.userDepot.delete({ where: { userId_depotId: { userId: fixture.dispatcher.id, depotId: fixture.depot.id } } });
    try {
      expect((await dispatcher.put(`/api/location/outlets/${fixture.storeOutlet.id}`).send(coordinateBody)).status).toBe(403);
      expect((await dispatcher.get(`/api/location/trips/${trip.id}`)).status).toBe(403);
    } finally { await db.userDepot.create({ data: assignment }); }
  });
  it('rejects invalid coordinate bounds, missing reasons, versions and actor injection', async () => {
    for (const changes of [{ latitude: 90.1 }, { longitude: -180.1 }, { latitude: null }, { reason: '' }, { expectedVersion: -1 },
      { expectedVersion: 0.5 }, { recordedByUserId: fixture.driver.id }, { latitude: '6.9' }]) {
      expect((await dispatcher.put(`/api/location/outlets/${fixture.storeOutlet.id}`).send({ ...coordinateBody, ...changes })).status).toBe(400);
    }
    expect(await db.outletLocation.count()).toBe(0);
  });
  it('stores explicitly entered coordinates with their recorder and append-only audit', async () => {
    const response = await dispatcher.put(`/api/location/outlets/${fixture.storeOutlet.id}`).send(coordinateBody);
    expect(response.status, JSON.stringify(response.body)).toBe(200); location = response.body;
    expect(location.version).toBe(1); expect(location.latitude).toBe(coordinateBody.latitude);
    const row = await db.outletLocation.findUniqueOrThrow({ where: { outletId: fixture.storeOutlet.id } });
    expect(row.recordedByUserId).toBe(fixture.dispatcher.id);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { entityType: 'OUTLET', entityId: fixture.storeOutlet.id, eventType: 'OUTLET_LOCATION_RECORDED' } });
    expect(audit.actorUserId).toBe(fixture.dispatcher.id); expect(audit.metadata).toMatchObject({ version: 1,
      location: { latitude: coordinateBody.latitude, longitude: coordinateBody.longitude, previousLatitude: null, reason: coordinateBody.reason } });
  });
  it('rejects stale outlet updates and records prior coordinates when corrected', async () => {
    expect((await dispatcher.put(`/api/location/outlets/${fixture.storeOutlet.id}`).send(coordinateBody)).status).toBe(409);
    const response = await dispatcher.put(`/api/location/outlets/${fixture.storeOutlet.id}`).send({ ...coordinateBody, expectedVersion: location.version, latitude: 6.928, label: '' });
    expect(response.status).toBe(200); location = response.body;
    expect(location.version).toBe(2); expect(location.label).toBeNull();
    const audits = await db.auditEvent.findMany({ where: { entityId: fixture.storeOutlet.id, eventType: 'OUTLET_LOCATION_RECORDED' } });
    expect(audits).toHaveLength(2);
    expect(audits.some(row => JSON.stringify(row.metadata).includes('"previousLatitude":6.9270786'))).toBe(true);
  });
  it('accepts one concurrent coordinate correction and one audit without changing delivery versions', async () => {
    const before = await versions();
    const responses = await Promise.all([6.929, 6.930].map(latitude => dispatcher.put(`/api/location/outlets/${fixture.storeOutlet.id}`)
      .send({ ...coordinateBody, expectedVersion: location.version, latitude })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    location = responses.find(response => response.status === 200)!.body;
    expect(location.version).toBe(3);
    expect(await db.auditEvent.count({ where: { entityId: fixture.storeOutlet.id, eventType: 'OUTLET_LOCATION_RECORDED' } })).toBe(3);
    const after = await versions();
    expect({ ...after, audit: before.audit }).toEqual(before);
    expect(after.audit).toBe(before.audit + 1);
  });
  it('rolls back the coordinate and its version if the audit cannot commit', async () => {
    const failingDb = db.$extends({ query: { auditEvent: { async create() { throw new Error('Synthetic failed location audit.'); } } } }) as unknown as PrismaClient;
    const failingApp = createApp(failingDb, config, appOptions), failingAgent = request.agent(failingApp);
    expect((await failingAgent.post('/api/auth/login').send({ email: 'dispatcher@waypoint.local', password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
    const before = await db.outletLocation.findUniqueOrThrow({ where: { outletId: fixture.storeOutlet.id } });
    expect((await failingAgent.put(`/api/location/outlets/${fixture.storeOutlet.id}`).send({ ...coordinateBody, expectedVersion: before.version, latitude: 7 })).status).toBe(500);
    expect(await db.outletLocation.findUniqueOrThrow({ where: { outletId: fixture.storeOutlet.id } })).toEqual(before);
  });
  it('filters Store map stops and coordinates to the assigned outlet, including counts', async () => {
    expect((await dispatcher.put(`/api/location/outlets/${secondOutletId}`).send({ ...coordinateBody, latitude: 7.1, longitude: 80.1 })).status).toBe(200);
    const all = (await dispatcher.get(`/api/location/trips/${trip.id}`)).body as TripLocation;
    const own = (await store.get(`/api/location/trips/${trip.id}`)).body as TripLocation;
    expect(all.stops.some(stop => stop.outletId === secondOutletId)).toBe(true);
    expect(own.stops.length).toBeGreaterThan(0); expect(own.stops.every(stop => stop.outletId === fixture.storeOutlet.id)).toBe(true);
    expect(own.stopCount).toBe(own.stops.length); expect(own.stopCount).toBeLessThan(all.stopCount);
    expect(JSON.stringify(own)).not.toContain(secondOutletId); expect(JSON.stringify(own)).not.toContain('SYN-LOCATION-SECOND');
  });
  it('rejects GPS before departure, wrong roles and foreign Driver assignment', async () => {
    expect((await driver.post(`/api/location/trips/${trip.id}/position`).send(reading())).status).toBe(409);
    for (const agent of [dispatcher, loader, store, foreignDriver]) expect((await agent.post(`/api/location/trips/${trip.id}/position`).send(reading())).status).toBe(403);
    expect(await db.tripPosition.count()).toBe(0);
    const started = await driver.post(`/api/driver/trips/${trip.id}/start`).send({ expectedTripVersion: trip.version });
    expect(started.status, JSON.stringify(started.body)).toBe(200); trip = started.body;
  });
  it('rejects stale, future, invalid and pre-departure GPS without storing any point', async () => {
    for (const changes of [{ eventAt: new Date(clock.getTime() - 121000).toISOString() }, { eventAt: new Date(clock.getTime() + 31000).toISOString() },
      { eventAt: new Date(clock.getTime() - 1).toISOString() }]) {
      expect((await driver.post(`/api/location/trips/${trip.id}/position`).send(reading(changes))).status).toBe(409);
    }
    for (const changes of [{ latitude: -91 }, { longitude: 181 }, { accuracyMetres: -1 }, { accuracyMetres: 10001 }, { eventAt: 'invalid' }, { driverUserId: fixture.driver.id }]) {
      expect((await driver.post(`/api/location/trips/${trip.id}/position`).send(reading(changes))).status).toBe(400);
    }
    expect(await db.tripPosition.count()).toBe(0);
  });
  it('stores only latest GPS with accuracy and separate event/receipt times, preserving business versions', async () => {
    const before = await versions(); clock = new Date(clock.getTime() + 10000);
    const response = await driver.post(`/api/location/trips/${trip.id}/position`).send(reading({ eventAt: new Date(clock.getTime() - 5000).toISOString() }));
    expect(response.status, JSON.stringify(response.body)).toBe(200); position = response.body;
    expect(position.accuracyMetres).toBe(12.5); expect(position.eventAt).not.toBe(position.receivedAt);
    expect(await versions()).toEqual(before);
    const map = (await driver.get(`/api/location/trips/${trip.id}`)).body as TripLocation;
    expect(map.position).toEqual(position); expect(map.positionStale).toBe(false);
    expect((await store.get(`/api/location/trips/${trip.id}`)).body.position).toEqual(position);
    expect((await dispatcher.get(`/api/location/trips/${trip.id}`)).body.position).toEqual(position);
  });
  it('rejects equal/older readings and concurrent writes retain the newest event, not a history', async () => {
    expect((await driver.post(`/api/location/trips/${trip.id}/position`).send(reading({ eventAt: position.eventAt }))).status).toBe(409);
    const old = new Date(clock.getTime() + 10).toISOString(), newest = new Date(clock.getTime() + 20).toISOString();
    const responses = await Promise.all([driver.post(`/api/location/trips/${trip.id}/position`).send(reading({ eventAt: old, latitude: 6.91 })),
      driver.post(`/api/location/trips/${trip.id}/position`).send(reading({ eventAt: newest, latitude: 6.92 }))]);
    expect(responses.every(response => [200, 409].includes(response.status))).toBe(true);
    expect(responses.some(response => response.status === 200)).toBe(true);
    const row = await db.tripPosition.findUniqueOrThrow({ where: { tripId: trip.id } });
    expect(row.eventAt.toISOString()).toBe(newest); expect(row.latitude.toNumber()).toBe(6.92);
    expect(await db.tripPosition.count({ where: { tripId: trip.id } })).toBe(1);
  });
  it('marks the latest position stale after two minutes without discarding its evidence', async () => {
    clock = new Date(clock.getTime() + 121000);
    const response = await store.get(`/api/location/trips/${trip.id}`);
    expect(response.status).toBe(200); expect(response.body.positionStale).toBe(true); expect(response.body.position).not.toBeNull();
    expect(response.body.position.accuracyMetres).toBe(12.5);
  });
  it('preserves GPS-independent delivery versions and rejects writes after trip completion', async () => {
    trip = await detail();
    const before = stopVersions(trip, trip.stops[0]);
    expect((await driver.post(`/api/location/trips/${trip.id}/position`).send(reading())).status).toBe(200);
    const arrival = await driver.post(`/api/driver/stops/${trip.stops[0].id}/arrival`).send(before);
    expect(arrival.status, JSON.stringify(arrival.body)).toBe(200); trip = arrival.body;
    for (const original of trip.stops) {
      let stop = trip.stops.find(row => row.id === original.id)!;
      if (stop.status !== 'ARRIVED') {
        const arrived = await driver.post(`/api/driver/stops/${stop.id}/arrival`).send(stopVersions(trip, stop));
        expect(arrived.status, JSON.stringify(arrived.body)).toBe(200); trip = arrived.body; stop = trip.stops.find(row => row.id === original.id)!;
      }
      const completed = await driver.post(`/api/driver/stops/${stop.id}/complete`).send({ ...stopVersions(trip, stop), outcome: 'DELIVERED',
        deliveredUnits: stop.loadedUnits, recipientName: 'Synthetic location recipient', recipientRole: 'Store supervisor' });
      expect(completed.status, JSON.stringify(completed.body)).toBe(200); trip = completed.body;
    }
    clock = new Date(clock.getTime() + 1000);
    const [finished, locationRace] = await Promise.all([
      driver.post(`/api/driver/trips/${trip.id}/finish`).send({ expectedTripVersion: trip.version }),
      driver.post(`/api/location/trips/${trip.id}/position`).send(reading())
    ]);
    expect(finished.status, JSON.stringify(finished.body)).toBe(200); trip = finished.body;
    expect([200, 409]).toContain(locationRace.status);
    expect(await db.auditEvent.count({ where: { entityId: trip.id, eventType: 'TRIP_COMPLETED' } })).toBe(1);
    const previous = await db.tripPosition.findUniqueOrThrow({ where: { tripId: trip.id } });
    expect(previous.eventAt.getTime()).toBeLessThanOrEqual(new Date(trip.completedAt!).getTime());
    clock = new Date(clock.getTime() + 1000);
    expect((await driver.post(`/api/location/trips/${trip.id}/position`).send(reading())).status).toBe(409);
    expect(await db.tripPosition.findUniqueOrThrow({ where: { tripId: trip.id } })).toEqual(previous);
    expect((await store.get(`/api/location/trips/${trip.id}`)).status).toBe(200);
  }, 30000);
  it('preserves same-origin mutation protection for both coordinate and GPS endpoints', async () => {
    expect((await dispatcher.put(`/api/location/outlets/${fixture.storeOutlet.id}`).set('Origin', 'https://untrusted.example').send({ ...coordinateBody, expectedVersion: location.version })).status).toBe(403);
    expect((await driver.post(`/api/location/trips/${trip.id}/position`).set('Origin', 'https://untrusted.example').send(reading())).status).toBe(403);
  });
});
