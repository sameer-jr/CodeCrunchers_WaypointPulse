import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { StoreOrderDetail, StoreOrderInput } from '@waypoint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { dateOnly } from '../domain/dates.js';
import { installStoreFixture, prepareStoreScenario, type StoreFixture } from './testing/synthetic.js';

if (!process.env.STORE_TEST_DATABASE_URL) throw new Error('Run npm run test; Store tests require their own isolated PostgreSQL database.');
const db = new PrismaClient({ datasources: { db: { url: process.env.STORE_TEST_DATABASE_URL } } });
let clock = new Date('2040-01-02T10:29:59Z');
const config = readConfig({ ...process.env, DATABASE_URL: process.env.STORE_TEST_DATABASE_URL, NODE_ENV: 'test', STORE_ALLOW_SYNTHETIC: 'false' });
const app = createApp(db, config, { store: { now: () => clock, allowSyntheticReferences: true } });
const store = request.agent(app);
let fixture: StoreFixture;
const input: StoreOrderInput = { requestedDeliveryDate: '2040-01-03', temperatureRequirement: 'AMBIENT', orderedUnits: 73,
  orderedWeightKg: 41.25, orderedVolumeM3: 0.75 };
const body = (changes: Partial<StoreOrderInput> = {}) => ({ ...input, ...changes });
const create = (changes: Partial<StoreOrderInput> = {}) => store.post('/api/store/orders').send(body(changes));
const receipt = (order: { id: string; version: number }, receivedUnits = 73,
  changes: Record<string, unknown> = {}) => store.post(`/api/store/orders/${order.id}/receipt`).send({
    expectedVersion: order.version, receivedUnits, issueType: 'NONE', ...changes
  });
const detail = async (id: string): Promise<StoreOrderDetail> => {
  const response = await store.get(`/api/store/orders/${id}`);
  expect(response.status).toBe(200);
  return response.body as StoreOrderDetail;
};
beforeAll(async () => {
  fixture = await installStoreFixture(db);
  expect((await store.post('/api/auth/login').send({ email: 'store@waypoint.local', password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
});
afterAll(async () => { await db.$disconnect(); });

describe('Persisted Store home and server-derived creation', () => {
  it('returns a genuinely empty home with its authenticated assignment and imported calendar', async () => {
    const response = await store.get('/api/store/home');
    expect(response.status).toBe(200);
    expect(response.body.counts).toEqual({ upcoming: 0, deferred: 0, awaitingReceipt: 0, completed: 0, attention: 0 });
    expect(response.body.orders).toEqual([]);
    expect(response.body.context).toMatchObject({ timezone: 'Asia/Colombo', today: '2040-01-02', cutoffPassed: false,
      outlet: { id: fixture.fresh.id, brand: 'FRESH', source: 'SYNTHETIC' } });
    expect(response.body.context.operatingDates).toContain('2040-01-08');
    expect(response.body.context.operatingDates).not.toContain('2040-01-04');
  });
  it.each(['AMBIENT', 'CHILLED', 'FROZEN'] as const)('supports the Fresh %s requirement with persisted confirmation', async temperatureRequirement => {
    const response = await create({ temperatureRequirement });
    expect(response.status).toBe(201);
    const persisted = await db.order.findUniqueOrThrow({ where: { id: response.body.id }, include: { outlet: true } });
    expect(persisted).toMatchObject({ outletId: fixture.fresh.id, createdByUserId: fixture.store.id, status: 'CONFIRMED',
      version: 2, temperatureRequirement, orderedUnits: 73 });
    expect(persisted.outlet).toMatchObject({ brand: 'FRESH', depotId: fixture.depot.id });
    expect(persisted.requestedDeliveryDate).toEqual(dateOnly('2040-01-03'));
    expect(persisted.eligibleDeliveryDate).toEqual(dateOnly('2040-01-03'));
    expect(response.body.orderRef).toMatch(/^WP-20400102-[A-Z0-9-]+$/);
    expect((await detail(persisted.id)).orderRef).toBe(response.body.orderRef);
    const audit = await db.auditEvent.findMany({ where: { entityId: persisted.id }, orderBy: { timestamp: 'asc' } });
    expect(audit.map(event => event.eventType).sort()).toEqual(['ORDER_CONFIRMED', 'ORDER_CREATED']);
    expect(response.body.timeline.map((event: { eventType: string }) => event.eventType)).toEqual(['ORDER_CREATED', 'ORDER_CONFIRMED']);
    expect(audit.every(event => event.actorUserId === fixture.store.id && event.actorRole === 'STORE_MANAGER')).toBe(true);
  });
  it.each(['outletId', 'createdByUserId', 'brand', 'depotId', 'role'])('rejects client-controlled %s instead of changing ownership', async field => {
    const before = await db.order.count();
    const response = await store.post('/api/store/orders').send({ ...input, [field]: fixture.other.id });
    expect(response.status).toBe(400);
    expect(await db.order.count()).toBe(before);
  });
  it.each([0, -1, 1.5, '73'])('rejects invalid units %s', async orderedUnits => {
    const response = await store.post('/api/store/orders').send({ ...input, orderedUnits });
    expect(response.status).toBe(400);
  });
  it.each([
    { orderedWeightKg: 0 }, { orderedWeightKg: -1 }, { orderedWeightKg: 1.0001 },
    { orderedVolumeM3: 0 }, { orderedVolumeM3: '0.75' }
  ])('rejects invalid decimal quantities $orderedWeightKg / $orderedVolumeM3', async quantities => {
    expect((await store.post('/api/store/orders').send({ ...input, ...quantities })).status).toBe(400);
  });
  it('generates unique application references independently of existing order counts', async () => {
    const responses = await Promise.all([create(), create(), create()]);
    const outcomes = responses.map((response, index) => ({ request: index + 1, status: response.status,
      errorCode: response.body.error?.code ?? null, errorMessage: response.body.error?.message ?? null }));
    expect(responses.every(response => response.status === 201), `Concurrent Store creation responses: ${JSON.stringify(outcomes)}`).toBe(true);
    expect(new Set(responses.map(response => response.body.orderRef)).size).toBe(3);
    const listing = await store.get('/api/store/orders');
    expect(listing.status).toBe(200);
    expect(listing.body.total).toBe(await db.order.count({ where: { outletId: fixture.fresh.id } }));
  });
  it('supports Style and Tech ambient context and rejects unsupported cold requirements', async () => {
    await db.userOutlet.delete({ where: { userId_outletId: { userId: fixture.store.id, outletId: fixture.fresh.id } } });
    try {
      for (const outlet of [fixture.style, fixture.tech]) {
        await db.userOutlet.create({ data: { userId: fixture.store.id, outletId: outlet.id } });
        const context = await store.get('/api/store/context');
        expect(context.status).toBe(200);
        expect(context.body.outlet.brand).toBe(outlet.brand);
        expect(context.body.temperatureRequirements).toEqual(['AMBIENT']);
        expect((await create({ temperatureRequirement: 'CHILLED' })).status).toBe(400);
        const valid = await create();
        expect(valid.status).toBe(201);
        expect(valid.body.outlet.id).toBe(outlet.id);
        await db.userOutlet.delete({ where: { userId_outletId: { userId: fixture.store.id, outletId: outlet.id } } });
      }
    } finally {
      await db.userOutlet.deleteMany({ where: { userId: fixture.store.id } });
      await db.userOutlet.create({ data: { userId: fixture.store.id, outletId: fixture.fresh.id } });
    }
  });
});

describe('Colombo cutoff and stored calendar eligibility', () => {
  it.each(['2040-02-30', '2041-01-01', '2040-01-01', '2040-01-02', '2040-01-04'])('rejects invalid, unavailable, past or nonoperating date %s', async requestedDeliveryDate => {
    expect((await create({ requestedDeliveryDate })).status).toBe(400);
  });
  it('accepts a next-day run one second before the Colombo cutoff', async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ requestedDeliveryDate: '2040-01-03', eligibleDeliveryDate: '2040-01-03', eligibilityNotice: null });
  });
  it.each(['2040-01-02T10:30:00Z', '2040-01-02T10:30:01Z'])('moves the eligible date at/after 16:00 Colombo (%s) without replacing the request', async instant => {
    clock = new Date(instant);
    try {
      const response = await create();
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ requestedDeliveryDate: '2040-01-03', eligibleDeliveryDate: '2040-01-05' });
      expect(response.body.eligibilityNotice).toBeTruthy();
      const order = await db.order.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(order.createdAt.toISOString()).toBe(response.body.createdAt);
      expect((await detail(order.id)).createdAt).toBe(response.body.createdAt);
      expect(order.requestedDeliveryDate).toEqual(dateOnly('2040-01-03'));
      expect(order.eligibleDeliveryDate).toEqual(dateOnly('2040-01-05'));
    } finally { clock = new Date('2040-01-02T10:29:59Z'); }
  });
  it('leaves a later operating date unchanged after cutoff', async () => {
    clock = new Date('2040-01-02T12:00:00Z');
    try {
      const response = await create({ requestedDeliveryDate: '2040-01-08' });
      expect(response.status).toBe(201);
      expect(response.body.eligibleDeliveryDate).toBe('2040-01-08');
    } finally { clock = new Date('2040-01-02T10:29:59Z'); }
  });
  it('uses the Colombo business date across the UTC midnight boundary', async () => {
    clock = new Date('2040-01-01T20:00:00Z');
    try {
      const response = await store.get('/api/store/context');
      expect(response.status).toBe(200);
      expect(response.body.today).toBe('2040-01-02');
      expect(response.body.cutoffAt).toBe('2040-01-02T10:30:00.000Z');
    } finally { clock = new Date('2040-01-02T10:29:59Z'); }
  });
  it('rejects cutoff overflow when the calendar has no later eligible run', async () => {
    clock = new Date('2040-01-12T10:30:00Z');
    try { expect((await create({ requestedDeliveryDate: '2040-01-13' })).status).toBe(409); }
    finally { clock = new Date('2040-01-02T10:29:59Z'); }
  });
  it('rolls back creation and lifecycle confirmation when auditing fails', async () => {
    const orders = await db.order.count(), events = await db.auditEvent.count();
    await db.$executeRawUnsafe(`CREATE FUNCTION store_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER store_test_reject_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION store_test_reject_audit()');
    try {
      expect((await create()).status).toBe(500);
      expect(await db.order.count()).toBe(orders);
      expect(await db.auditEvent.count()).toBe(events);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER store_test_reject_audit ON "AuditEvent"');
      await db.$executeRawUnsafe('DROP FUNCTION store_test_reject_audit()');
    }
  });
  it('enforces the immutable eligible date and prevents a stop before that eligible run', async () => {
    clock = new Date('2040-01-02T10:30:00Z');
    try {
      const response = await create();
      expect(response.status).toBe(201);
      await expect(db.order.update({ where: { id: response.body.id }, data: { eligibleDeliveryDate: dateOnly('2040-01-06') } })).rejects.toThrow();
      const vehicle = await db.vehicle.create({ data: { vehicleRef: `SYN-EARLY-${randomUUID()}`, type: 'TRUCK', temperatureCapability: 'AMBIENT',
        weightCapacityKg: 1700, volumeCapacityM3: 15, fuelType: 'DIESEL', kmPerLitre: 8, weeklyFuelQuotaLitres: 84, depotId: fixture.depot.id, source: 'SYNTHETIC' } });
      const trip = await db.trip.create({ data: { tripRef: `SYN-EARLY-${randomUUID()}`, vehicleId: vehicle.id, serviceDate: dateOnly('2040-01-03'), tripNumber: 1 } });
      await expect(db.tripStop.create({ data: { tripId: trip.id, orderId: response.body.id, sequence: 1 } })).rejects.toThrow();
    } finally { clock = new Date('2040-01-02T10:29:59Z'); }
  });
});

describe('Store object and role authorization', () => {
  it('hides another outlet order for direct ID reads and receipt mutation', async () => {
    const other = await db.order.create({ data: { orderRef: `SYN-OTHER-${randomUUID()}`, outletId: fixture.other.id,
      requestedDeliveryDate: dateOnly('2040-01-03'), temperatureRequirement: 'AMBIENT', orderedUnits: 9, orderedWeightKg: 4, orderedVolumeM3: 1 } });
    const denied = await store.get(`/api/store/orders/${other.id}`);
    const absent = await store.get(`/api/store/orders/${randomUUID()}`);
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual(absent.body);
    expect((await receipt(other, 9)).status).toBe(404);
    expect((await store.get('/api/store/orders')).body.orders.map((order: { id: string }) => order.id)).not.toContain(other.id);
    expect((await store.get(`/api/domain/outlets/${fixture.other.id}`)).status).toBe(403);
  });
  it('denies unassigned and ambiguous Store assignment instead of choosing an outlet', async () => {
    await db.userOutlet.deleteMany({ where: { userId: fixture.store.id } });
    try {
      expect((await store.get('/api/store/home')).status).toBe(403);
      expect((await create()).status).toBe(403);
      for (const outlet of [fixture.fresh, fixture.other]) await db.userOutlet.create({ data: { userId: fixture.store.id, outletId: outlet.id } });
      expect((await store.get('/api/store/home')).status).toBe(403);
      expect((await create()).status).toBe(403);
    } finally {
      await db.userOutlet.deleteMany({ where: { userId: fixture.store.id } });
      await db.userOutlet.create({ data: { userId: fixture.store.id, outletId: fixture.fresh.id } });
    }
  });
  it('requires authentication and excludes every other role from Store workflows', async () => {
    expect((await request(app).get('/api/store/home')).status).toBe(401);
    for (const name of ['dispatcher', 'loader', 'driver']) {
      const agent = request.agent(app);
      expect((await agent.post('/api/auth/login').send({ email: `${name}@waypoint.local`, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
      expect((await agent.get('/api/store/home')).status).toBe(403);
      expect((await agent.post('/api/store/orders').send(input)).status).toBe(403);
    }
    for (const name of ['dispatcher', 'loader', 'driver']) expect((await store.get(`/api/workspaces/${name}`)).status).toBe(403);
    expect((await store.post('/api/dispatcher/plans').send({ role: 'DISPATCHER' })).status).toBe(403);
  });
  it('requires explicit development opt-in for synthetic eligibility', async () => {
    const strict = request.agent(createApp(db, config));
    expect((await strict.post('/api/auth/login').send({ email: 'store@waypoint.local', password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
    expect((await strict.post('/api/store/orders').send(input)).status).toBe(400);
  });
  it('rejects malformed IDs and status/date filters without leaking credentials', async () => {
    expect((await store.get('/api/store/orders/not-a-uuid')).status).toBe(400);
    expect((await store.get('/api/store/orders?status=BOGUS')).status).toBe(400);
    expect((await store.get('/api/store/orders?date=2040-02-30')).status).toBe(400);
    const response = await store.get('/api/store/home');
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|AUTH_SECRET|photoStorageKey|signatureStorageKey/);
  });
});

describe('Truthful lifecycle, deferral and arrival tracking', () => {
  it('keeps a confirmed unplanned order free of fabricated assignment or ETA', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'UNPLANNED' });
    const result = await detail(order.id);
    expect(result.status).toBe('CONFIRMED');
    expect(result.trip).toBeNull();
    expect(result.plannedArrival).toBeNull();
    expect(result.actualArrival).toBeNull();
    expect(result.delivery).toBeNull();
    expect(result.timeline.map(event => event.eventType)).toEqual(['ORDER_CREATED', 'ORDER_CONFIRMED']);
    expect(result.canReceive).toBe(false);
  });
  it('uses the persisted TripStop arrival and lifecycle audit for a planned order', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'PLANNED' });
    const stop = await db.tripStop.findFirstOrThrow({ where: { orderId: order.id } });
    const result = await detail(order.id);
    expect(result.status).toBe('PLANNED');
    expect(result.plannedArrival).toBe(stop.plannedArrival!.toISOString());
    expect(result.trip!.plannedArrival).toBe(stop.plannedArrival!.toISOString());
    expect(result.actualArrival).toBeNull();
    expect(result.timeline.map(event => event.status)).toContain('PLANNED');
  });
  it('returns actual persisted deferral reasons, timestamps and next eligible date', async () => {
    const reason = 'SYNTHETIC fixture: a specific capacity review remains pending.';
    const order = await prepareStoreScenario(db, fixture, { scenario: 'DEFERRED', reasonDetail: reason });
    const history = await db.deferralRecord.findFirstOrThrow({ where: { orderId: order.id } });
    const result = await detail(order.id);
    expect(result.status).toBe('DEFERRED');
    expect(result.deferrals[0]).toMatchObject({ id: history.id, reasonDetail: reason, deferredAt: history.deferredAt.toISOString(), nextEligibleDate: '2040-01-05' });
    const home = await store.get('/api/store/home');
    expect(home.body.counts.deferred).toBe(await db.order.count({ where: { outletId: fixture.fresh.id, status: 'DEFERRED' } }));
  });
  it('distinguishes actual delivery from planned arrival and exposes metadata without fake binaries', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    const result = await detail(order.id);
    expect(result).toMatchObject({ status: 'AWAITING_RECEIPT', canReceive: true, plannedArrival: '2040-01-03T01:00:00.000Z',
      actualArrival: '2040-01-03T01:03:00.000Z', completedAt: '2040-01-03T01:08:00.000Z' });
    expect(result.delivery!.proof).toMatchObject({ recipientName: 'SYNTHETIC Receiving Colleague', hasPhoto: true, hasSignature: true, binaryAvailable: false });
    expect(JSON.stringify(result)).not.toMatch(/photoStorageKey|signatureStorageKey|synthetic\/.*\/photo.jpg/);
  });
});

describe('Transactional Store receipts and actionable issues', () => {
  it('confirms a matching delivered receipt once while preserving all quantity facts and audit', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    const note = 'Goods counted and checked by the Store receiving team.';
    const response = await receipt(order, 73, { issueNote: note });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'RECEIPT_CONFIRMED', orderedUnits: 73, loadedUnits: 73, deliveredUnits: 73, receivedUnits: 73,
      receipt: { status: 'CONFIRMED', receivedUnits: 73, issueType: null, issueNote: note }, canReceive: false });
    expect((await detail(order.id)).status).toBe('RECEIPT_CONFIRMED');
    expect(await db.exception.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.auditEvent.count({ where: { entityId: order.id, eventType: 'RECEIPT_CONFIRMED' } })).toBe(1);
    expect((await receipt({ id: order.id, version: response.body.version })).status).toBe(409);
    expect(await db.receipt.count({ where: { deliveryRecord: { tripStop: { orderId: order.id } } } })).toBe(1);
  });
  it('uses the central intermediate lifecycle for an already delivered order', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'DELIVERED' });
    const response = await receipt(order);
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('RECEIPT_CONFIRMED');
    expect(response.body.version).toBe(order.version + 2);
    expect(await db.auditEvent.count({ where: { entityId: order.id, eventType: 'RECEIPT_CONFIRMED' } })).toBe(1);
  });
  it('retains ordered, loaded, delivered and received quantities separately on a partial discrepancy', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'PARTIALLY_DELIVERED', loadedUnits: 69, deliveredUnits: 66 });
    const response = await receipt(order, 65, { issueType: 'QUANTITY_DISCREPANCY', issueNote: 'One delivered unit was not received at the Store.' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'RECEIPT_ISSUE', orderedUnits: 73, loadedUnits: 69, deliveredUnits: 66, receivedUnits: 65,
      receipt: { status: 'ISSUE_REPORTED', issueType: 'QUANTITY_DISCREPANCY', receivedUnits: 65 } });
    expect(response.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'RECEIPT_DISCREPANCY', status: 'OPEN' })]));
    const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: order.id, eventType: 'RECEIPT_ISSUE_REPORTED' } });
    expect(audit.metadata).toMatchObject({ quantities: { orderedUnits: 73, loadedUnits: 69, deliveredUnits: 66, receivedUnits: 65 } });
    expect(await db.auditEvent.count({ where: { entityId: order.id, eventType: 'RECEIPT_ISSUE_REPORTED' } })).toBe(1);
  });
  it('automatically treats a mismatch as a quantity issue even when the client selects none', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    const response = await receipt(order, 72, { issueNote: 'One unit missing from the received delivery.' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'RECEIPT_ISSUE', receiptStatus: 'ISSUE_REPORTED', issueType: 'QUANTITY_DISCREPANCY' });
    expect(await db.exception.count({ where: { orderId: order.id, type: 'RECEIPT_DISCREPANCY', status: 'OPEN' } })).toBe(1);
  });
  it.each(['DAMAGED_GOODS', 'OTHER'])('keeps a matching-quantity %s issue actionable', async issueType => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    const note = issueType === 'DAMAGED_GOODS' ? 'Outer boxes are crushed and goods need review.' : 'The recipient label did not match the dispatch paperwork.';
    const response = await receipt(order, 73, { issueType, issueNote: note });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'RECEIPT_ISSUE', receivedUnits: 73, deliveredUnits: 73,
      receipt: { status: 'ISSUE_REPORTED', issueType, issueNote: note } });
    expect(await db.exception.count({ where: { orderId: order.id, type: issueType === 'DAMAGED_GOODS' ? 'DAMAGED_GOODS' : 'RECEIPT_DISCREPANCY', status: 'OPEN' } })).toBe(1);
    expect((await store.get('/api/store/home')).body.attention.map((row: { id: string }) => row.id)).toContain(order.id);
  });
  it.each(['QUANTITY_DISCREPANCY', 'DAMAGED_GOODS', 'OTHER', 'NONE'])('requires useful notes for a receipt issue (%s)', async issueType => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    expect((await receipt(order, 72, { issueType })).status).toBe(400);
    expect(await db.receipt.count({ where: { deliveryRecord: { tripStop: { orderId: order.id } } } })).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('AWAITING_RECEIPT');
  });
  it('rejects receipt before delivery and stale versions without partial writes', async () => {
    const unplanned = await prepareStoreScenario(db, fixture, { scenario: 'UNPLANNED' });
    expect((await receipt(unplanned)).status).toBe(409);
    const delivered = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    expect((await receipt(delivered, 73, { expectedVersion: delivered.version - 1 })).status).toBe(409);
    expect(await db.receipt.count({ where: { deliveryRecord: { tripStop: { orderId: delivered.id } } } })).toBe(0);
  });
  it('rejects received quantity and role/status injection at the API boundary', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    for (const changes of [{ receivedUnits: -1 }, { receivedUnits: 1.5 }, { role: 'DISPATCHER' }, { status: 'CONFIRMED' }, { confirmedByUserId: fixture.dispatcher.id }]) {
      expect((await receipt(order, 73, changes)).status).toBe(400);
    }
    expect(await db.receipt.count({ where: { deliveryRecord: { tripStop: { orderId: order.id } } } })).toBe(0);
  });
  it('allows only one concurrent receipt to commit', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    const responses = await Promise.all([receipt(order), receipt(order)]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(await db.auditEvent.count({ where: { entityId: order.id, eventType: 'RECEIPT_CONFIRMED' } })).toBe(1);
  });
  it('rolls back receipt, exception and order state when audit insertion fails', async () => {
    const order = await prepareStoreScenario(db, fixture, { scenario: 'AWAITING_RECEIPT' });
    await db.$executeRawUnsafe(`CREATE FUNCTION store_test_reject_receipt_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType" = 'RECEIPT_ISSUE_REPORTED' THEN RAISE EXCEPTION 'synthetic receipt audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER store_test_reject_receipt_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION store_test_reject_receipt_audit()');
    try {
      expect((await receipt(order, 72, { issueNote: 'One unit missing from the receipt.' })).status).toBe(500);
      expect(await db.receipt.count({ where: { deliveryRecord: { tripStop: { orderId: order.id } } } })).toBe(0);
      expect(await db.exception.count({ where: { orderId: order.id } })).toBe(0);
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('AWAITING_RECEIPT');
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER store_test_reject_receipt_audit ON "AuditEvent"');
      await db.$executeRawUnsafe('DROP FUNCTION store_test_reject_receipt_audit()');
    }
  });
});
