import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import type { DriverTripDetail, LoaderTripDetail } from '@waypoint/shared';
import { createApp } from '../app.js';
import { cookieOptions } from '../auth.js';
import { readConfig } from '../config.js';
import { checkPlanningOptions } from '../planning/data.js';
import { storeNow } from '../store/cutoff.js';
import { dateOnly, isoWeek, weekStart } from './dates.js';
import { installPublicJudgeData } from './public-judge.js';
import { syntheticReferencesPermitted } from './synthetic-mode.js';
import { PUBLIC_JUDGE_DATES } from './public-judge-dates.js';
import { PUBLIC_JUDGE_REVIEW_ORDERS, preparePublicJudgeReview } from './public-judge-review.js';
import { publicJudgeWorkspaceMetadata } from './public-judge-workspace.js';
import { installLoaderFixture } from '../loader/testing/synthetic.js';

if (!process.env.PUBLIC_JUDGE_TEST_DATABASE_URL) throw new Error('Run npm run test; public judge installation tests require an isolated PostgreSQL database.');
const db = new PrismaClient({ datasources: { db: { url: process.env.PUBLIC_JUDGE_TEST_DATABASE_URL } } });
const productionEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: process.env.PUBLIC_JUDGE_TEST_DATABASE_URL, NODE_ENV: 'production',
  WEB_ORIGIN: 'https://judge.example', API_HOST: undefined, API_PORT: undefined, PORT: '4015',
  STORE_ALLOW_SYNTHETIC: 'false', PLANNING_ALLOW_SYNTHETIC: 'false', PUBLIC_JUDGE_DEMO: 'false', DISPATCHER_DEMO_DATE: undefined };
const publicEnv: NodeJS.ProcessEnv = { ...productionEnv, PUBLIC_JUDGE_DEMO: 'true' };
afterEach(() => { vi.unstubAllEnvs(); });
afterAll(async () => { await db.$disconnect(); });
async function snapshot() {
  const [orders, trips, deliveries, receipts, audit, depots, outlets, vehicles] = await Promise.all([
    db.order.count(), db.trip.count(), db.deliveryRecord.count(), db.receipt.count(), db.auditEvent.count(),
    db.depot.count(), db.outlet.count(), db.vehicle.count()
  ]);
  return { orders, trips, deliveries, receipts, audit, depots, outlets, vehicles };
}

describe('Production installation configuration and independent public judge data', () => {
  it('uses Railway PORT and dual-stack private binding while keeping HTTPS secure cookies', () => {
    const config = readConfig(productionEnv);
    expect(config.API_PORT).toBe(4015); expect(config.API_HOST).toBe('::'); expect(config.PUBLIC_JUDGE_DEMO).toBe(false);
    expect(cookieOptions(config)).toMatchObject({ secure: true, httpOnly: true, sameSite: 'strict', path: '/api' });
    expect(readConfig({ ...productionEnv, API_PORT: '3001', API_HOST: '0.0.0.0' }).API_PORT).toBe(3001);
  });
  it('fails clearly for missing production auth, database credentials or judge password without echoing secrets', () => {
    for (const changes of [{ AUTH_SECRET: undefined }, { SEED_DEMO_PASSWORD: undefined }, { DATABASE_URL: 'postgresql://demo@db.example/judge' }]) {
      expect(() => readConfig({ ...productionEnv, ...changes })).toThrow(/environment|credentials|password/i);
    }
  });
  it('rejects known CI/template infrastructure values and old demo passwords in production', () => {
    for (const changes of [{ AUTH_SECRET: 'waypoint-ci-only-auth-secret-not-for-deployment-2026' },
      { DATABASE_URL: 'postgresql://demo:waypoint-ci-only-db-password@db.example/judge' },
      { DATABASE_URL: 'postgresql://demo:local-only-password@db.example/judge' },
      { SEED_DEMO_PASSWORD: 'WaypointDemo!2026' }, { SEED_DEMO_PASSWORD: 'WaypointCIOnly!2026' }]) {
      expect(() => readConfig({ ...productionEnv, ...changes })).toThrow(/fresh|newly configured/);
    }
  });
  it('requires public HTTPS even in an explicitly enabled public judge installation', () => {
    expect(() => readConfig({ ...publicEnv, WEB_ORIGIN: 'http://judge.example' })).toThrow(/HTTPS/);
  });
  it('preserves the default prohibition on synthetic production eligibility and rejects unapproved day overrides', () => {
    expect(() => readConfig({ ...productionEnv, STORE_ALLOW_SYNTHETIC: 'true' })).toThrow(/explicit PUBLIC_JUDGE_DEMO/);
    expect(() => readConfig({ ...productionEnv, PLANNING_ALLOW_SYNTHETIC: 'true' })).toThrow(/explicit PUBLIC_JUDGE_DEMO/);
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'false');
    expect(syntheticReferencesPermitted()).toBe(false);
    expect(() => checkPlanningOptions({ allowSyntheticReferences: true })).toThrow(/public judge demo/);
    expect(() => storeNow({ allowSyntheticReferences: true })).toThrow(/public judge demo/);
    expect(() => readConfig({ ...publicEnv, DISPATCHER_DEMO_DATE: '2040-03-06' })).toThrow(/registered/);
    expect(readConfig(publicEnv).DISPATCHER_DEMO_DATE).toBe(PUBLIC_JUDGE_DATES.executionDate);
    for (const date of Object.values(PUBLIC_JUDGE_DATES)) expect(readConfig({ ...publicEnv, DISPATCHER_DEMO_DATE: date }).DISPATCHER_DEMO_DATE).toBe(date);
  });
  it('makes public judge installation a no-op unless the explicit environment opt-in is present', async () => {
    const before = await snapshot();
    expect(await installPublicJudgeData(db, productionEnv)).toEqual({ enabled: false });
    expect(await snapshot()).toEqual(before);
  });
  it('rejects a database containing official reference data before creating any judge assignments or orders', async () => {
    const day = '2045-01-02', iso = isoWeek(day), weekday = (dateOnly(day).getUTCDay() + 6) % 7;
    // Independent test-only provenance exercises the OFFICIAL exclusion; no competition rows are used.
    const provenance = await db.referenceImport.create({ data: { source: 'OFFICIAL', digest: 'b'.repeat(64),
      fileDigests: { calendar: 'a'.repeat(64) }, counts: { calendar: 1 } } });
    try {
      await db.calendarDay.create({ data: { date: dateOnly(day), dayOfWeek: weekday, dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday],
        weekend: weekday === 6, isoYear: iso.year, isoWeek: iso.week, operatingDay: true, payday: false, festivalRamp: 0, holiday: false, monsoon: false,
        source: 'OFFICIAL', importId: provenance.id } });
      const before = await snapshot();
      await expect(installPublicJudgeData(db, publicEnv)).rejects.toThrow(/separate database without official/);
      expect(await snapshot()).toEqual(before); expect(await db.calendarDay.count({ where: { source: 'OFFICIAL' } })).toBe(1);
    } finally {
      await db.calendarDay.deleteMany({ where: { date: dateOnly(day) } }); await db.referenceImport.delete({ where: { id: provenance.id } });
    }
  });
  it('rolls back all new review preparation when a reserved demand reference conflicts', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true');
    const fixture = await installLoaderFixture(db, { key: 'DRIVER', serviceDate: PUBLIC_JUDGE_DATES.historyDate });
    const spec = PUBLIC_JUDGE_REVIEW_ORDERS[3];
    const conflicting = await db.order.create({ data: { orderRef: spec.orderRef, outletId: fixture.storeOutlet.id,
      requestedDeliveryDate: dateOnly(PUBLIC_JUDGE_DATES.historyDate), eligibleDeliveryDate: dateOnly(PUBLIC_JUDGE_DATES.historyDate), orderedUnits: 1,
      orderedWeightKg: '1', orderedVolumeM3: '0.1', temperatureRequirement: 'AMBIENT', createdByUserId: fixture.store.id } });
    const before = await snapshot(), availability = await db.vehicleAvailability.count(), ledgers = await db.fuelLedger.count(), days = await db.calendarDay.count();
    await expect(preparePublicJudgeReview(db, fixture)).rejects.toThrow(/different demand/);
    expect(await snapshot()).toEqual(before); expect(await db.vehicleAvailability.count()).toBe(availability);
    expect(await db.fuelLedger.count()).toBe(ledgers); expect(await db.calendarDay.count()).toBe(days);
    expect(await db.order.count({ where: { orderRef: { in: PUBLIC_JUDGE_REVIEW_ORDERS.slice(0, 3).map(order => order.orderRef) } } })).toBe(0);
    await db.order.delete({ where: { id: conflicting.id } });
  }, 30000);
  it('installs only independently authored SYNTHETIC demand and permits the existing plan workflow under production safeguards', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true');
    const started = new Date();
    const result = await installPublicJudgeData(db, publicEnv);
    expect(result).toMatchObject({ enabled: true, source: 'SYNTHETIC', serviceDate: '2040-03-05', orderedUnits: 192, publicJudge: PUBLIC_JUDGE_DATES });
    expect(await db.order.count()).toBe(18); expect(await db.trip.count()).toBe(0);
    for (const spec of PUBLIC_JUDGE_REVIEW_ORDERS) {
      const order = await db.order.findUniqueOrThrow({ where: { orderRef: spec.orderRef } });
      expect(order.status).toBe('CONFIRMED'); expect(order.createdAt.getTime()).toBeGreaterThanOrEqual(started.getTime());
      expect(order.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(await db.auditEvent.count({ where: { entityId: order.id } })).toBe(2);
    }
    expect(await db.outlet.count({ where: { source: 'OFFICIAL' } })).toBe(0); expect(await db.vehicle.count({ where: { source: 'OFFICIAL' } })).toBe(0);
    expect((await db.user.findMany()).map(user => user.role).sort()).toEqual(['DISPATCHER', 'DRIVER', 'LOADER', 'STORE_MANAGER']);
    const config = readConfig(publicEnv); expect(config.DISPATCHER_DEMO_DATE).toBe(PUBLIC_JUDGE_DATES.executionDate);
    const app = createApp(db, config), login = await request(app).post('/api/auth/login').send({ email: 'dispatcher@waypoint.local', password: publicEnv.SEED_DEMO_PASSWORD });
    expect(login.status).toBe(200); expect(String(login.headers['set-cookie'])).toContain('Secure');
    const cookies = login.headers['set-cookie'];
    const depot = await db.depot.findUniqueOrThrow({ where: { name: 'SYNTHETIC Allocation DRIVER Depot' } });
    expect(await db.order.count({ where: { outlet: { depotId: depot.id } } })).toBe(17);
    expect((await request(app).get('/api/workspaces/dispatcher').set('Cookie', cookies)).body.publicJudge).toEqual(PUBLIC_JUDGE_DATES);
    expect((await request(app).get('/api/workspaces/dispatcher')).status).toBe(401);
    const normalApp = createApp(db, readConfig(productionEnv));
    expect((await request(normalApp).get('/api/workspaces/dispatcher').set('Cookie', cookies)).body).not.toHaveProperty('publicJudge');
    const generated = await request(app).post('/api/dispatcher/plans').set('Cookie', cookies).send({ serviceDate: '2040-03-05', depotId: depot.id });
    expect(generated.status, JSON.stringify(generated.body)).toBe(201); expect(generated.body.summary.served).toBe(9);
    const validated = await request(app).post(`/api/dispatcher/plans/${generated.body.id}/validate`).set('Cookie', cookies).send({ expectedVersion: generated.body.version });
    expect(validated.status).toBe(200); expect(validated.body.validation.valid).toBe(true);
    const released = await request(app).post(`/api/dispatcher/plans/${generated.body.id}/release`).set('Cookie', cookies).send({ expectedVersion: validated.body.version });
    expect(released.status, JSON.stringify(released.body)).toBe(200); expect(released.body.status).toBe('RELEASED');
  }, 30000);
  it('prepares only the two existing active review vehicles with fresh weekly fuel and keeps one Store outlet', async () => {
    const store = await db.user.findUniqueOrThrow({ where: { email: 'store@waypoint.local' } });
    expect(await db.userOutlet.count({ where: { userId: store.id } })).toBe(1);
    expect(await db.user.count()).toBe(4);
    const vehicles = await db.vehicle.findMany({ where: { vehicleRef: { in: ['SYN-PLAN-DRIVER-AMBIENT', 'SYN-PLAN-DRIVER-REEFER'] } } });
    expect(vehicles).toHaveLength(2);
    const availability = await db.vehicleAvailability.findMany({ where: { serviceDate: { in: [dateOnly(PUBLIC_JUDGE_DATES.executionDate), dateOnly(PUBLIC_JUDGE_DATES.planningDate)] } } });
    expect(availability).toHaveLength(4);
    for (const row of availability) expect(row).toMatchObject({ source: 'SYNTHETIC', status: 'AVAILABLE', availableFromMinute: 300, availableUntilMinute: 1080 });
    expect(new Set(availability.map(row => row.vehicleId))).toEqual(new Set(vehicles.map(row => row.id)));
    const ledgers = await db.fuelLedger.findMany({ where: { weekStart: weekStart(PUBLIC_JUDGE_DATES.executionDate) }, include: { usage: true } });
    expect(ledgers).toHaveLength(2);
    for (const row of ledgers) { expect(row.openingSource).toBe('SYNTHETIC'); expect(row.openingConsumedLitres?.toString()).toBe('0'); expect(row.usage).toHaveLength(0); }
  });
  it('generates, independently validates and releases both fresh review days without changing historical demand', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true');
    const app = createApp(db, readConfig(publicEnv)), login = await request(app).post('/api/auth/login').send({ email: 'dispatcher@waypoint.local', password: publicEnv.SEED_DEMO_PASSWORD });
    const cookies = login.headers['set-cookie'], depot = await db.depot.findUniqueOrThrow({ where: { name: 'SYNTHETIC Allocation DRIVER Depot' } });
    const history = await db.order.findMany({ where: { requestedDeliveryDate: { lte: dateOnly(PUBLIC_JUDGE_DATES.historyDate) } }, orderBy: { id: 'asc' } });
    for (const serviceDate of [PUBLIC_JUDGE_DATES.executionDate, PUBLIC_JUDGE_DATES.planningDate]) {
      const generated = await request(app).post('/api/dispatcher/plans').set('Cookie', cookies).send({ serviceDate, depotId: depot.id });
      expect(generated.status, JSON.stringify(generated.body)).toBe(201);
      for (const spec of PUBLIC_JUDGE_REVIEW_ORDERS.filter(order => order.serviceDate === serviceDate)) {
        expect(generated.body.decisions.find((decision: { order: { orderRef: string } }) => decision.order.orderRef === spec.orderRef).decision).toBe('ASSIGNED');
      }
      const validated = await request(app).post(`/api/dispatcher/plans/${generated.body.id}/validate`).set('Cookie', cookies).send({ expectedVersion: generated.body.version });
      expect(validated.status, JSON.stringify(validated.body)).toBe(200); expect(validated.body.validation.valid).toBe(true);
      const released = await request(app).post(`/api/dispatcher/plans/${generated.body.id}/release`).set('Cookie', cookies).send({ expectedVersion: validated.body.version });
      expect(released.status, JSON.stringify(released.body)).toBe(200); expect(released.body.status).toBe('RELEASED');
    }
    // Older deferred demand may legitimately be reconsidered on a new day; immutable original request facts remain intact.
    const after = await db.order.findMany({ where: { id: { in: history.map(order => order.id) } }, orderBy: { id: 'asc' } });
    expect(after.map(({ orderRef, orderedUnits, orderedWeightKg, requestedDeliveryDate }) => ({ orderRef, orderedUnits, orderedWeightKg, requestedDeliveryDate })))
      .toEqual(history.map(({ orderRef, orderedUnits, orderedWeightKg, requestedDeliveryDate }) => ({ orderRef, orderedUnits, orderedWeightKg, requestedDeliveryDate })));
  }, 30000);
  it('selects only a scoped completed example with actual photo, signature and separate confirmed Store receipt', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true');
    const app = createApp(db, readConfig(publicEnv)), sessions = new Map<string, string[]>();
    for (const name of ['dispatcher', 'loader', 'driver', 'store']) {
      const login = await request(app).post('/api/auth/login').send({ email: `${name}@waypoint.local`, password: publicEnv.SEED_DEMO_PASSWORD });
      expect(login.status).toBe(200);
      const cookie = login.headers['set-cookie']; sessions.set(name, Array.isArray(cookie) ? cookie : [cookie]);
    }
    const driverUser = await db.user.findUniqueOrThrow({ where: { email: 'driver@waypoint.local' } });
    const historicalStop = await db.tripStop.findFirstOrThrow({ where: { active: true, order: { orderRef: 'SYN-LOADER-DRIVER-ORDER-192' }, trip: { serviceDate: dateOnly(PUBLIC_JUDGE_DATES.historyDate), planningRun: { status: 'RELEASED' } } } });
    const assigned = { tripId: historicalStop.tripId, order: { id: historicalStop.orderId } };
    let trip: DriverTripDetail;
    let loading = (await request(app).get(`/api/loader/trips/${assigned.tripId}`).set('Cookie', sessions.get('loader')!)).body as LoaderTripDetail;
    const assignment = await request(app).post(`/api/dispatcher/trips/${loading.id}/driver`).set('Cookie', sessions.get('dispatcher')!)
      .send({ expectedTripVersion: loading.version, driverUserId: driverUser.id });
    expect(assignment.status, JSON.stringify(assignment.body)).toBe(200);
    loading = (await request(app).get(`/api/loader/trips/${loading.id}`).set('Cookie', sessions.get('loader')!)).body;
    for (const initial of loading.stops) {
      const stop = loading.stops.find(row => row.id === initial.id)!;
      const loaded = await request(app).post(`/api/loader/stops/${stop.id}/load`).set('Cookie', sessions.get('loader')!).send({
        expectedTripVersion: loading.version, expectedOrderVersion: stop.order.version, expectedStopUpdatedAt: stop.updatedAt,
        expectedLoadRevision: stop.load?.revision ?? 0, loadedUnits: stop.order.orderedUnits });
      expect(loaded.status, JSON.stringify(loaded.body)).toBe(200); loading = loaded.body;
    }
    const ready = await request(app).post(`/api/loader/trips/${loading.id}/ready`).set('Cookie', sessions.get('loader')!).send({ expectedTripVersion: loading.version });
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    const started = await request(app).post(`/api/driver/trips/${loading.id}/start`).set('Cookie', sessions.get('driver')!).send({ expectedTripVersion: ready.body.version });
    expect(started.status, JSON.stringify(started.body)).toBe(200); trip = started.body;
    const png = (await sharp({ create: { width: 12, height: 8, channels: 3, background: '#30485a' } }).png().toBuffer()).toString('base64');
    for (const initial of trip.stops) {
      let stop = trip.stops.find(row => row.id === initial.id)!;
      const arrived = await request(app).post(`/api/driver/stops/${stop.id}/arrival`).set('Cookie', sessions.get('driver')!).send({
        expectedTripVersion: trip.version, expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version });
      expect(arrived.status, JSON.stringify(arrived.body)).toBe(200); trip = arrived.body; stop = trip.stops.find(row => row.id === stop.id)!;
      const completed = await request(app).post(`/api/driver/stops/${stop.id}/complete`).set('Cookie', sessions.get('driver')!).send({
        expectedTripVersion: trip.version, expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version,
        outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits, recipientName: 'Synthetic Review Receiver', recipientRole: 'Receiving staff',
        driverNote: 'Synthetic review preservation test.', ...(stop.id === historicalStop.id ? { attachments: [
          { kind: 'PHOTO', contentType: 'image/png', base64: png }, { kind: 'SIGNATURE', contentType: 'image/png', base64: png }
        ] } : {}) });
      expect(completed.status, JSON.stringify(completed.body)).toBe(200); trip = completed.body;
    }
    const finished = await request(app).post(`/api/driver/trips/${trip.id}/finish`).set('Cookie', sessions.get('driver')!).send({ expectedTripVersion: trip.version });
    expect(finished.status, JSON.stringify(finished.body)).toBe(200);
    expect((await publicJudgeWorkspaceMetadata(db, driverUser.id, 'DRIVER'))).not.toHaveProperty('completedExample');
    const order = await db.order.findUniqueOrThrow({ where: { id: assigned.order.id } });
    const receipt = await request(app).post(`/api/store/orders/${order.id}/receipt`).set('Cookie', sessions.get('store')!).send({ expectedVersion: order.version, receivedUnits: 192, issueType: 'NONE' });
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
    for (const [name, slug] of [['dispatcher', 'dispatcher'], ['loader', 'loader'], ['driver', 'driver'], ['store', 'store']]) {
      const workspace = await request(app).get(`/api/workspaces/${slug}`).set('Cookie', sessions.get(name)!);
      expect(workspace.status).toBe(200);
      if (name === 'loader') expect(workspace.body.publicJudge).not.toHaveProperty('completedExample');
      else expect(workspace.body.publicJudge.completedExample).toEqual({ orderId: order.id, tripId: trip.id, stopId: historicalStop.id });
    }
    for (const role of ['DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER'] as const) {
      expect(await publicJudgeWorkspaceMetadata(db, randomUUID(), role)).not.toHaveProperty('completedExample');
    }
    const attachment = await db.deliveryAttachment.findFirstOrThrow();
    expect((await request(app).get(`/api/proof/attachments/${attachment.id}`).set('Cookie', sessions.get('loader')!)).status).toBe(403);
    expect((await request(app).get('/api/workspaces/driver').set('Cookie', sessions.get('store')!)).status).toBe(403);
  }, 30000);
  it('repeated production judge installation preserves generated plans, immutable quantities, users and audit history', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true');
    const before = await snapshot(), users = await db.user.findMany({ orderBy: { id: 'asc' } }), orders = await db.order.findMany({ orderBy: { id: 'asc' } });
    const plans = await db.planningRun.findMany({ orderBy: { id: 'asc' } });
    const attachments = await db.deliveryAttachment.findMany({ orderBy: { id: 'asc' } }), deliveries = await db.deliveryRecord.findMany({ orderBy: { id: 'asc' } });
    const receipts = await db.receipt.findMany({ orderBy: { id: 'asc' } }), fuel = await db.fuelUsage.findMany({ orderBy: { id: 'asc' } });
    const availability = await db.vehicleAvailability.findMany({ orderBy: { id: 'asc' } }), ledgers = await db.fuelLedger.findMany({ orderBy: { id: 'asc' } });
    expect((await installPublicJudgeData(db, publicEnv)).enabled).toBe(true);
    expect(await snapshot()).toEqual(before); expect(await db.user.findMany({ orderBy: { id: 'asc' } })).toEqual(users);
    expect(await db.order.findMany({ orderBy: { id: 'asc' } })).toEqual(orders); expect(await db.planningRun.findMany({ orderBy: { id: 'asc' } })).toEqual(plans);
    expect(await db.deliveryAttachment.findMany({ orderBy: { id: 'asc' } })).toEqual(attachments); expect(attachments).toHaveLength(2);
    expect(await db.deliveryRecord.findMany({ orderBy: { id: 'asc' } })).toEqual(deliveries); expect(await db.receipt.findMany({ orderBy: { id: 'asc' } })).toEqual(receipts);
    expect(await db.fuelUsage.findMany({ orderBy: { id: 'asc' } })).toEqual(fuel); expect(await db.vehicleAvailability.findMany({ orderBy: { id: 'asc' } })).toEqual(availability);
    expect(await db.fuelLedger.findMany({ orderBy: { id: 'asc' } })).toEqual(ledgers);
    const fixture = await installLoaderFixture(db, { key: 'DRIVER', serviceDate: PUBLIC_JUDGE_DATES.historyDate });
    await Promise.all([preparePublicJudgeReview(db, fixture), preparePublicJudgeReview(db, fixture)]);
    expect(await snapshot()).toEqual(before);
  });
  it('retains a later explicit availability change instead of making used review vehicles available again', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true');
    const fixture = await installLoaderFixture(db, { key: 'DRIVER', serviceDate: PUBLIC_JUDGE_DATES.historyDate });
    const vehicle = await db.vehicle.findUniqueOrThrow({ where: { vehicleRef: 'SYN-PLAN-DRIVER-AMBIENT' } });
    const existing = await db.vehicleAvailability.update({ where: { vehicleId_serviceDate: { vehicleId: vehicle.id, serviceDate: dateOnly(PUBLIC_JUDGE_DATES.planningDate) } },
      data: { status: 'UNAVAILABLE', availableFromMinute: null, availableUntilMinute: null, note: 'Synthetic later availability decision retained.' } });
    const before = await snapshot(); await preparePublicJudgeReview(db, fixture);
    expect(await db.vehicleAvailability.findUnique({ where: { id: existing.id } })).toEqual(existing);
    expect(await snapshot()).toEqual(before);
  });
});
