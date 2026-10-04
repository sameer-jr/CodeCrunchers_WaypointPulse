import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type { DispatcherOrderSummary, DispatcherPulse } from '@waypoint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { DISPATCHER_SYNTHETIC_DATE, installDispatcherFixture, type DispatcherFixture } from './testing/synthetic.js';

if (!process.env.DISPATCHER_TEST_DATABASE_URL) throw new Error('Run npm run test; Dispatcher tests require a separate isolated PostgreSQL database.');
const db = new PrismaClient({ datasources: { db: { url: process.env.DISPATCHER_TEST_DATABASE_URL } } });
const config = readConfig({ ...process.env, DATABASE_URL: process.env.DISPATCHER_TEST_DATABASE_URL, NODE_ENV: 'test', STORE_ALLOW_SYNTHETIC: 'false',
  DISPATCHER_DEMO_DATE: DISPATCHER_SYNTHETIC_DATE });
const app = createApp(db, config, { store: { now: () => new Date('2040-02-05T10:00:00Z'), allowSyntheticReferences: true },
  dispatcher: { demoDate: DISPATCHER_SYNTHETIC_DATE, now: () => new Date('2040-02-05T10:00:00Z') } });
const dispatcher = request.agent(app), store = request.agent(app);
let fixture: DispatcherFixture;
const get = (path: string) => dispatcher.get(`/api/dispatcher/${path}`);
const ids = (orders: { id: string }[]) => orders.map(order => order.id);
const day = DISPATCHER_SYNTHETIC_DATE;
async function withMalformedStop(run: (order: { id: string; orderRef: string }, stop: { id: string }) => Promise<void>) {
  const order = await db.order.create({ data: { orderRef: `SYN-MALFORMED-PRIVATE-${randomUUID()}`, outletId: fixture.foreignOutlet.id,
    requestedDeliveryDate: fixture.plannedTrip.serviceDate, temperatureRequirement: 'AMBIENT', orderedUnits: 31, orderedWeightKg: 5, orderedVolumeM3: 0.5 } });
  let stopId: string | undefined;
  try {
    // Simulate privileged/legacy corruption only in this isolated database; the guard is restored in the same transaction.
    const stop = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('ALTER TABLE "TripStop" DISABLE TRIGGER "TripStop_guard"');
      const inserted = await tx.tripStop.create({ data: { tripId: fixture.plannedTrip.id, orderId: order.id, sequence: 3 } });
      await tx.$executeRawUnsafe('ALTER TABLE "TripStop" ENABLE TRIGGER "TripStop_guard"');
      return inserted;
    });
    stopId = stop.id;
    await run(order, stop);
  } finally {
    if (stopId) {
      await db.receipt.deleteMany({ where: { deliveryRecord: { tripStopId: stopId } } });
      await db.deliveryRecord.deleteMany({ where: { tripStopId: stopId } });
      await db.loadRecord.deleteMany({ where: { tripStopId: stopId } });
      await db.tripStop.delete({ where: { id: stopId } });
    }
    await db.order.delete({ where: { id: order.id } });
  }
}
beforeAll(async () => {
  fixture = await installDispatcherFixture(db);
  for (const [agent, email] of [[dispatcher, 'dispatcher@waypoint.local'], [store, 'store@waypoint.local']] as const) {
    expect((await agent.post('/api/auth/login').send({ email, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
  }
});
afterAll(async () => { await db.$disconnect(); });

describe('Dispatcher scope and operational context', () => {
  it('uses the configured persisted demo date and scoped depot instead of the machine day', async () => {
    const response = await get('context');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ selectedDate: day, dateSource: 'CONFIGURED_DEMO', timezone: 'Asia/Colombo',
      calendar: { date: day, operatingDay: true, source: 'SYNTHETIC' } });
    expect(response.body.depots).toEqual([{ id: fixture.depot.id, name: fixture.depot.name }]);
    expect(response.body.districts).toContain(fixture.vanOutlet.district);
    expect(response.body.districts).not.toContain(fixture.foreignOutlet.district);
  });
  it('accepts explicit read-only dates without fabricating an unavailable calendar', async () => {
    const response = await get('pulse?date=2041-04-03');
    expect(response.status).toBe(200);
    expect(response.body.context).toMatchObject({ selectedDate: '2041-04-03', dateSource: 'REQUEST', calendar: null });
    expect(response.body.metrics.totalOrders).toBe(0);
    expect((await get('context?date=2040-02-30')).status).toBe(400);
  });
  it('supports multiple permitted depots and consistently rejects foreign depot filters', async () => {
    await db.userDepot.create({ data: { userId: fixture.dispatcher.id, depotId: fixture.secondaryDepot.id } });
    try {
      const response = await get(`orders?date=${day}`);
      expect(response.status).toBe(200);
      expect(response.body.context.depots.map((depot: { id: string }) => depot.id).sort()).toEqual([fixture.depot.id, fixture.secondaryDepot.id].sort());
      expect(ids(response.body.orders)).toContain(fixture.orders['SYN-DSP-SECONDARY-ORDER'].id);
      expect(ids(response.body.orders)).not.toContain(fixture.orders['SYN-DSP-FOREIGN-ORDER'].id);
      expect((await get(`orders?depotId=${fixture.secondaryDepot.id}`)).body.total).toBe(1);
      for (const path of ['orders', 'trips', 'exceptions']) expect((await get(`${path}?depotId=${fixture.foreignDepot.id}`)).status).toBe(403);
    } finally { await db.userDepot.delete({ where: { userId_depotId: { userId: fixture.dispatcher.id, depotId: fixture.secondaryDepot.id } } }); }
  });
  it('fails closed without UserDepot assignments', async () => {
    await db.userDepot.deleteMany({ where: { userId: fixture.dispatcher.id } });
    try {
      for (const path of ['context', 'pulse', 'orders', 'planning-context', 'trips', 'exceptions']) expect((await get(path)).status).toBe(403);
    } finally { await db.userDepot.create({ data: { userId: fixture.dispatcher.id, depotId: fixture.depot.id } }); }
  });
  it('requires current server role and excludes Store, Loader and Driver from every Dispatcher view', async () => {
    const paths = ['context', 'pulse', 'orders', 'planning-context', 'trips', 'exceptions'];
    expect((await request(app).get('/api/dispatcher/pulse')).status).toBe(401);
    for (const name of ['store', 'loader', 'driver']) {
      const agent = name === 'store' ? store : request.agent(app);
      if (name !== 'store') expect((await agent.post('/api/auth/login').send({ email: `${name}@waypoint.local`, password: process.env.SEED_DEMO_PASSWORD })).status).toBe(200);
      for (const path of paths) expect((await agent.get(`/api/dispatcher/${path}`)).status).toBe(403);
    }
    expect((await get('orders?role=DISPATCHER')).status).toBe(400);
    expect((await dispatcher.post('/api/dispatcher/plans').send({ depotId: fixture.depot.id })).status).toBe(400);
    expect((await dispatcher.post(`/api/dispatcher/orders/${fixture.orders['SYN-DSP-FRESH-AMBIENT'].id}`).send({ status: 'PLANNED' })).status).toBe(404);
  });
});

describe('Persisted scoped Delivery Pulse', () => {
  it('reconciles its counts to the actual selected-day records and excludes other depot records', async () => {
    const response = await get(`pulse?date=${day}`);
    expect(response.status).toBe(200);
    const pulse = response.body as DispatcherPulse;
    expect(pulse.metrics).toMatchObject({ totalOrders: 12, awaitingPlanning: 6, planned: 2, deferred: 1,
      loadingReady: 0, inTransit: 0, delivered: 3, receiptIssues: 2, openExceptions: 2, activeTrips: 4 });
    expect(ids(pulse.orders)).not.toContain(fixture.orders['SYN-DSP-FOREIGN-ORDER'].id);
    expect(ids(pulse.trips)).not.toContain(fixture.foreignTrip.id);
    expect(pulse.attention.map(exception => exception.id).sort()).toEqual((await db.exception.findMany({ where: { receiptId: { in: [fixture.discrepancyReceipt.id, fixture.damageReceipt.id] } } })).map(exception => exception.id).sort());
  });
  it('reports fleet master information and marks operational availability unknown', async () => {
    const pulse = (await get('pulse')).body as DispatcherPulse;
    const master = await db.vehicle.findMany({ where: { depotId: fixture.depot.id } });
    expect(pulse.fleet).toMatchObject({ total: master.length, activeMasterRecords: master.filter(vehicle => vehicle.active).length,
      trucks: master.filter(vehicle => vehicle.type === 'TRUCK').length, vans: master.filter(vehicle => vehicle.type === 'VAN').length,
      reefer: master.filter(vehicle => vehicle.temperatureCapability === 'REEFER').length, operationalAvailability: 'UNKNOWN' });
    expect(pulse.metrics).not.toHaveProperty('availableVehicles');
    expect(JSON.stringify(pulse)).not.toMatch(/"(workshop|available|liveGps|latenessProbability)"\s*:/);
  });
});

describe('Dispatcher order queue and real Store propagation', () => {
  it('reads the exact Store-created order without copying or changing it', async () => {
    const created = await store.post('/api/store/orders').send({ requestedDeliveryDate: day, temperatureRequirement: 'CHILLED',
      orderedUnits: 47, orderedWeightKg: 28.375, orderedVolumeM3: 0.625 });
    expect(created.status).toBe(201);
    const response = await get(`orders?date=${day}&search=${encodeURIComponent(created.body.orderRef)}`);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.orders[0]).toMatchObject({ id: created.body.id, orderRef: created.body.orderRef, status: 'CONFIRMED', orderedUnits: 47,
      requestedDeliveryDate: day, eligibleDeliveryDate: day, orderedWeightKg: '28.375', orderedVolumeM3: '0.625' });
    const detail = await get(`orders/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(created.body.id);
    expect(detail.body.timeline.map((event: { eventType: string }) => event.eventType)).toEqual(['ORDER_CREATED', 'ORDER_CONFIRMED']);
    expect(detail.body.trip).toBeNull();
    expect(await db.order.count({ where: { orderRef: created.body.orderRef } })).toBe(1);
  });
  it.each([
    ['brand=STYLE', 'SYN-DSP-STYLE-AMBIENT'], ['brand=TECH', 'SYN-DSP-TECH-AMBIENT'],
    ['temperatureRequirement=CHILLED', 'SYN-DSP-FRESH-CHILLED'], ['temperatureRequirement=FROZEN', 'SYN-DSP-FRESH-FROZEN'],
    ['status=DEFERRED', 'SYN-DSP-DEFERRED-TWICE'], ['previouslyDeferred=true', 'SYN-DSP-DEFERRED-TWICE'],
    ['district=SYNTHETIC%20Van%20District', 'SYN-DSP-VAN-AMBIENT']
  ])('applies the %s queue filter', async (filter, reference) => {
    const response = await get(`orders?date=${day}&${filter}`);
    expect(response.status).toBe(200);
    expect(ids(response.body.orders)).toContain(fixture.orders[reference].id);
    for (const order of response.body.orders as DispatcherOrderSummary[]) {
      if (filter.startsWith('brand=')) expect(order.outlet.brand).toBe(filter.slice(6));
      if (filter.startsWith('temperatureRequirement=')) expect(order.temperatureRequirement).toBe(filter.slice(23));
      if (filter.startsWith('status=')) expect(order.status).toBe('DEFERRED');
      if (filter.startsWith('previouslyDeferred=')) expect(order.deferralCount).toBeGreaterThan(0);
      if (filter.startsWith('district=')) expect(order.outlet.district).toBe('SYNTHETIC Van District');
    }
  });
  it('searches references case-insensitively and never includes a foreign matching order', async () => {
    const own = await get('orders?search=syn-dsp-van-am');
    expect(own.status).toBe(200);
    expect(own.body.total).toBe(1);
    expect(own.body.orders[0].id).toBe(fixture.orders['SYN-DSP-VAN-AMBIENT'].id);
    const outlet = await get(`orders?search=${fixture.vanOutlet.outletRef.toLowerCase()}`);
    expect(outlet.body.total).toBe(1);
    expect((await get('orders?search=SYN-DSP-FOREIGN')).body.total).toBe(0);
    const noHistory = await get(`orders?date=${day}&previouslyDeferred=false`);
    expect(noHistory.body.orders.every((order: DispatcherOrderSummary) => order.deferralCount === 0)).toBe(true);
  });
  it('paginates deterministically with a scoped total and bounded page size', async () => {
    const first = await get(`orders?date=${day}&limit=3&page=1`), second = await get(`orders?date=${day}&limit=3&page=2`);
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    expect(first.body).toMatchObject({ page: 1, limit: 3 });
    expect(second.body).toMatchObject({ page: 2, limit: 3, total: first.body.total });
    expect(first.body.orders).toHaveLength(3); expect(second.body.orders).toHaveLength(3);
    expect(ids(first.body.orders).filter(id => ids(second.body.orders).includes(id))).toEqual([]);
    expect(ids((await get(`orders?date=${day}&limit=3&page=1`)).body.orders)).toEqual(ids(first.body.orders));
    expect((await get(`orders?date=${day}&limit=3&page=999`)).body.orders).toEqual([]);
  });
  it('distinguishes original request, later eligible date and the active trip service date', async () => {
    const queued = fixture.orders['SYN-DSP-ELIGIBLE-LATER'], assigned = fixture.orders['SYN-DSP-TRIP-LATER'];
    const initial = (await get(`orders?date=${day}`)).body.orders;
    expect(ids(initial)).not.toContain(queued.id); expect(ids(initial)).not.toContain(assigned.id);
    const requested = await get(`orders?date=${day}&dateBasis=REQUESTED`);
    expect(ids(requested.body.orders)).toContain(queued.id); expect(ids(requested.body.orders)).toContain(assigned.id);
    expect(ids((await get('orders?date=2040-02-09')).body.orders)).toContain(queued.id);
    expect(ids((await get('orders?date=2040-02-09')).body.orders)).not.toContain(assigned.id);
    const later = await get('orders?date=2040-02-10');
    const row = later.body.orders.find((order: { id: string }) => order.id === assigned.id);
    expect(row).toMatchObject({ operationalDate: '2040-02-10', operationalDateSource: 'TRIP', requestedDeliveryDate: day, eligibleDeliveryDate: '2040-02-09' });
  });
  it('retains repeated deferral history and all original/date/quantity detail facts', async () => {
    const response = await get(`orders/${fixture.orders['SYN-DSP-DEFERRED-TWICE'].id}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ deferralCount: 2, status: 'DEFERRED', latestDeferral: { reasonCode: 'FUEL_UNKNOWN', nextEligibleDate: '2040-02-08' } });
    expect(response.body.deferrals.map((row: { reasonCode: string }) => row.reasonCode).sort()).toEqual(['CAPACITY', 'FUEL_UNKNOWN']);
    const damaged = await get(`orders/${fixture.damage.id}`);
    expect(damaged.body).toMatchObject({ orderedUnits: 73, loadedUnits: 69, deliveredUnits: 66, receivedUnits: 66,
      receiptStatus: 'ISSUE_REPORTED', outlet: { id: fixture.fresh.id, depotId: fixture.depot.id } });
  });
  it('does not leak foreign order IDs and validates unsupported filter injection', async () => {
    const denied = await get(`orders/${fixture.orders['SYN-DSP-FOREIGN-ORDER'].id}`), missing = await get(`orders/${randomUUID()}`);
    expect(denied.status).toBe(404); expect(denied.body).toEqual(missing.body);
    for (const query of ['page=0', 'limit=101', 'brand=BOGUS', 'dateBasis=UTC', 'previouslyDeferred=yes', 'date=2040-02-30', 'outletId=ignored']) {
      expect((await get(`orders?${query}`)).status).toBe(400);
    }
    expect((await get('orders/invalid')).status).toBe(400);
  });
});

describe('Read-only planning and persisted routes', () => {
  it('returns scoped eligible context and truthful capacities without generation claims', async () => {
    const response = await get(`planning-context?date=${day}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ generationAvailable: false, validationAvailable: false, releaseAvailable: false,
      fleet: { operationalAvailability: 'UNKNOWN' } });
    const orders = response.body.orders as DispatcherOrderSummary[];
    expect(orders.every(order => ['CONFIRMED', 'CLOSED_FOR_PLANNING'].includes(order.status) && !order.trip && order.eligibleDeliveryDate <= day)).toBe(true);
    expect(ids(orders)).toContain(fixture.orders['SYN-DSP-VAN-AMBIENT'].id);
    expect(ids(orders)).not.toContain(fixture.orders['SYN-DSP-ELIGIBLE-LATER'].id);
    expect(ids(orders)).not.toContain(fixture.orders['SYN-DSP-FOREIGN-ORDER'].id);
    expect(response.body.totals.awaitingPlanningCount).toBe(orders.length);
    expect(response.body.totals.orderedUnits).toBe(orders.reduce((sum, order) => sum + order.orderedUnits, 0));
    expect(response.body.totals.orderedWeightKg).toBe(orders.reduce((sum, order) => sum.add(order.orderedWeightKg), new Prisma.Decimal(0)).toString());
    expect(response.body.totals.chilled).toBeGreaterThan(0); expect(response.body.totals.frozen).toBeGreaterThan(0); expect(response.body.totals.vanOnly).toBe(1);
    expect(response.body.deferredOrders[0].id).toBe(fixture.orders['SYN-DSP-DEFERRED-TWICE'].id);
    expect(response.body.vehicles.every((vehicle: { depot: { id: string }; operationalAvailability: string }) => vehicle.depot.id === fixture.depot.id && vehicle.operationalAvailability === 'UNKNOWN')).toBe(true);
    expect(response.body.travel.map((row: { depotId: string }) => row.depotId)).toEqual([fixture.depot.id, fixture.depot.id]);
    expect(response.body.serviceAllowances).toEqual(expect.arrayContaining([expect.objectContaining({ brand: 'FRESH', source: 'SYNTHETIC' })]));
  });
  it('does not establish planning eligibility for nonoperating or unknown calendars', async () => {
    for (const date of ['2040-02-07', '2041-04-03']) {
      const response = await get(`planning-context?date=${date}`);
      expect(response.status).toBe(200);
      expect(response.body.orders).toEqual([]);
      expect(response.body.totals).toMatchObject({ awaitingPlanningCount: 0, orderedUnits: 0, orderedWeightKg: '0', orderedVolumeM3: '0',
        ambient: 0, chilled: 0, frozen: 0, vanOnly: 0, mallDock: 0 });
      expect(response.body.calendarEligibility).toBe(date === '2040-02-07' ? 'NON_OPERATING' : 'UNKNOWN');
      expect(response.body.generationAvailable).toBe(false);
    }
  });
  it('returns only persisted trips and preserves stop sequence and arrival facts', async () => {
    const listing = await get(`trips?date=${day}&search=SYN-DSP-PREPARED-TRIP`);
    expect(listing.status).toBe(200); expect(listing.body.total).toBe(1);
    expect(listing.body.trips[0].id).toBe(fixture.plannedTrip.id);
    const detail = await get(`trips/${fixture.plannedTrip.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.stops.map((stop: { sequence: number }) => stop.sequence)).toEqual([1, 2]);
    expect(detail.body.stops.map((stop: { order: { orderRef: string } }) => stop.order.orderRef)).toEqual(['SYN-DSP-PLANNED-ONE', 'SYN-DSP-PLANNED-TWO']);
    expect(detail.body.stops[0]).toMatchObject({ plannedArrival: '2040-02-06T01:00:00.000Z', actualArrival: null });
    expect(detail.body.orderedUnits).toBe(62);
    expect(detail.body).not.toHaveProperty('gps');
  });
  it('denies foreign/missing trips and validates route status/pagination filters', async () => {
    const denied = await get(`trips/${fixture.foreignTrip.id}`), missing = await get(`trips/${randomUUID()}`);
    expect(denied.status).toBe(404); expect(denied.body).toEqual(missing.body);
    expect((await get('trips?status=BOGUS')).status).toBe(400);
    expect((await get('trips?page=-1')).status).toBe(400);
    expect((await get('trips?limit=101')).status).toBe(400);
    const listed = await get(`trips?date=${day}&status=PLANNED&limit=1&page=1`);
    expect(listed.status).toBe(200); expect(listed.body.trips).toHaveLength(1);
    expect(listed.body.trips[0].status).toBe('PLANNED');
  });
  it('performs no planning or operational writes on any Dispatcher GET', async () => {
    const snapshot = async () => ({ orders: await db.order.findMany({ select: { id: true, status: true, version: true }, orderBy: { id: 'asc' } }),
      trips: await db.trip.count(), allocations: await db.allocation.count(), audits: await db.auditEvent.count(), exceptions: await db.exception.count() });
    const before = await snapshot();
    const exception = await db.exception.findFirstOrThrow({ where: { receiptId: fixture.damageReceipt.id } });
    for (const path of ['context', 'pulse', 'orders', `orders/${fixture.damage.id}`, 'planning-context', 'trips', `trips/${fixture.plannedTrip.id}`,
      'exceptions', `exceptions/${exception.id}`]) expect((await get(path)).status).toBe(200);
    expect(await snapshot()).toEqual(before);
    for (const action of ['generate', 'validate', 'release']) expect((await dispatcher.post(`/api/dispatcher/planning/${action}`).send({ date: day })).status).toBe(404);
  });
});

describe('Shared persisted Exception Centre', () => {
  it('shows the exact Store transaction discrepancy and damaged-goods exception records', async () => {
    const exceptions = await db.exception.findMany({ where: { receiptId: { in: [fixture.damageReceipt.id, fixture.discrepancyReceipt.id] } } });
    const response = await get(`exceptions?date=${day}&status=OPEN`);
    expect(response.status).toBe(200);
    for (const exception of exceptions) {
      const row = response.body.exceptions.find((item: { id: string }) => item.id === exception.id);
      expect(row).toMatchObject({ id: exception.id, type: exception.type, message: exception.message, originRole: 'STORE_MANAGER', status: 'OPEN' });
    }
    expect((await get(`exceptions?date=${day}&type=DAMAGED_GOODS`)).body.exceptions.every((item: { type: string }) => item.type === 'DAMAGED_GOODS')).toBe(true);
  });
  it('propagates a newly submitted Store discrepancy using the same receipt and exception IDs', async () => {
    const result = await store.post(`/api/store/orders/${fixture.ready.id}/receipt`).send({ expectedVersion: fixture.ready.version, receivedUnits: 65,
      issueType: 'QUANTITY_DISCREPANCY', issueNote: 'One unit missing from this newly checked receiving count.' });
    expect(result.status).toBe(201);
    const saved = await db.exception.findFirstOrThrow({ where: { receiptId: result.body.receipt.id } });
    const response = await get(`exceptions?date=${day}&search=${fixture.ready.orderRef}`);
    expect(response.status).toBe(200);
    expect(ids(response.body.exceptions)).toContain(saved.id);
    const detail = await get(`exceptions/${saved.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: saved.id, order: { id: fixture.ready.id }, receipt: { id: result.body.receipt.id, receivedUnits: 65, status: 'ISSUE_REPORTED' } });
    expect(await db.exception.count({ where: { receiptId: result.body.receipt.id } })).toBe(1);
    expect((await store.get(`/api/store/orders/${fixture.ready.id}`)).body.issues.some((issue: { id: string }) => issue.id === saved.id)).toBe(true);
  });
  it('resolves receipt/load/delivery/trip-only relationship scope without requiring Exception.orderId', async () => {
    const delivery = await db.deliveryRecord.findUniqueOrThrow({ where: { id: fixture.damageReceipt.deliveryRecordId } });
    const stop = await db.tripStop.findUniqueOrThrow({ where: { id: delivery.tripStopId } });
    const data = [
      { receiptId: fixture.damageReceipt.id, type: 'RECEIPT_DISCREPANCY' as const },
      { loadRecordId: delivery.loadRecordId, type: 'LOADING_SHORTFALL' as const },
      { deliveryRecordId: delivery.id, type: 'DELIVERY_PARTIAL' as const },
      { tripId: stop.tripId, type: 'SYNC_CONFLICT' as const }
    ];
    for (const [index, link] of data.entries()) {
      const issue = await db.exception.create({ data: { ...link, message: `SYNTHETIC relation-only issue ${index + 1}.`, createdByUserId: fixture.dispatcher.id } });
      const response = await get(`exceptions/${issue.id}`);
      expect(response.status).toBe(200);
      expect(response.body.depot.id).toBe(fixture.depot.id);
      if (index < 3) expect(response.body.order.id).toBe(fixture.damage.id);
      expect(response.body.operationalDate).toBe(day);
    }
  });
  it('denies foreign exceptions on direct IDs/list searches and safely supports resolved filters', async () => {
    const foreign = await db.exception.create({ data: { tripId: fixture.foreignTrip.id, type: 'SYNC_CONFLICT', message: 'SYNTHETIC foreign-trip issue.' } });
    const denied = await get(`exceptions/${foreign.id}`), missing = await get(`exceptions/${randomUUID()}`);
    expect(denied.status).toBe(404); expect(denied.body).toEqual(missing.body);
    expect(ids((await get('exceptions?search=foreign-trip')).body.exceptions)).not.toContain(foreign.id);
    const resolved = await db.exception.create({ data: { orderId: fixture.orders['SYN-DSP-FRESH-AMBIENT'].id, type: 'SYNC_CONFLICT', status: 'RESOLVED',
      resolvedAt: new Date(), message: 'SYNTHETIC already-resolved historical exception.' } });
    expect(ids((await get(`exceptions?date=${day}&status=RESOLVED`)).body.exceptions)).toContain(resolved.id);
    expect(ids((await get(`exceptions?date=${day}&status=OPEN`)).body.exceptions)).not.toContain(resolved.id);
    for (const query of ['status=BOGUS', 'type=UNKNOWN', 'limit=101', 'page=0']) expect((await get(`exceptions?${query}`)).status).toBe(400);
  });
  it('omits credential/storage internals and has no receipt-resolution mutation', async () => {
    const issue = await db.exception.findFirstOrThrow({ where: { receiptId: fixture.damageReceipt.id } });
    const response = await get(`exceptions/${issue.id}`);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|photoStorageKey|signatureStorageKey|AUTH_SECRET/);
    expect(response.body.delivery.proof).toMatchObject({ hasPhoto: true, hasSignature: true, binaryAvailable: false });
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await dispatcher.post(`/api/dispatcher/exceptions/${issue.id}/resolve`).send({ status: 'RESOLVED' })).status).toBe(404);
    expect((await db.exception.findUniqueOrThrow({ where: { id: issue.id } })).status).toBe('OPEN');
  });
  it('fails closed for a corrupted own-vehicle trip containing a foreign outlet stop', async () => {
    await withMalformedStop(async (order) => {
      const issue = await db.exception.create({ data: { tripId: fixture.plannedTrip.id, type: 'SYNC_CONFLICT', message: 'SYNTHETIC corrupted-trip scope check.' } });
      try {
        expect((await get(`trips/${fixture.plannedTrip.id}`)).status).toBe(404);
        expect((await get(`orders/${fixture.orders['SYN-DSP-PLANNED-ONE'].id}`)).status).toBe(404);
        expect((await get(`exceptions/${issue.id}`)).status).toBe(404);
        for (const path of ['pulse', 'orders', 'planning-context', 'trips', 'exceptions']) {
          const response = await get(`${path}?date=${day}`);
          expect(response.status).toBe(200);
          expect(JSON.stringify(response.body)).not.toContain(order.orderRef);
          expect(JSON.stringify(response.body)).not.toContain(`"tripRef":"${fixture.plannedTrip.tripRef}"`);
        }
      } finally { await db.exception.delete({ where: { id: issue.id } }); }
    });
  });
  it('denies receipt/load/delivery-only exceptions even when their corrupted trip vehicle is in scope', async () => {
    await withMalformedStop(async (order, stop) => {
      const load = await db.loadRecord.create({ data: { tripStopId: stop.id, expectedUnits: 31, loadedUnits: 31,
        status: 'COMPLETE', recordedByUserId: fixture.loader.id, recordedAt: new Date() } });
      const delivery = await db.deliveryRecord.create({ data: { tripStopId: stop.id, loadRecordId: load.id, expectedLoadedUnits: 31,
        deliveredUnits: 31, outcome: 'DELIVERED', arrivedAt: new Date(`${day}T01:00:00Z`), completedAt: new Date(`${day}T01:05:00Z`),
        recordedByDriverId: fixture.driver.id } });
      await db.userOutlet.create({ data: { userId: fixture.store.id, outletId: fixture.foreignOutlet.id } });
      let receipt;
      try {
        receipt = await db.receipt.create({ data: { deliveryRecordId: delivery.id, receivedUnits: 30, status: 'ISSUE_REPORTED',
          issueType: 'QUANTITY_DISCREPANCY', issueNote: 'SYNTHETIC malformed foreign receiving metadata.', confirmedByUserId: fixture.store.id, confirmedAt: new Date() } });
      } finally { await db.userOutlet.delete({ where: { userId_outletId: { userId: fixture.store.id, outletId: fixture.foreignOutlet.id } } }); }
      const issues = [];
      try {
        for (const link of [{ loadRecordId: load.id }, { deliveryRecordId: delivery.id }, { receiptId: receipt.id }]) {
          const issue = await db.exception.create({ data: { ...link, type: 'SYNC_CONFLICT', message: `SYNTHETIC corrupt relation ${order.orderRef}.` } });
          issues.push(issue.id);
          expect((await get(`exceptions/${issue.id}`)).status).toBe(404);
        }
        expect((await get(`exceptions?date=${day}&search=${order.orderRef}`)).body.total).toBe(0);
      } finally { await db.exception.deleteMany({ where: { id: { in: issues } } }); }
    });
  });
});
