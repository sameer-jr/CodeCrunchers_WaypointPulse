import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { cookieOptions } from '../auth.js';
import { readConfig } from '../config.js';
import { checkPlanningOptions } from '../planning/data.js';
import { storeNow } from '../store/cutoff.js';
import { dateOnly, isoWeek } from './dates.js';
import { installPublicJudgeData } from './public-judge.js';
import { syntheticReferencesPermitted } from './synthetic-mode.js';

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
    expect(() => readConfig({ ...publicEnv, DISPATCHER_DEMO_DATE: '2040-03-06' })).toThrow(/2040-03-05/);
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
  it('installs only independently authored SYNTHETIC demand and permits the existing plan workflow under production safeguards', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true');
    const result = await installPublicJudgeData(db, publicEnv);
    expect(result).toMatchObject({ enabled: true, source: 'SYNTHETIC', serviceDate: '2040-03-05', orderedUnits: 192 });
    expect(await db.order.count()).toBe(14); expect(await db.trip.count()).toBe(0);
    expect(await db.outlet.count({ where: { source: 'OFFICIAL' } })).toBe(0); expect(await db.vehicle.count({ where: { source: 'OFFICIAL' } })).toBe(0);
    expect((await db.user.findMany()).map(user => user.role).sort()).toEqual(['DISPATCHER', 'DRIVER', 'LOADER', 'STORE_MANAGER']);
    const config = readConfig(publicEnv); expect(config.DISPATCHER_DEMO_DATE).toBe('2040-03-05');
    const app = createApp(db, config), login = await request(app).post('/api/auth/login').send({ email: 'dispatcher@waypoint.local', password: publicEnv.SEED_DEMO_PASSWORD });
    expect(login.status).toBe(200); expect(String(login.headers['set-cookie'])).toContain('Secure');
    const cookies = login.headers['set-cookie'];
    const depot = await db.depot.findUniqueOrThrow({ where: { name: 'SYNTHETIC Allocation DRIVER Depot' } });
    expect(await db.order.count({ where: { outlet: { depotId: depot.id } } })).toBe(13);
    const generated = await request(app).post('/api/dispatcher/plans').set('Cookie', cookies).send({ serviceDate: '2040-03-05', depotId: depot.id });
    expect(generated.status, JSON.stringify(generated.body)).toBe(201); expect(generated.body.summary.served).toBe(9);
    const validated = await request(app).post(`/api/dispatcher/plans/${generated.body.id}/validate`).set('Cookie', cookies).send({ expectedVersion: generated.body.version });
    expect(validated.status).toBe(200); expect(validated.body.validation.valid).toBe(true);
    const released = await request(app).post(`/api/dispatcher/plans/${generated.body.id}/release`).set('Cookie', cookies).send({ expectedVersion: validated.body.version });
    expect(released.status, JSON.stringify(released.body)).toBe(200); expect(released.body.status).toBe('RELEASED');
  }, 30000);
  it('repeated production judge installation preserves generated plans, immutable quantities, users and audit history', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PUBLIC_JUDGE_DEMO', 'true');
    const before = await snapshot(), users = await db.user.findMany({ orderBy: { id: 'asc' } }), orders = await db.order.findMany({ orderBy: { id: 'asc' } });
    const plans = await db.planningRun.findMany({ orderBy: { id: 'asc' } });
    expect((await installPublicJudgeData(db, publicEnv)).enabled).toBe(true);
    expect(await snapshot()).toEqual(before); expect(await db.user.findMany({ orderBy: { id: 'asc' } })).toEqual(users);
    expect(await db.order.findMany({ orderBy: { id: 'asc' } })).toEqual(orders); expect(await db.planningRun.findMany({ orderBy: { id: 'asc' } })).toEqual(plans);
  });
});
