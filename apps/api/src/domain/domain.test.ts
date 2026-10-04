import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { auditMetadataSchema } from './audit.js';
import { businessDate, dateOnly, weekStart } from './dates.js';
import { fuelAvailability } from './fuel.js';
import { transitionOrder } from './lifecycle.js';
import { importReferenceFiles, validateReferenceFiles } from './reference-data.js';
import { assertTripScope, resolveActor } from './scope.js';
import { installSyntheticFixture, SYNTHETIC_DATE, syntheticOrder, syntheticReferenceFiles } from './testing/synthetic.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('Run npm run test; domain tests require isolated PostgreSQL.');
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const app = createApp(db, readConfig({ ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }));
let fixture: Awaited<ReturnType<typeof installSyntheticFixture>>;
beforeAll(async () => { fixture = await installSyntheticFixture(db); });
afterAll(async () => { await db.$disconnect(); });
const options = { allowSyntheticReferences: true };
async function stopFor(orderId: string, tripId = fixture.trip.id) {
  const maximum = await db.tripStop.aggregate({ where: { tripId }, _max: { sequence: true } });
  return db.tripStop.create({ data: { orderId, tripId, sequence: (maximum._max.sequence ?? 0) + 1 } });
}
async function agentFor(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
  return agent;
}
async function quantities() {
  const order = await syntheticOrder(db, fixture.fresh.id);
  const stop = await stopFor(order.id);
  const load = await db.loadRecord.create({ data: { tripStopId: stop.id, expectedUnits: 73, loadedUnits: 69, status: 'COMPLETE', reason: 'Synthetic shortfall',
    reviewStatus: 'APPROVED', recordedByUserId: fixture.loader.id, recordedAt: new Date(), reviewedByUserId: fixture.dispatcher.id, reviewedAt: new Date() } });
  const delivery = await db.deliveryRecord.create({ data: { tripStopId: stop.id, loadRecordId: load.id, expectedLoadedUnits: 69,
    deliveredUnits: 66, outcome: 'PARTIALLY_DELIVERED', driverNote: 'Synthetic delivery variance', recordedByDriverId: fixture.driver.id,
    arrivedAt: new Date('2040-01-02T00:00:00Z'), completedAt: new Date('2040-01-02T00:05:00Z') } });
  const receipt = await db.receipt.create({ data: { deliveryRecordId: delivery.id, receivedUnits: 65, status: 'ISSUE_REPORTED', issueNote: 'Synthetic receipt discrepancy', confirmedByUserId: fixture.store.id, confirmedAt: new Date() } });
  return { order, stop, load, delivery, receipt };
}

describe('Private reference import', () => {
  it('imports complete synthetic reference data once, with explicit provenance and an audit event', async () => {
    const result = await importReferenceFiles(db, syntheticReferenceFiles(), 'SYNTHETIC');
    expect(result.repeated).toBe(true);
    expect(await db.referenceImport.count()).toBe(1);
    expect(await db.auditEvent.count({ where: { eventType: 'REFERENCE_DATA_IMPORTED', entityId: result.id } })).toBe(1);
    expect(await db.outlet.count({ where: { source: 'SYNTHETIC' } })).toBe(4);
  });
  it('rejects a duplicate outlet reference', () => {
    const files = syntheticReferenceFiles();
    files['outlets.csv'] += files['outlets.csv'].split('\n')[1] + '\n';
    expect(() => validateReferenceFiles(files)).toThrow(/duplicate/);
  });
  it.each(['0', '-1', '', 'NaN', '1e6'])('rejects invalid vehicle capacity %s', value => {
    const files = syntheticReferenceFiles();
    files['vehicles.csv'] = files['vehicles.csv'].replace(',900,', `,${value},`);
    expect(() => validateReferenceFiles(files)).toThrow(/weight_cap_kg/);
  });
  it('rejects invalid enums, time formats, duplicate headers and missing references', () => {
    const files = syntheticReferenceFiles();
    expect(() => validateReferenceFiles({ ...files, 'vehicles.csv': files['vehicles.csv'].replace(',reefer,', ',unknown,') })).toThrow(/temp/);
    expect(() => validateReferenceFiles({ ...files, 'outlets.csv': files['outlets.csv'].replace('05:00', '25:00') })).toThrow(/window_open_time/);
    expect(() => validateReferenceFiles({ ...files, 'outlets.csv': files['outlets.csv'].replace('outlet_id,brand', 'outlet_id,outlet_id') })).toThrow(/headers/);
    expect(() => validateReferenceFiles({ ...files, 'vehicles.csv': files['vehicles.csv'].replace(',Peliyagoda', ',Unknown Depot') })).toThrow(/depot reference/);
  });
  it('preserves both depot and district in travel keys', async () => {
    const rows = await db.districtTravel.findMany({ where: { district: 'Synthetic District' }, include: { depot: true } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.depot.name))).toEqual(new Set(['Peliyagoda', 'Kandy']));
    expect(new Set(rows.map(row => row.depotDistanceKm.toString())).size).toBe(2);
  });
  it('rejects malformed source CSV without importing any rows', async () => {
    const before = await db.outlet.count(), imports = await db.referenceImport.count();
    const files = syntheticReferenceFiles();
    files['calendar.csv'] += 'malformed,row\n';
    await expect(importReferenceFiles(db, files, 'SYNTHETIC')).rejects.toThrow(/malformed CSV/);
    expect(await db.outlet.count()).toBe(before); expect(await db.referenceImport.count()).toBe(imports);
  });
  it('rolls back earlier inserts if a later reference table conflicts', async () => {
    const files = syntheticReferenceFiles();
    files['outlets.csv'] = files['outlets.csv'].replaceAll('SYN-', 'SYN-ROLLBACK-');
    const before = await db.outlet.count(), imports = await db.referenceImport.count();
    await expect(importReferenceFiles(db, files, 'SYNTHETIC')).rejects.toThrow(/rolled back/);
    expect(await db.outlet.count()).toBe(before); expect(await db.referenceImport.count()).toBe(imports);
  });
});

describe('Authoritative lifecycle and audit trail', () => {
  it('accepts a scoped confirmation, increments version, preserves quantities and audits the transition', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id);
    const updated = await transitionOrder(db, { actorUserId: fixture.store.id, orderId: order.id, next: 'CONFIRMED', expectedVersion: 1 }, options);
    expect(updated.status).toBe('CONFIRMED'); expect(updated.version).toBe(2); expect(updated.orderedUnits).toBe(73); expect(updated.confirmedAt).not.toBeNull();
    const event = await db.auditEvent.findFirstOrThrow({ where: { entityId: order.id } });
    expect(event.actorUserId).toBe(fixture.store.id); expect(event.actorRole).toBe('STORE_MANAGER'); expect(event.eventType).toBe('ORDER_CONFIRMED');
    expect(event.metadata).toEqual({ fromStatus: 'DRAFT', toStatus: 'CONFIRMED', version: 2, quantities: { orderedUnits: 73, loadedUnits: null, deliveredUnits: null, receivedUnits: null } });
  });
  it('rejects invalid jumps and missing planning data', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id);
    await expect(transitionOrder(db, { actorUserId: fixture.store.id, orderId: order.id, next: 'DELIVERED', expectedVersion: 1 }, options)).rejects.toThrow(/not allowed/);
    await transitionOrder(db, { actorUserId: fixture.store.id, orderId: order.id, next: 'CONFIRMED', expectedVersion: 1 }, options);
    await transitionOrder(db, { actorUserId: fixture.dispatcher.id, orderId: order.id, next: 'CLOSED_FOR_PLANNING', expectedVersion: 2 }, options);
    await expect(transitionOrder(db, { actorUserId: fixture.dispatcher.id, orderId: order.id, next: 'PLANNED', expectedVersion: 3 }, options)).rejects.toThrow(/active trip stop/);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).version).toBe(3);
  });
  it('checks related records throughout release, shortfall hold, delivery and receipt resolution', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id, 'AMBIENT');
    let version = 1;
    const step = async (actorUserId: string, next: Parameters<typeof transitionOrder>[1]['next']) => {
      const result = await transitionOrder(db, { actorUserId, orderId: order.id, next, expectedVersion: version }, options);
      version = result.version; return result;
    };
    await step(fixture.store.id, 'CONFIRMED'); await step(fixture.dispatcher.id, 'CLOSED_FOR_PLANNING');
    const trip = await db.trip.create({ data: { tripRef: `SYN-${randomUUID()}`, vehicleId: fixture.truck.id, serviceDate: dateOnly('2040-01-03'), tripNumber: 1,
      status: 'PLANNED', driverUserId: fixture.driver.id, plannedDeparture: new Date('2040-01-02T23:30:00Z') } });
    const stop = await stopFor(order.id, trip.id);
    const plan = await db.planningRun.create({ data: { planningRef: `SYN-${randomUUID()}`, serviceDate: trip.serviceDate, depotId: fixture.fresh.depotId, status: 'VALIDATED', validatedAt: new Date() } });
    await db.allocation.create({ data: { orderId: order.id, planningRunId: plan.id, tripStopId: stop.id, decision: 'ASSIGNED' } });
    await step(fixture.dispatcher.id, 'PLANNED');
    await expect(step(fixture.dispatcher.id, 'RELEASED_TO_LOADING')).rejects.toThrow(/released planning run/);
    await db.planningRun.update({ where: { id: plan.id }, data: { status: 'RELEASED', releasedAt: new Date() } });
    await db.trip.update({ where: { id: trip.id }, data: { status: 'RELEASED' } });
    await step(fixture.dispatcher.id, 'RELEASED_TO_LOADING');
    const load = await db.loadRecord.create({ data: { tripStopId: stop.id, expectedUnits: 73, status: 'LOADING', recordedByUserId: fixture.loader.id, recordedAt: new Date() } });
    await step(fixture.loader.id, 'LOADING');
    await db.loadRecord.update({ where: { id: load.id }, data: { loadedUnits: 69, status: 'EXCEPTION', reviewStatus: 'PENDING', reason: 'Synthetic shortage' } });
    const loadingIssue = await db.exception.create({ data: { loadRecordId: load.id, orderId: order.id, type: 'LOADING_SHORTFALL', message: 'Synthetic shortage review', createdByUserId: fixture.loader.id } });
    await step(fixture.loader.id, 'LOADING_EXCEPTION');
    await expect(step(fixture.dispatcher.id, 'READY_FOR_DISPATCH')).rejects.toThrow(/completed load/);
    await db.loadRecord.update({ where: { id: load.id }, data: { status: 'COMPLETE', reviewStatus: 'APPROVED', reviewedByUserId: fixture.dispatcher.id, reviewedAt: new Date() } });
    await expect(step(fixture.dispatcher.id, 'READY_FOR_DISPATCH')).rejects.toThrow(/Open loading exceptions/);
    await db.exception.update({ where: { id: loadingIssue.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), reviewedByUserId: fixture.dispatcher.id } });
    await step(fixture.dispatcher.id, 'READY_FOR_DISPATCH');
    await expect(step(fixture.driver.id, 'IN_TRANSIT')).rejects.toThrow(/recorded trip departure/);
    await db.trip.update({ where: { id: trip.id }, data: { status: 'IN_TRANSIT', actualDeparture: new Date('2040-01-02T23:30:00Z') } });
    await step(fixture.driver.id, 'IN_TRANSIT');
    await db.tripStop.update({ where: { id: stop.id }, data: { status: 'ARRIVED', actualArrival: new Date('2040-01-03T00:00:00Z') } });
    await step(fixture.driver.id, 'ARRIVED');
    const delivery = await db.deliveryRecord.create({ data: { tripStopId: stop.id, loadRecordId: load.id, expectedLoadedUnits: 69, deliveredUnits: 66,
      outcome: 'PARTIALLY_DELIVERED', driverNote: 'Synthetic delivery variance', arrivedAt: new Date('2040-01-03T00:00:00Z'), completedAt: new Date('2040-01-03T00:05:00Z'), recordedByDriverId: fixture.driver.id } });
    await db.tripStop.update({ where: { id: stop.id }, data: { status: 'COMPLETED' } });
    await expect(step(fixture.driver.id, 'DELIVERED')).rejects.toThrow(/outcome and stop completion/);
    await expect(step(fixture.driver.id, 'PARTIALLY_DELIVERED')).rejects.toThrow(/recipient proof/);
    await db.deliveryProof.create({ data: { deliveryRecordId: delivery.id, recipientName: 'Synthetic recipient' } });
    await step(fixture.driver.id, 'PARTIALLY_DELIVERED'); await step(fixture.driver.id, 'AWAITING_RECEIPT');
    const receipt = await db.receipt.create({ data: { deliveryRecordId: delivery.id, receivedUnits: 65, status: 'ISSUE_REPORTED', issueNote: 'Synthetic receipt variance', confirmedByUserId: fixture.store.id, confirmedAt: new Date() } });
    const receiptIssue = await db.exception.create({ data: { receiptId: receipt.id, orderId: order.id, type: 'RECEIPT_DISCREPANCY', message: 'Synthetic receipt discrepancy', createdByUserId: fixture.store.id } });
    await step(fixture.store.id, 'RECEIPT_ISSUE');
    await db.receipt.update({ where: { id: receipt.id }, data: { receivedUnits: 66, status: 'CONFIRMED' } });
    await expect(step(fixture.store.id, 'RECEIPT_CONFIRMED')).rejects.toThrow(/Discrepancies must be resolved/);
    await db.exception.update({ where: { id: receiptIssue.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), reviewedByUserId: fixture.dispatcher.id } });
    const completed = await step(fixture.store.id, 'RECEIPT_CONFIRMED');
    expect(completed.orderedUnits).toBe(73); expect(completed.status).toBe('RECEIPT_CONFIRMED');
    const issueAudit = await db.auditEvent.findFirstOrThrow({ where: { entityId: order.id, eventType: 'RECEIPT_ISSUE_REPORTED' } });
    expect(issueAudit.metadata).toMatchObject({ quantities: { orderedUnits: 73, loadedUnits: 69, deliveredUnits: 66, receivedUnits: 65 } });
    expect(await db.auditEvent.count({ where: { entityId: order.id } })).toBe(13);
  });
  it('does not treat synthetic calendars as official eligibility', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id);
    await expect(transitionOrder(db, { actorUserId: fixture.store.id, orderId: order.id, next: 'CONFIRMED', expectedVersion: 1 })).rejects.toThrow(/Synthetic calendar/);
    const closed = await db.order.create({ data: { orderRef: `SYN-${randomUUID()}`, outletId: fixture.fresh.id, requestedDeliveryDate: dateOnly('2040-01-08'), temperatureRequirement: 'FROZEN', orderedUnits: 5, orderedWeightKg: 4, orderedVolumeM3: 1 } });
    await expect(transitionOrder(db, { actorUserId: fixture.store.id, orderId: closed.id, next: 'CONFIRMED', expectedVersion: 1 }, options)).rejects.toThrow(/operating calendar/);
  });
  it('rejects unauthorized transition roles and client role injection', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id); await stopFor(order.id);
    await expect(transitionOrder(db, { actorUserId: fixture.loader.id, orderId: order.id, next: 'CONFIRMED', expectedVersion: 1 }, options)).rejects.toMatchObject({ code: 'DOMAIN_FORBIDDEN' });
    const injected = { actorUserId: fixture.store.id, orderId: order.id, next: 'CONFIRMED' as const, expectedVersion: 1, role: 'DISPATCHER' };
    await expect(transitionOrder(db, injected, options)).rejects.toThrow(/roles and unrelated fields/);
  });
  it('prevents concurrent confirmations from producing duplicate transitions', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id);
    const input = { actorUserId: fixture.store.id, orderId: order.id, next: 'CONFIRMED' as const, expectedVersion: 1 };
    const results = await Promise.allSettled([transitionOrder(db, input, options), transitionOrder(db, input, options)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { entityId: order.id } })).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).version).toBe(2);
  });
  it('rolls back the order if audit insertion fails', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id);
    await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER test_reject_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_audit()');
    try {
      await expect(transitionOrder(db, { actorUserId: fixture.store.id, orderId: order.id, next: 'CONFIRMED', expectedVersion: 1 }, options)).rejects.toThrow();
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DRAFT');
      expect(await db.auditEvent.count({ where: { entityId: order.id } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER test_reject_audit ON "AuditEvent"'); await db.$executeRawUnsafe('DROP FUNCTION test_reject_audit()');
    }
  });
  it('rejects direct status bypasses, confirmed quantity edits, audit mutation and sensitive metadata', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id);
    await expect(db.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } })).rejects.toThrow();
    await transitionOrder(db, { actorUserId: fixture.store.id, orderId: order.id, next: 'CONFIRMED', expectedVersion: 1 }, options);
    await expect(db.order.update({ where: { id: order.id }, data: { orderedUnits: 69 } })).rejects.toThrow();
    const event = await db.auditEvent.findFirstOrThrow({ where: { entityId: order.id } });
    await expect(db.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow();
    expect(() => auditMetadataSchema.parse({ password: 'synthetic-secret' })).toThrow();
  });
});

describe('Quantity integrity and durable evidence', () => {
  it('retains four independent business facts: ordered, loaded, delivered and received', async () => {
    const data = await quantities();
    const order = await db.order.findUniqueOrThrow({ where: { id: data.order.id }, include: { stops: { include: { load: true, delivery: { include: { receipt: true } } } } } });
    expect(order.orderedUnits).toBe(73); expect(order.stops[0].load!.loadedUnits).toBe(69);
    expect(order.stops[0].delivery!.deliveredUnits).toBe(66); expect(order.stops[0].delivery!.receipt!.receivedUnits).toBe(65);
    expect(order.stops[0].delivery!.receipt!.status).toBe('ISSUE_REPORTED');
    await expect(db.receipt.update({ where: { id: data.receipt.id }, data: { status: 'CONFIRMED' } })).rejects.toThrow();
    await expect(db.loadRecord.update({ where: { id: data.load.id }, data: { loadedUnits: 70 } })).rejects.toThrow();
    await expect(db.deliveryRecord.update({ where: { id: data.delivery.id }, data: { deliveredUnits: 67 } })).rejects.toThrow();
  });
  it('rejects mismatched delivery snapshots and temporary browser evidence URLs', async () => {
    const data = await quantities();
    await expect(db.deliveryRecord.update({ where: { id: data.delivery.id }, data: { expectedLoadedUnits: 73 } })).rejects.toThrow();
    await expect(db.deliveryProof.create({ data: { deliveryRecordId: data.delivery.id, photoStorageKey: 'blob:temporary-browser-reference' } })).rejects.toThrow();
    const proof = await db.deliveryProof.create({ data: { deliveryRecordId: data.delivery.id, recipientName: 'Synthetic recipient', photoStorageKey: 'synthetic/proof/photo.png' } });
    expect(proof.photoStorageKey).toBe('synthetic/proof/photo.png');
  });
});

describe('Trip structure and object authorization', () => {
  it('rejects duplicate stop sequence and concurrent active order assignments', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id), other = await syntheticOrder(db, fixture.fresh.id);
    const stop = await stopFor(order.id);
    await expect(db.tripStop.create({ data: { tripId: fixture.trip.id, orderId: other.id, sequence: stop.sequence } })).rejects.toThrow();
    await expect(db.tripStop.create({ data: { tripId: fixture.trip.id, orderId: order.id, sequence: stop.sequence + 1 } })).rejects.toThrow();
  });
  it('allows trip two, rejects trip three and duplicate vehicle/day/number', async () => {
    const data = { vehicleId: fixture.reefer.id, serviceDate: dateOnly(SYNTHETIC_DATE), status: 'PLANNED' as const };
    await db.trip.create({ data: { ...data, tripRef: `SYN-${randomUUID()}`, tripNumber: 2 } });
    await expect(db.trip.create({ data: { ...data, tripRef: `SYN-${randomUUID()}`, tripNumber: 3 } })).rejects.toThrow();
    await expect(db.trip.create({ data: { ...data, tripRef: `SYN-${randomUUID()}`, tripNumber: 2 } })).rejects.toThrow();
  });
  it('rejects unknown vehicle/calendar references and cross-depot stops', async () => {
    await expect(db.trip.create({ data: { tripRef: `SYN-${randomUUID()}`, vehicleId: randomUUID(), serviceDate: dateOnly(SYNTHETIC_DATE), tripNumber: 1 } })).rejects.toThrow();
    await expect(db.trip.create({ data: { tripRef: `SYN-${randomUUID()}`, vehicleId: fixture.truck.id, serviceDate: dateOnly('2041-02-01'), tripNumber: 1 } })).rejects.toThrow();
    const order = await syntheticOrder(db, fixture.fresh.id);
    await expect(stopFor(order.id, fixture.otherTrip.id)).rejects.toThrow();
    await expect(db.trip.update({ where: { id: fixture.trip.id }, data: { vehicleId: fixture.van.id } })).rejects.toThrow();
  });
  it('limits Store reads to assigned outlets and Driver reads to assigned released trips', async () => {
    const store = await agentFor('store@waypoint.local'), driver = await agentFor('driver@waypoint.local');
    expect((await store.get(`/api/domain/outlets/${fixture.fresh.id}`)).status).toBe(200);
    expect((await store.get(`/api/domain/outlets/${fixture.style.id}`)).status).toBe(403);
    expect((await driver.get(`/api/domain/trips/${fixture.trip.id}`)).status).toBe(200);
    expect((await driver.get(`/api/domain/trips/${fixture.otherTrip.id}`)).status).toBe(403);
    expect((await store.get(`/api/domain/trips/${fixture.trip.id}`)).status).toBe(403);
    expect((await request(app).get(`/api/domain/trips/${fixture.trip.id}`)).status).toBe(401);
  });
  it('prevents Loader mutation outside its depot and denies unreleased trip access', async () => {
    const order = await syntheticOrder(db, fixture.tech.id, 'AMBIENT'); await stopFor(order.id, fixture.otherTrip.id);
    await expect(transitionOrder(db, { actorUserId: fixture.loader.id, orderId: order.id, next: 'CONFIRMED', expectedVersion: 1 }, options)).rejects.toMatchObject({ code: 'DOMAIN_FORBIDDEN' });
    const trip = await db.trip.create({ data: { tripRef: `SYN-${randomUUID()}`, vehicleId: fixture.truck.id, serviceDate: dateOnly(SYNTHETIC_DATE), tripNumber: 1, driverUserId: fixture.driver.id } });
    await expect(assertTripScope(db, await resolveActor(db, fixture.loader.id), trip.id, true)).rejects.toMatchObject({ code: 'DOMAIN_FORBIDDEN' });
    await expect(assertTripScope(db, await resolveActor(db, fixture.driver.id), trip.id)).rejects.toMatchObject({ code: 'DOMAIN_FORBIDDEN' });
  });
  it('applies object scope to order reads without returning credentials or proof details', async () => {
    const own = await syntheticOrder(db, fixture.fresh.id); await stopFor(own.id);
    const other = await syntheticOrder(db, fixture.tech.id, 'FROZEN'); await stopFor(other.id, fixture.otherTrip.id);
    const store = await agentFor('store@waypoint.local'), driver = await agentFor('driver@waypoint.local'), dispatcher = await agentFor('dispatcher@waypoint.local');
    const response = await store.get(`/api/domain/orders/${own.id}`);
    expect(response.status).toBe(200); expect(response.body.data.orderedUnits).toBe(73);
    expect(Object.keys(response.body.data)).not.toContain('createdBy'); expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect((await driver.get(`/api/domain/orders/${own.id}`)).status).toBe(200);
    for (const agent of [store, driver, dispatcher]) expect((await agent.get(`/api/domain/orders/${other.id}`)).status).toBe(403);
    expect((await store.get('/api/domain/orders/invalid')).status).toBe(400);
    expect((await store.post(`/api/domain/orders/${own.id}`).send({ status: 'DELIVERED', role: 'DISPATCHER' })).status).toBe(404);
  });
});

describe('Deferral history and Colombo fuel weeks', () => {
  it('retains repeated deferrals without overwriting prior reasons', async () => {
    const order = await syntheticOrder(db, fixture.fresh.id);
    await transitionOrder(db, { actorUserId: fixture.store.id, orderId: order.id, next: 'CONFIRMED', expectedVersion: 1 }, options);
    for (const [index, reasonCode] of (['CAPACITY', 'FUEL_UNKNOWN'] as const).entries()) {
      await transitionOrder(db, { actorUserId: fixture.dispatcher.id, orderId: order.id, next: 'DEFERRED', expectedVersion: index + 2,
        deferral: { reasonCode, reasonDetail: `Synthetic decision ${index + 1}` } }, options);
    }
    const history = await db.deferralRecord.findMany({ where: { orderId: order.id }, orderBy: { deferredAt: 'asc' } });
    expect(history.map(row => row.reasonCode)).toEqual(['CAPACITY', 'FUEL_UNKNOWN']);
    expect(await db.auditEvent.count({ where: { entityId: order.id, eventType: 'ORDER_DEFERRED' } })).toBe(2);
    await expect(db.deferralRecord.delete({ where: { id: history[0].id } })).rejects.toThrow();
  });
  it('uses Colombo business dates and Monday to Sunday weeks across UTC boundaries', () => {
    expect(businessDate(new Date('2040-01-01T19:00:00Z'))).toBe('2040-01-02');
    expect(weekStart('2040-01-08').toISOString().slice(0, 10)).toBe('2040-01-02');
    expect(() => dateOnly('2040-02-30')).toThrow();
  });
  it('retains recorded usage separately from quota and never assumes missing history is zero', async () => {
    expect(await fuelAvailability(db, fixture.truck.id, SYNTHETIC_DATE)).toMatchObject({ known: false, remainingLitres: null });
    const ledger = await db.fuelLedger.create({ data: { vehicleId: fixture.reefer.id, weekStart: weekStart(SYNTHETIC_DATE), openingConsumedLitres: 11, openingSource: 'SYNTHETIC' } });
    for (const [kind, litres] of [['CONSUMED', 2], ['RESERVED', 3]] as const) await db.fuelUsage.create({ data: { ledgerId: ledger.id, tripId: fixture.trip.id, kind, litres, occurredAt: new Date('2040-01-02T00:00:00Z'), source: 'SYNTHETIC' } });
    expect(await fuelAvailability(db, fixture.reefer.id, SYNTHETIC_DATE)).toMatchObject({ known: true, quotaLitres: '81', openingConsumedLitres: '11', recordedConsumedLitres: '2', reservedLitres: '3', remainingLitres: '65' });
    expect(await fuelAvailability(db, fixture.reefer.id, SYNTHETIC_DATE)).toMatchObject({ authoritative: false, openingSource: 'SYNTHETIC' });
    await expect(db.fuelLedger.update({ where: { id: ledger.id }, data: { openingConsumedLitres: 0 } })).rejects.toThrow();
    const usage = await db.fuelUsage.findFirstOrThrow({ where: { ledgerId: ledger.id } });
    await expect(db.fuelUsage.update({ where: { id: usage.id }, data: { litres: 1 } })).rejects.toThrow();
    await expect(db.fuelUsage.delete({ where: { id: usage.id } })).rejects.toThrow();
    await expect(db.fuelUsage.create({ data: { ledgerId: ledger.id, tripId: fixture.otherTrip.id, kind: 'CONSUMED', litres: 1, occurredAt: new Date('2040-01-02T00:00:00Z'), source: 'SYNTHETIC' } })).rejects.toThrow();
    await expect(db.fuelUsage.create({ data: { ledgerId: ledger.id, kind: 'CONSUMED', litres: 1, occurredAt: new Date('2040-01-09T00:00:00Z'), source: 'SYNTHETIC' } })).rejects.toThrow();
  });
});
