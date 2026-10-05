import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import type { DriverTripDetail, LoaderTripDetail, PlanningRunDetail } from '@waypoint/shared';
import { spawn } from 'node:child_process';
import { createApp } from '../app.js';
import { cookieOptions } from '../auth.js';
import { readConfig } from '../config.js';
import { checkPlanningOptions } from '../planning/data.js';
import { storeNow } from '../store/cutoff.js';
import { businessDate, dateOnly, weekStart } from './dates.js';
import { installPublicJudgeData } from './public-judge.js';
import { PUBLIC_JUDGE_DATES } from './public-judge-dates.js';
import { PUBLIC_JUDGE_REVIEW_ORDERS, preparePublicJudgeReview } from './public-judge-review.js';
import { inspectPublicJudgeReset, resetPublicJudgeDemo, PUBLIC_JUDGE_RESET_TABLES } from './public-judge-reset.js';
import { syntheticReferencesPermitted } from './synthetic-mode.js';
import { installLoaderFixture } from '../loader/testing/synthetic.js';
import { installPlanningReferences } from '../planning/testing/synthetic.js';
import { installStarterReferenceData, STARTER_CALENDAR_DAYS } from './starter-reference.js';

if (!process.env.PUBLIC_JUDGE_TEST_DATABASE_URL) throw new Error('Run npm run test; public judge tests require an isolated PostgreSQL database.');
const db = new PrismaClient({ datasources: { db: { url: process.env.PUBLIC_JUDGE_TEST_DATABASE_URL } } });
const productionEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: process.env.PUBLIC_JUDGE_TEST_DATABASE_URL, NODE_ENV: 'production',
  WEB_ORIGIN: 'https://judge.example', API_HOST: undefined, API_PORT: undefined, PORT: '4015',
  STORE_ALLOW_SYNTHETIC: 'false', PLANNING_ALLOW_SYNTHETIC: 'false', PUBLIC_JUDGE_DEMO: 'false', STARTER_REFERENCE_DATA: 'false', DISPATCHER_DEMO_DATE: undefined };
const publicEnv: NodeJS.ProcessEnv = { ...productionEnv, PUBLIC_JUDGE_DEMO: 'true' };
const starterEnv: NodeJS.ProcessEnv = { ...productionEnv, STARTER_REFERENCE_DATA: 'true' };
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db.$disconnect(); });
function publicMode() { vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true'); vi.stubEnv('STARTER_REFERENCE_DATA', 'false'); }
function starterMode() { vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'false'); vi.stubEnv('STARTER_REFERENCE_DATA', 'true'); }
async function counts() {
  return { orders: await db.order.count(), trips: await db.trip.count(), audit: await db.auditEvent.count(),
    deliveries: await db.deliveryRecord.count(), receipts: await db.receipt.count(), attachments: await db.deliveryAttachment.count(), fuel: await db.fuelUsage.count() };
}
async function generateRelease(app: ReturnType<typeof createApp>, cookie: string, serviceDate: string): Promise<PlanningRunDetail> {
  const depot = await db.depot.findUniqueOrThrow({ where: { name: 'SYNTHETIC Allocation DRIVER Depot' } });
  const generated = await request(app).post('/api/dispatcher/plans').set('Cookie', cookie).send({ serviceDate, depotId: depot.id });
  expect(generated.status, JSON.stringify(generated.body)).toBe(201);
  const validated = await request(app).post(`/api/dispatcher/plans/${generated.body.id}/validate`).set('Cookie', cookie).send({ expectedVersion: generated.body.version });
  expect(validated.status, JSON.stringify(validated.body)).toBe(200); expect(validated.body.validation.valid).toBe(true);
  const released = await request(app).post(`/api/dispatcher/plans/${generated.body.id}/release`).set('Cookie', cookie).send({ expectedVersion: validated.body.version });
  expect(released.status, JSON.stringify(released.body)).toBe(200); return released.body;
}
async function login(app: ReturnType<typeof createApp>, role: string) {
  const response = await request(app).post('/api/auth/login').send({ email: `${role}@waypoint.local`, password: publicEnv.SEED_DEMO_PASSWORD });
  expect(response.status).toBe(200); return response.headers['set-cookie'];
}

describe('Production installation and explicit public demo reset', () => {
  it('uses Railway private binding and HTTPS secure cookies', () => {
    const config = readConfig(productionEnv); expect(config.API_PORT).toBe(4015); expect(config.API_HOST).toBe('::');
    expect(cookieOptions(config)).toMatchObject({ secure: true, httpOnly: true, sameSite: 'strict', path: '/api' });
  });
  it('rejects missing or known template production credentials without echoing secrets', () => {
    for (const changes of [{ AUTH_SECRET: undefined }, { SEED_DEMO_PASSWORD: undefined }, { DATABASE_URL: 'postgresql://demo@db.example/judge' },
      { AUTH_SECRET: 'waypoint-ci-only-auth-secret-not-for-deployment-2026' }, { SEED_DEMO_PASSWORD: 'WaypointDemo!2026' },
      { DATABASE_URL: 'postgresql://demo:local-only-password@db.example/judge' }]) expect(() => readConfig({ ...productionEnv, ...changes })).toThrow();
  });
  it('requires public HTTPS and restricts demo defaults to the three registered dates', () => {
    expect(() => readConfig({ ...publicEnv, WEB_ORIGIN: 'http://judge.example' })).toThrow(/HTTPS/);
    expect(readConfig(publicEnv).DISPATCHER_DEMO_DATE).toBe(PUBLIC_JUDGE_DATES.executionDate);
    for (const day of Object.values(PUBLIC_JUDGE_DATES)) expect(readConfig({ ...publicEnv, DISPATCHER_DEMO_DATE: day }).DISPATCHER_DEMO_DATE).toBe(day);
    expect(() => readConfig({ ...publicEnv, DISPATCHER_DEMO_DATE: '2040-03-06' })).toThrow(/registered/);
  });
  it('preserves the default prohibition on synthetic production eligibility and reset', async () => {
    expect(() => readConfig({ ...productionEnv, STORE_ALLOW_SYNTHETIC: 'true' })).toThrow(/explicit PUBLIC_JUDGE_DEMO/);
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'false');
    expect(syntheticReferencesPermitted()).toBe(false); expect(() => checkPlanningOptions({ allowSyntheticReferences: true })).toThrow();
    expect(() => storeNow({ allowSyntheticReferences: true })).toThrow();
    await expect(inspectPublicJudgeReset(db, productionEnv)).rejects.toThrow(/explicitly enabled/);
  });
  it('does nothing without public demo opt-in', async () => {
    const before = await counts(); expect(await installPublicJudgeData(db, productionEnv)).toEqual({ enabled: false }); expect(await counts()).toEqual(before);
  });
  it('rejects OFFICIAL reference provenance before any public initialization', async () => {
    publicMode();
    const imported = await db.referenceImport.create({ data: { source: 'OFFICIAL', digest: 'b'.repeat(64), fileDigests: {}, counts: {} } });
    const before = await counts(); await expect(installPublicJudgeData(db, publicEnv)).rejects.toThrow(/without official/); expect(await counts()).toEqual(before);
    await db.referenceImport.delete({ where: { id: imported.id } });
  });
  it('installs only four fresh confirmed demands and safe references with no legacy operational history', async () => {
    publicMode(); const started = new Date(); const result = await installPublicJudgeData(db, publicEnv);
    expect(result).toMatchObject({ enabled: true, source: 'SYNTHETIC', serviceDate: PUBLIC_JUDGE_DATES.executionDate, publicJudge: PUBLIC_JUDGE_DATES });
    expect(await counts()).toEqual({ orders: 4, trips: 0, audit: 8, deliveries: 0, receipts: 0, attachments: 0, fuel: 0 });
    expect(await db.deferralRecord.count()).toBe(0); expect(await db.user.count()).toBe(4); expect(await db.userOutlet.count()).toBe(1);
    for (const spec of PUBLIC_JUDGE_REVIEW_ORDERS) {
      const order = await db.order.findUniqueOrThrow({ where: { orderRef: spec.orderRef } }); expect(order.status).toBe('CONFIRMED'); expect(order.version).toBe(2);
      expect(order.createdAt.getTime()).toBeGreaterThanOrEqual(started.getTime()); expect(order.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(order.orderedUnits).toBe(spec.orderedUnits); expect(order.requestedDeliveryDate).toEqual(dateOnly(spec.serviceDate));
    }
    const week = await db.fuelLedger.findMany({ where: { weekStart: dateOnly(PUBLIC_JUDGE_DATES.executionDate) } });
    expect(week).toHaveLength(2); for (const ledger of week) expect(ledger.openingConsumedLitres?.toString()).toBe('0');
  }, 30000);
  it('publishes dates only behind authentication and role scope, with no completed IDs for any role', async () => {
    publicMode(); const app = createApp(db, readConfig(publicEnv));
    for (const role of ['dispatcher', 'loader', 'driver', 'store']) {
      const cookie = await login(app, role); const workspace = await request(app).get(`/api/workspaces/${role}`).set('Cookie', cookie);
      expect(workspace.status).toBe(200); expect(workspace.body.publicJudge).toEqual(PUBLIC_JUDGE_DATES);
      expect((await request(app).get(`/api/workspaces/${role}`)).status).toBe(401);
      expect((await request(createApp(db, readConfig(productionEnv))).get(`/api/workspaces/${role}`).set('Cookie', cookie)).body).not.toHaveProperty('publicJudge');
      expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    }
  });
  it('ordinary startup and concurrent preparation retain existing data without resetting anything', async () => {
    publicMode(); const before = await inspectPublicJudgeReset(db, publicEnv);
    await installPublicJudgeData(db, publicEnv);
    const fixture = await installPlanningReferences(db, { key: 'DRIVER', serviceDate: PUBLIC_JUDGE_DATES.historyDate });
    await Promise.all([preparePublicJudgeReview(db, fixture), preparePublicJudgeReview(db, fixture)]);
    expect((await inspectPublicJudgeReset(db, publicEnv)).inventoryDigest).toBe(before.inventoryDigest);
  }, 30000);
  it('keeps development fixture scenarios unchanged while making realistic reset evidence', async () => {
    publicMode(); const fixture = await installLoaderFixture(db, { key: 'DRIVER', serviceDate: PUBLIC_JUDGE_DATES.historyDate });
    expect(await db.order.count()).toBe(18); expect(await db.deferralRecord.count()).toBe(3); expect(await db.fuelUsage.count()).toBe(5);
    const app = createApp(db, readConfig(publicEnv)), cookies = new Map<string, string>();
    for (const role of ['dispatcher', 'loader', 'driver', 'store']) cookies.set(role, await login(app, role));
    const plan = await generateRelease(app, cookies.get('dispatcher')!, PUBLIC_JUDGE_DATES.historyDate);
    expect(plan.summary.served).toBe(9);
    const assigned = plan.decisions.find(decision => decision.order.id === fixture.shortfallOrder.id)!;
    let loading = (await request(app).get(`/api/loader/trips/${assigned.tripId}`).set('Cookie', cookies.get('loader')!)).body as LoaderTripDetail;
    const assignedDriver = await request(app).post(`/api/dispatcher/trips/${loading.id}/driver`).set('Cookie', cookies.get('dispatcher')!)
      .send({ expectedTripVersion: loading.version, driverUserId: fixture.driver.id }); expect(assignedDriver.status).toBe(200);
    loading = (await request(app).get(`/api/loader/trips/${loading.id}`).set('Cookie', cookies.get('loader')!)).body;
    for (const id of loading.stops.map(stop => stop.id)) {
      const stop = loading.stops.find(row => row.id === id)!;
      const loaded = await request(app).post(`/api/loader/stops/${id}/load`).set('Cookie', cookies.get('loader')!).send({
        expectedTripVersion: loading.version, expectedOrderVersion: stop.order.version, expectedStopUpdatedAt: stop.updatedAt,
        expectedLoadRevision: stop.load?.revision ?? 0, loadedUnits: stop.order.orderedUnits });
      expect(loaded.status, JSON.stringify(loaded.body)).toBe(200); loading = loaded.body;
    }
    const ready = await request(app).post(`/api/loader/trips/${loading.id}/ready`).set('Cookie', cookies.get('loader')!).send({ expectedTripVersion: loading.version }); expect(ready.status).toBe(200);
    let trip: DriverTripDetail = (await request(app).post(`/api/driver/trips/${loading.id}/start`).set('Cookie', cookies.get('driver')!).send({ expectedTripVersion: ready.body.version })).body;
    const location = await request(app).put(`/api/location/outlets/${fixture.storeOutlet.id}`).set('Cookie', cookies.get('dispatcher')!)
      .send({ latitude: 6.9, longitude: 79.8, label: 'Synthetic reset fixture', expectedVersion: 0, reason: 'Synthetic reset test coordinates.' });
    expect(location.status, JSON.stringify(location.body)).toBe(200);
    const position = await request(app).post(`/api/location/trips/${trip.id}/position`).set('Cookie', cookies.get('driver')!)
      .send({ latitude: 6.91, longitude: 79.81, accuracyMetres: 10, eventAt: new Date().toISOString() }); expect(position.status, JSON.stringify(position.body)).toBe(200);
    const png = (await sharp({ create: { width: 12, height: 8, channels: 3, background: '#30485a' } }).png().toBuffer()).toString('base64');
    for (const id of trip.stops.map(stop => stop.id)) {
      let stop = trip.stops.find(row => row.id === id)!;
      const arrived = await request(app).post(`/api/driver/stops/${id}/arrival`).set('Cookie', cookies.get('driver')!).send({
        expectedTripVersion: trip.version, expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version }); expect(arrived.status).toBe(200); trip = arrived.body;
      stop = trip.stops.find(row => row.id === id)!;
      const completed = await request(app).post(`/api/driver/stops/${id}/complete`).set('Cookie', cookies.get('driver')!).send({
        expectedTripVersion: trip.version, expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version,
        outcome: 'DELIVERED', deliveredUnits: stop.loadedUnits, recipientName: 'Synthetic Reset Receiver', recipientRole: 'Receiving staff',
        driverNote: 'Synthetic reset transaction test.', ...(stop.order.id === fixture.shortfallOrder.id ? { attachments: [
          { kind: 'PHOTO', contentType: 'image/png', base64: png }, { kind: 'SIGNATURE', contentType: 'image/png', base64: png }
        ] } : {}) }); expect(completed.status, JSON.stringify(completed.body)).toBe(200); trip = completed.body;
    }
    expect((await request(app).post(`/api/driver/trips/${trip.id}/finish`).set('Cookie', cookies.get('driver')!).send({ expectedTripVersion: trip.version })).status).toBe(200);
    const order = await db.order.findUniqueOrThrow({ where: { id: fixture.shortfallOrder.id } });
    expect((await request(app).post(`/api/store/orders/${order.id}/receipt`).set('Cookie', cookies.get('store')!).send({ expectedVersion: order.version, receivedUnits: 192, issueType: 'NONE' })).status).toBe(201);
    const opHash = createHash('sha256').update('Synthetic reset offline evidence').digest('hex');
    await db.offlineOperation.create({ data: { operationId: randomUUID(), userId: fixture.driver.id, entityType: 'TRIP', entityId: trip.id, action: 'FINISH_TRIP', payload: { synthetic: true }, payloadHash: opHash,
      baseVersion: trip.version, createdAt: new Date(), clientEventAt: new Date(), status: 'SYNCED', result: { synthetic: true } } });
    expect(await db.deliveryAttachment.count()).toBe(2); expect(await db.tripPosition.count()).toBe(1); expect(await db.outletLocation.count()).toBe(1); expect(await db.receipt.count()).toBe(1);
  }, 30000);
  it('aborts reset when inventory changed or official provenance appeared', async () => {
    publicMode(); const before = await inspectPublicJudgeReset(db, publicEnv);
    await expect(resetPublicJudgeDemo(db, { expectedInventoryDigest: '0'.repeat(64) }, publicEnv)).rejects.toThrow(/changed/);
    expect((await inspectPublicJudgeReset(db, publicEnv)).inventoryDigest).toBe(before.inventoryDigest);
    const official = await db.referenceImport.create({ data: { source: 'OFFICIAL', digest: 'c'.repeat(64), fileDigests: {}, counts: {} } });
    await expect(resetPublicJudgeDemo(db, { expectedInventoryDigest: before.inventoryDigest }, publicEnv)).rejects.toThrow(/without official/);
    await db.referenceImport.delete({ where: { id: official.id } }); expect((await inspectPublicJudgeReset(db, publicEnv)).inventoryDigest).toBe(before.inventoryDigest);
  }, 30000);
  it('rolls back truncate and reseed entirely when a final assertion fails, with history guards still enabled', async () => {
    publicMode(); const before = await inspectPublicJudgeReset(db, publicEnv);
    await expect(resetPublicJudgeDemo(db, { expectedInventoryDigest: before.inventoryDigest, afterReseed: async () => { throw new Error('Synthetic failure after truncate and reseed.'); } }, publicEnv)).rejects.toThrow(/Synthetic failure/);
    expect((await inspectPublicJudgeReset(db, publicEnv)).inventoryDigest).toBe(before.inventoryDigest);
    await expect(db.deliveryAttachment.deleteMany()).rejects.toThrow(/cannot be replaced or erased/);
    await expect(db.offlineOperation.deleteMany()).rejects.toThrow(/cannot be erased/);
  }, 30000);
  it('refuses unknown foreign-key dependencies under RESTRICT without erasing any data', async () => {
    publicMode(); const before = await inspectPublicJudgeReset(db, publicEnv);
    await db.$executeRaw`CREATE TABLE "PublicResetBlocker" ("id" integer PRIMARY KEY, "orderId" uuid REFERENCES "Order"("id") ON DELETE RESTRICT)`;
    try {
      const withDependency = await inspectPublicJudgeReset(db, publicEnv);
      await expect(resetPublicJudgeDemo(db, { expectedInventoryDigest: withDependency.inventoryDigest }, publicEnv)).rejects.toThrow(/foreign key|referenced|truncate/i);
    } finally { await db.$executeRaw`DROP TABLE "PublicResetBlocker"`; }
    expect((await inspectPublicJudgeReset(db, publicEnv)).inventoryDigest).toBe(before.inventoryDigest);
  }, 30000);
  it('requires the verified private backup boundary before CLI apply', async () => {
    publicMode(); const before = await inspectPublicJudgeReset(db, publicEnv);
    const result = await new Promise<{ code: number | null; stderr: string }>((done, reject) => {
      const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/reset-public-judge.ts', '--apply', `--expected-digest=${before.inventoryDigest}`],
        { env: publicEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = '';
      child.stderr.on('data', data => { stderr += String(data); }); child.on('error', reject); child.on('exit', code => done({ code, stderr }));
    });
    expect(result.code).toBe(1); expect(result.stderr).toContain('Public demo reset stopped');
    expect((await inspectPublicJudgeReset(db, publicEnv)).inventoryDigest).toBe(before.inventoryDigest);
  }, 30000);
  it('commits exactly four confirmed orders and eight fresh audits while retaining account and reference identities', async () => {
    publicMode(); const before = await inspectPublicJudgeReset(db, publicEnv);
    const reset = await resetPublicJudgeDemo(db, { expectedInventoryDigest: before.inventoryDigest }, publicEnv);
    expect(reset.result).toBe('PASS');
    for (const table of PUBLIC_JUDGE_RESET_TABLES) expect(reset.after.tables[table].count).toBe(table === 'Order' ? 4 : table === 'AuditEvent' ? 8 : 0);
    for (const [table, row] of Object.entries(reset.before.tables)) if (!PUBLIC_JUDGE_RESET_TABLES.some(name => name === table)) expect(reset.after.tables[table]).toEqual(row);
    expect((await db.order.findMany()).every(order => order.status === 'CONFIRMED' && order.version === 2)).toBe(true);
    await installPublicJudgeData(db, publicEnv); expect((await inspectPublicJudgeReset(db, publicEnv)).inventoryDigest).toBe(reset.after.inventoryDigest);
  }, 30000);
  it('lets judges generate, validate and release the fresh day, and ordinary restart preserves their work', async () => {
    publicMode(); const app = createApp(db, readConfig(publicEnv)), cookie = await login(app, 'dispatcher');
    const plan = await generateRelease(app, cookie, PUBLIC_JUDGE_DATES.executionDate);
    expect(plan.summary.served).toBe(3); expect(plan.summary.deferred).toBe(0); expect(plan.trips).toHaveLength(2);
    expect((await db.order.findUniqueOrThrow({ where: { orderRef: 'DEMO-PLAN-AMBIENT-100' } })).status).toBe('CONFIRMED');
    expect(await db.planningRun.count({ where: { serviceDate: dateOnly(PUBLIC_JUDGE_DATES.planningDate) } })).toBe(0);
    const before = await inspectPublicJudgeReset(db, publicEnv); await installPublicJudgeData(db, publicEnv);
    expect((await inspectPublicJudgeReset(db, publicEnv)).inventoryDigest).toBe(before.inventoryDigest);
  }, 30000);
  it('requires explicit starter opt-in, separates it from demo mode and prevents a forced operational date', async () => {
    expect(readConfig(starterEnv).DISPATCHER_DEMO_DATE).toBeUndefined();
    expect(() => readConfig({ ...starterEnv, PUBLIC_JUDGE_DEMO: 'true' })).toThrow(/not both/);
    expect(() => readConfig({ ...starterEnv, DISPATCHER_DEMO_DATE: '2040-03-12' })).toThrow(/current business date/);
    const before = await counts(); expect(await installStarterReferenceData(db, productionEnv)).toEqual({ enabled: false }); expect(await counts()).toEqual(before);
    starterMode(); expect(syntheticReferencesPermitted()).toBe(true); expect(await installPublicJudgeData(db, starterEnv)).toEqual({ enabled: false });
  });
  it('rejects official data before installing any starter references', async () => {
    starterMode(); const before = await counts();
    const official = await db.referenceImport.create({ data: { source: 'OFFICIAL', digest: 'd'.repeat(64), fileDigests: {}, counts: {} } });
    await expect(installStarterReferenceData(db, starterEnv)).rejects.toThrow(/without official/); expect(await counts()).toEqual(before);
    await db.referenceImport.delete({ where: { id: official.id } });
  });
  it('adds a current rolling calendar, explicit availability and new weekly fuel without creating orders or changing existing openings', async () => {
    starterMode(); const before = await counts(), now = new Date(), today = businessDate(now);
    const ambient = await db.vehicle.findUniqueOrThrow({ where: { vehicleRef: 'SYN-PLAN-DRIVER-AMBIENT' } });
    const existing = await db.fuelLedger.create({ data: { vehicleId: ambient.id, weekStart: weekStart(today), openingConsumedLitres: '7', openingSource: 'SYNTHETIC' } });
    const prepared = await installStarterReferenceData(db, starterEnv, now);
    expect(prepared).toMatchObject({ enabled: true, currentDate: today, source: 'SYNTHETIC', seededOrders: 0, seededTransactions: 0 });
    expect(await counts()).toEqual(before);
    const end = dateOnly(today); end.setUTCDate(end.getUTCDate() + STARTER_CALENDAR_DAYS);
    expect(await db.calendarDay.count({ where: { date: { gte: dateOnly(today), lte: end }, source: 'SYNTHETIC' } })).toBe(STARTER_CALENDAR_DAYS + 1);
    expect((await db.fuelLedger.findUniqueOrThrow({ where: { id: existing.id } })).openingConsumedLitres?.toString()).toBe('7');
    const availability = await db.vehicleAvailability.findMany({ where: { serviceDate: dateOnly(today), vehicle: { vehicleRef: { in: ['SYN-PLAN-DRIVER-AMBIENT', 'SYN-PLAN-DRIVER-REEFER'] } } } });
    expect(availability).toHaveLength(2); expect(availability.every(row => row.status === 'AVAILABLE' && row.availableFromMinute === 300 && row.availableUntilMinute === 1080 && row.source === 'SYNTHETIC')).toBe(true);
    await db.calendarDay.update({ where: { date: end }, data: { operatingDay: false } });
    await db.vehicleAvailability.update({ where: { id: availability[0].id }, data: { status: 'UNAVAILABLE', note: 'Operator changed availability.' } });
    const inventory = await inspectPublicJudgeReset(db, starterEnv); await installStarterReferenceData(db, starterEnv, now);
    expect((await inspectPublicJudgeReset(db, starterEnv)).inventoryDigest).toBe(inventory.inventoryDigest);
  }, 30000);
  it('resets starter mode to zero operational records transactionally and refuses the four-order reset', async () => {
    starterMode(); const before = await inspectPublicJudgeReset(db, starterEnv);
    await expect(resetPublicJudgeDemo(db, { expectedInventoryDigest: before.inventoryDigest }, starterEnv)).rejects.toThrow(/empty-order reset/);
    await expect(resetPublicJudgeDemo(db, { expectedInventoryDigest: before.inventoryDigest, emptyOrders: true, afterReseed: async () => { throw new Error('Empty reset rollback test.'); } }, starterEnv)).rejects.toThrow(/rollback test/);
    expect((await inspectPublicJudgeReset(db, starterEnv)).inventoryDigest).toBe(before.inventoryDigest);
    const reset = await resetPublicJudgeDemo(db, { expectedInventoryDigest: before.inventoryDigest, emptyOrders: true }, starterEnv);
    for (const table of PUBLIC_JUDGE_RESET_TABLES) expect(reset.after.tables[table].count).toBe(0);
    for (const [table, row] of Object.entries(reset.before.tables)) if (!PUBLIC_JUDGE_RESET_TABLES.some(name => name === table)) expect(reset.after.tables[table]).toEqual(row);
    expect(reset.orders).toEqual([]); await installStarterReferenceData(db, starterEnv);
    expect((await inspectPublicJudgeReset(db, starterEnv)).inventoryDigest).toBe(reset.after.inventoryDigest);
  }, 30000);
  it('shows normal current-date empty workspaces with no judge metadata and nearby Store operating dates', async () => {
    starterMode(); const app = createApp(db, readConfig(starterEnv)), today = businessDate(new Date());
    for (const role of ['store', 'dispatcher', 'loader', 'driver']) {
      const cookie = await login(app, role), workspace = await request(app).get(`/api/workspaces/${role}`).set('Cookie', cookie);
      expect(workspace.status).toBe(200); expect(workspace.body.publicJudge).toBeUndefined();
      const path = { store: '/api/store/context', dispatcher: '/api/dispatcher/context', loader: '/api/loader/loads', driver: '/api/driver/routes' }[role]!;
      const context = await request(app).get(path).set('Cookie', cookie); expect(context.status, JSON.stringify(context.body)).toBe(200);
      if (role === 'store') { const end = dateOnly(today); end.setUTCDate(end.getUTCDate() + STARTER_CALENDAR_DAYS);
        expect(context.body.today).toBe(today); expect(context.body.operatingDates).toHaveLength(45); expect(context.body.operatingDates.every((day: string) => dateOnly(day) <= end)).toBe(true); }
      else { expect(context.body.selectedDate).toBe(today); if (role === 'dispatcher') expect(context.body.dateSource).toBe('CURRENT_DATE'); else expect(context.body.trips).toEqual([]); }
    }
  }, 30000);
  it('runs Store demand through planning, loading, normal-clock delivery and receipt without any seeded orders', async () => {
    starterMode(); const app = createApp(db, readConfig(starterEnv)), cookies = new Map<string, string>();
    for (const role of ['store', 'dispatcher', 'loader', 'driver']) cookies.set(role, await login(app, role));
    const context = await request(app).get('/api/store/context').set('Cookie', cookies.get('store')!);
    const created = await request(app).post('/api/store/orders').set('Cookie', cookies.get('store')!).send({
      requestedDeliveryDate: context.body.nextEligibleDate, temperatureRequirement: 'AMBIENT', orderedUnits: 10, orderedWeightKg: 1, orderedVolumeM3: 0.01 });
    expect(created.status, JSON.stringify(created.body)).toBe(201); expect(created.body.status).toBe('CONFIRMED'); expect(created.body.version).toBe(2); expect(created.body.orderRef).toMatch(/^WP-/);
    expect(await db.order.count()).toBe(1); const date = created.body.eligibleDeliveryDate;
    const plan = await generateRelease(app, cookies.get('dispatcher')!, date); expect(plan.summary.served).toBe(1); expect(plan.trips).toHaveLength(1);
    let loading: LoaderTripDetail = (await request(app).get(`/api/loader/trips/${plan.trips[0].id}`).set('Cookie', cookies.get('loader')!)).body;
    const driver = await db.user.findUniqueOrThrow({ where: { email: 'driver@waypoint.local' } });
    expect((await request(app).post(`/api/dispatcher/trips/${loading.id}/driver`).set('Cookie', cookies.get('dispatcher')!).send({ expectedTripVersion: loading.version, driverUserId: driver.id })).status).toBe(200);
    loading = (await request(app).get(`/api/loader/trips/${loading.id}`).set('Cookie', cookies.get('loader')!)).body;
    const stop = loading.stops[0];
    const loaded = await request(app).post(`/api/loader/stops/${stop.id}/load`).set('Cookie', cookies.get('loader')!).send({ expectedTripVersion: loading.version,
      expectedOrderVersion: stop.order.version, expectedStopUpdatedAt: stop.updatedAt, expectedLoadRevision: stop.load?.revision ?? 0, loadedUnits: 10 });
    expect(loaded.status, JSON.stringify(loaded.body)).toBe(200);
    const ready = await request(app).post(`/api/loader/trips/${loading.id}/ready`).set('Cookie', cookies.get('loader')!).send({ expectedTripVersion: loaded.body.version }); expect(ready.status).toBe(200);
    const startedAt = new Date(); const started = await request(app).post(`/api/driver/trips/${loading.id}/start`).set('Cookie', cookies.get('driver')!).send({ expectedTripVersion: ready.body.version });
    expect(started.status, JSON.stringify(started.body)).toBe(200); let trip: DriverTripDetail = started.body;
    expect(new Date(trip.actualDeparture!).getTime()).toBeGreaterThanOrEqual(startedAt.getTime()); expect(new Date(trip.actualDeparture!).getTime()).toBeLessThanOrEqual(Date.now());
    const arrived = await request(app).post(`/api/driver/stops/${stop.id}/arrival`).set('Cookie', cookies.get('driver')!).send({ expectedTripVersion: trip.version, expectedStopVersion: trip.stops[0].version, expectedOrderVersion: trip.stops[0].order.version }); expect(arrived.status).toBe(200); trip = arrived.body;
    const delivered = await request(app).post(`/api/driver/stops/${stop.id}/complete`).set('Cookie', cookies.get('driver')!).send({ expectedTripVersion: trip.version, expectedStopVersion: trip.stops[0].version,
      expectedOrderVersion: trip.stops[0].order.version, outcome: 'DELIVERED', deliveredUnits: 10, recipientName: 'Starter Workflow Test', recipientRole: 'Receiving staff' });
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200); trip = delivered.body;
    expect((await request(app).post(`/api/driver/trips/${trip.id}/finish`).set('Cookie', cookies.get('driver')!).send({ expectedTripVersion: trip.version })).status).toBe(200);
    const order = await db.order.findUniqueOrThrow({ where: { id: created.body.id } });
    expect((await request(app).post(`/api/store/orders/${order.id}/receipt`).set('Cookie', cookies.get('store')!).send({ expectedVersion: order.version, receivedUnits: 10, issueType: 'NONE' })).status).toBe(201);
    const before = await inspectPublicJudgeReset(db, starterEnv); await installStarterReferenceData(db, starterEnv); expect((await inspectPublicJudgeReset(db, starterEnv)).inventoryDigest).toBe(before.inventoryDigest);
    expect(await db.order.count()).toBe(1); expect(await db.receipt.count()).toBe(1);
  }, 30000);
});
