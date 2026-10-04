import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { driverArrivalSchema, driverDeliveryPayloadSchema, driverDeliverySchema, driverSyncSchema, driverTripMutationSchema,
  type DriverArrivalInput, type DriverDeliveryInput, type DriverOperation, type DriverRouteList, type DriverSyncResponse,
  type DriverSyncResult, type DriverTripDetail } from '@waypoint/shared';
import { appendAudit, type DomainActor } from '../domain/audit.js';
import { businessDate, dateOnly, dateSchema } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { transitionOrderInTransaction } from '../domain/lifecycle.js';
import { assertDepotScope, requireRole, resolveActor } from '../domain/scope.js';
import { driverTripDetail, driverTripInclude, type DriverTripRecord } from './dto.js';
import { DRIVER_VISIBLE_STATES, readyDriverSource, scopedDriverTrip } from './scope.js';

export type DriverServiceOptions = { demoDate?: string; now?: () => Date };
type ExecutionTime = { eventAt: Date; operation?: DriverOperation };
function parse<T>(schema: ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new DomainError('INVALID_DOMAIN', 'Check the Driver fields, outcome, proof and version values.');
  return parsed.data;
}
function id(value: string) { return parse(z.string().uuid(), value); }
function expectVersion(actual: number, expected: number) {
  if (actual !== expected) throw new DomainError('DOMAIN_CONFLICT', 'The route changed after it was read. Reload and review before retrying.');
}
async function transaction<T>(db: PrismaClient, userId: string, work: (tx: Prisma.TransactionClient, actor: DomainActor) => Promise<T>, mutation = false, retries = 0): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => { const actor = await resolveActor(tx, userId); requireRole(actor, ['DRIVER']); return work(tx, actor); },
        { isolationLevel: mutation ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
        if (attempt < retries) continue;
        throw new DomainError('DOMAIN_CONFLICT', 'The route changed concurrently. Retry synchronization or review the route.');
      }
      throw error;
    }
  }
}
export async function listDriverRoutes(db: PrismaClient, userId: string, rawQuery: unknown = {}, options: DriverServiceOptions = {}): Promise<DriverRouteList> {
  const query = parse(z.object({ date: dateSchema.optional() }).strict(), rawQuery);
  return transaction(db, userId, async (tx, actor) => {
    const rows = await tx.trip.findMany({ where: { driverUserId: actor.id, status: { in: [...DRIVER_VISIBLE_STATES] },
      planningRun: { is: { status: 'RELEASED', releasedAt: { not: null }, supersededAt: null, strategyVersion: { not: null } } } },
      include: driverTripInclude, orderBy: [{ serviceDate: 'desc' }, { plannedDeparture: 'asc' }, { tripRef: 'asc' }], take: 90 });
    const visible = rows.filter(readyDriverSource), selectedDate = query.date ?? options.demoDate ?? businessDate(options.now?.() ?? new Date());
    return { selectedDate, availableDates: [...new Set(visible.map(trip => trip.serviceDate.toISOString().slice(0, 10)))].sort(),
      trips: visible.filter(trip => trip.serviceDate.getTime() === dateOnly(selectedDate).getTime()).map(driverTripDetail) };
  });
}
export async function readDriverTrip(db: PrismaClient, userId: string, tripId: string): Promise<DriverTripDetail> {
  id(tripId);
  return transaction(db, userId, async (tx, actor) => driverTripDetail(await scopedDriverTrip(tx, actor, tripId)));
}
async function advanceTrip(tx: Prisma.TransactionClient, trip: DriverTripRecord, data: Prisma.TripUncheckedUpdateManyInput = {}) {
  const changed = await tx.trip.updateMany({ where: { id: trip.id, version: trip.version, status: trip.status }, data: { ...data, version: { increment: 1 } } });
  if (changed.count !== 1) throw new DomainError('DOMAIN_CONFLICT', 'The trip changed. Reload before retrying.');
}
function auditDriver(trip: DriverTripRecord, time: ExecutionTime, stopId?: string) {
  return { tripId: trip.id, ...(stopId ? { stopId } : {}), eventAt: time.eventAt.toISOString(),
    ...(time.operation ? { operationId: time.operation.operationId, clientEventAt: time.operation.clientEventAt, operationCreatedAt: time.operation.createdAt } : {}) };
}
async function start(tx: Prisma.TransactionClient, actor: DomainActor, trip: DriverTripRecord, expectedVersion: number, time: ExecutionTime) {
  expectVersion(trip.version, expectedVersion);
  if (trip.status !== 'READY_FOR_DISPATCH' || trip.actualDeparture || trip.stops.some(stop => stop.order.status !== 'READY_FOR_DISPATCH')) {
    throw new DomainError('DOMAIN_CONFLICT', 'This trip has already departed or its loads are not ready.');
  }
  await advanceTrip(tx, trip, { status: 'IN_TRANSIT', actualDeparture: time.eventAt });
  for (const stop of trip.stops) await transitionOrderInTransaction(tx, { actorUserId: actor.id, orderId: stop.orderId,
    expectedVersion: stop.order.version, next: 'IN_TRANSIT' });
  await appendAudit(tx, { actor, eventType: 'TRIP_STARTED', entityType: 'TRIP', entityId: trip.id,
    metadata: { version: trip.version + 1, driver: auditDriver(trip, time) } });
}
function activeStop(trip: DriverTripRecord, stopId: string, input: DriverArrivalInput) {
  expectVersion(trip.version, input.expectedTripVersion);
  const stop = trip.stops.find(row => row.id === stopId);
  if (!stop) throw new DomainError('DOMAIN_FORBIDDEN', 'This stop is outside your assigned route.');
  expectVersion(stop.version, input.expectedStopVersion); expectVersion(stop.order.version, input.expectedOrderVersion);
  if (trip.status !== 'IN_TRANSIT' || !trip.actualDeparture) throw new DomainError('DOMAIN_CONFLICT', 'Start the ready trip before recording stops.');
  const current = trip.stops.find(row => !row.delivery && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(row.status));
  if (current?.id !== stop.id) throw new DomainError('DOMAIN_CONFLICT', 'Complete the current stop before moving to the next stop.');
  return stop;
}
async function arrive(tx: Prisma.TransactionClient, actor: DomainActor, trip: DriverTripRecord, stopId: string, input: DriverArrivalInput, time: ExecutionTime) {
  const stop = activeStop(trip, stopId, input);
  if (stop.status !== 'PLANNED' || stop.actualArrival || stop.delivery || stop.order.status !== 'IN_TRANSIT') throw new DomainError('DOMAIN_CONFLICT', 'Arrival is already recorded or this stop is not in transit.');
  if (time.eventAt < trip.actualDeparture!) throw new DomainError('INVALID_DOMAIN', 'Arrival cannot precede the recorded trip departure.');
  const changed = await tx.tripStop.updateMany({ where: { id: stop.id, version: stop.version, status: 'PLANNED', active: true },
    data: { status: 'ARRIVED', actualArrival: time.eventAt, version: { increment: 1 },
      ...(time.operation ? { arrivalClientEventAt: new Date(time.operation.clientEventAt), arrivalOperationCreatedAt: new Date(time.operation.createdAt) } : {}) } });
  if (changed.count !== 1) throw new DomainError('DOMAIN_CONFLICT', 'The stop changed before arrival was recorded.');
  await transitionOrderInTransaction(tx, { actorUserId: actor.id, orderId: stop.orderId, expectedVersion: stop.order.version, next: 'ARRIVED' });
  await advanceTrip(tx, trip);
  await appendAudit(tx, { actor, eventType: 'STOP_ARRIVED', entityType: 'TRIP', entityId: trip.id,
    metadata: { version: trip.version + 1, driver: auditDriver(trip, time, stop.id) } });
}
async function complete(tx: Prisma.TransactionClient, actor: DomainActor, trip: DriverTripRecord, stopId: string, input: DriverDeliveryInput, time: ExecutionTime) {
  const stop = activeStop(trip, stopId, input), loaded = stop.load!.loadedUnits!;
  if (stop.status !== 'ARRIVED' || !stop.actualArrival || stop.delivery || stop.order.status !== 'ARRIVED') throw new DomainError('DOMAIN_CONFLICT', 'Record arrival before completing this stop.');
  if (input.deliveredUnits > loaded || input.outcome === 'DELIVERED' && input.deliveredUnits !== loaded ||
    input.outcome === 'PARTIALLY_DELIVERED' && (input.deliveredUnits <= 0 || input.deliveredUnits >= loaded)) throw new DomainError('INVALID_DOMAIN', 'Delivery outcome must match the actual loaded manifest. Use Partial for a lower positive quantity.');
  if (time.eventAt < stop.actualArrival) throw new DomainError('INVALID_DOMAIN', 'Completion cannot precede the recorded arrival.');
  const note = input.outcome === 'DELIVERED' ? input.driverNote ?? null : `${input.reasonCode}${input.driverNote ? `: ${input.driverNote}` : ''}`;
  const delivery = await tx.deliveryRecord.create({ data: { tripStopId: stop.id, loadRecordId: stop.load!.id, expectedLoadedUnits: loaded,
    deliveredUnits: input.deliveredUnits, outcome: input.outcome, driverNote: note, reasonCode: input.reasonCode ?? null,
    arrivedAt: stop.actualArrival, completedAt: time.eventAt, recordedByDriverId: actor.id,
    ...(time.operation ? { clientEventAt: new Date(time.operation.clientEventAt), operationCreatedAt: new Date(time.operation.createdAt) } : {}),
    ...(input.recipientName ? { proof: { create: { recipientName: input.recipientName, recipientRole: input.recipientRole ?? null } } } : {}) } });
  const changed = await tx.tripStop.updateMany({ where: { id: stop.id, version: stop.version, status: 'ARRIVED', active: true },
    data: { status: input.outcome === 'FAILED' ? 'FAILED' : 'COMPLETED', version: { increment: 1 },
      actualServiceMinutes: new Prisma.Decimal(Math.max(0, time.eventAt.getTime() - stop.actualArrival.getTime())).div(60000) } });
  if (changed.count !== 1) throw new DomainError('DOMAIN_CONFLICT', 'The stop changed before completion.');
  const next = input.outcome === 'FAILED' ? 'DELIVERY_FAILED' : input.outcome;
  const transitioned = await transitionOrderInTransaction(tx, { actorUserId: actor.id, orderId: stop.orderId, expectedVersion: stop.order.version, next });
  if (input.outcome === 'DELIVERED') await transitionOrderInTransaction(tx, { actorUserId: actor.id, orderId: stop.orderId, expectedVersion: transitioned.version, next: 'AWAITING_RECEIPT' });
  else await tx.exception.create({ data: { tripId: trip.id, orderId: stop.orderId, deliveryRecordId: delivery.id,
    type: input.outcome === 'FAILED' ? 'DELIVERY_FAILED' : 'DELIVERY_PARTIAL', message: `Stop ${stop.sequence}: ${input.deliveredUnits}/${loaded} loaded units delivered. ${note}`,
    createdByUserId: actor.id } });
  await advanceTrip(tx, trip);
  await appendAudit(tx, { actor, eventType: 'STOP_COMPLETED', entityType: 'DELIVERY_RECORD', entityId: delivery.id,
    metadata: { driver: { ...auditDriver(trip, time, stop.id), outcome: input.outcome, reasonCode: input.reasonCode ?? null },
      quantities: { orderedUnits: stop.order.orderedUnits, loadedUnits: loaded, deliveredUnits: input.deliveredUnits, receivedUnits: null } } });
}
async function finish(tx: Prisma.TransactionClient, actor: DomainActor, trip: DriverTripRecord, expectedVersion: number, time: ExecutionTime) {
  expectVersion(trip.version, expectedVersion);
  if (trip.status !== 'IN_TRANSIT' || !trip.stops.length || trip.stops.some(stop => !stop.delivery || !['COMPLETED', 'FAILED'].includes(stop.status))) {
    throw new DomainError('DOMAIN_CONFLICT', 'Every active stop needs a recorded terminal delivery before the trip can finish.');
  }
  if (trip.stops.some(stop => stop.delivery!.completedAt > time.eventAt)) throw new DomainError('INVALID_DOMAIN', 'Trip completion cannot precede its completed stops.');
  await advanceTrip(tx, trip, { status: 'COMPLETED', completedAt: time.eventAt });
  await appendAudit(tx, { actor, eventType: 'TRIP_COMPLETED', entityType: 'TRIP', entityId: trip.id,
    metadata: { version: trip.version + 1, driver: { ...auditDriver(trip, time), completedAt: time.eventAt.toISOString() } } });
}
async function tripForEntity(tx: Prisma.TransactionClient, actor: DomainActor, entityType: 'TRIP' | 'TRIP_STOP', entityId: string) {
  const reference = entityType === 'TRIP_STOP' ? await tx.tripStop.findUnique({ where: { id: entityId }, select: { tripId: true, active: true } }) : null;
  if (entityType === 'TRIP_STOP' && !reference?.active) throw new DomainError('DOMAIN_FORBIDDEN', 'This stop is outside your current assigned route.');
  return scopedDriverTrip(tx, actor, reference?.tripId ?? entityId);
}
export async function startDriverTrip(db: PrismaClient, userId: string, tripId: string, raw: unknown, options: DriverServiceOptions = {}): Promise<DriverTripDetail> {
  id(tripId); const input = parse(driverTripMutationSchema, raw);
  return transaction(db, userId, async (tx, actor) => { const trip = await scopedDriverTrip(tx, actor, tripId);
    await start(tx, actor, trip, input.expectedTripVersion, { eventAt: options.now?.() ?? new Date() });
    return driverTripDetail(await scopedDriverTrip(tx, actor, trip.id)); }, true);
}
export async function recordDriverArrival(db: PrismaClient, userId: string, stopId: string, raw: unknown, options: DriverServiceOptions = {}): Promise<DriverTripDetail> {
  id(stopId); const input = parse(driverArrivalSchema, raw);
  return transaction(db, userId, async (tx, actor) => { const trip = await tripForEntity(tx, actor, 'TRIP_STOP', stopId);
    await arrive(tx, actor, trip, stopId, input, { eventAt: options.now?.() ?? new Date() });
    return driverTripDetail(await scopedDriverTrip(tx, actor, trip.id)); }, true);
}
export async function completeDriverStop(db: PrismaClient, userId: string, stopId: string, raw: unknown, options: DriverServiceOptions = {}): Promise<DriverTripDetail> {
  id(stopId); const input = parse(driverDeliverySchema, raw);
  return transaction(db, userId, async (tx, actor) => { const trip = await tripForEntity(tx, actor, 'TRIP_STOP', stopId);
    await complete(tx, actor, trip, stopId, input, { eventAt: options.now?.() ?? new Date() });
    return driverTripDetail(await scopedDriverTrip(tx, actor, trip.id)); }, true);
}
export async function finishDriverTrip(db: PrismaClient, userId: string, tripId: string, raw: unknown, options: DriverServiceOptions = {}): Promise<DriverTripDetail> {
  id(tripId); const input = parse(driverTripMutationSchema, raw);
  return transaction(db, userId, async (tx, actor) => { const trip = await scopedDriverTrip(tx, actor, tripId);
    await finish(tx, actor, trip, input.expectedTripVersion, { eventAt: options.now?.() ?? new Date() });
    return driverTripDetail(await scopedDriverTrip(tx, actor, trip.id)); }, true);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function operationHash(operation: DriverOperation) { return createHash('sha256').update(canonical(operation)).digest('hex'); }
function offlineTime(operation: DriverOperation, now: Date): ExecutionTime {
  const eventAt = new Date(operation.clientEventAt), createdAt = new Date(operation.createdAt), grace = 5 * 60000;
  if (eventAt.getTime() > now.getTime() + grace || createdAt.getTime() > now.getTime() + grace ||
    eventAt.getTime() < now.getTime() - 7 * 86400000 || Math.abs(eventAt.getTime() - createdAt.getTime()) > grace) {
    throw new DomainError('INVALID_DOMAIN', 'Offline timestamps must be recent and use the device clock at the recorded action.');
  }
  return { eventAt: operation.recordedOffline === false && now.getTime() - createdAt.getTime() <= 30000 ? now : eventAt, operation };
}
async function persistOperation(tx: Prisma.TransactionClient, actor: DomainActor, operation: DriverOperation, hash: string, result: DriverSyncResult, retry = false) {
  const snapshot = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonObject;
  if (retry) return tx.offlineOperation.update({ where: { operationId: operation.operationId }, data: { status: result.status, result: snapshot } });
  return tx.offlineOperation.create({ data: { ...operation, userId: actor.id, payload: operation.payload as Prisma.InputJsonObject,
    payloadHash: hash, recordedOffline: operation.recordedOffline ?? true, createdAt: new Date(operation.createdAt), clientEventAt: new Date(operation.clientEventAt), status: result.status, result: snapshot } });
}
async function syncOne(db: PrismaClient, userId: string, operation: DriverOperation, options: DriverServiceOptions): Promise<DriverSyncResult> {
  const hash = operationHash(operation);
  try {
    return await transaction(db, userId, async (tx, actor) => {
      const existing = await tx.offlineOperation.findUnique({ where: { operationId: operation.operationId } });
      if (existing && (existing.userId !== actor.id || existing.payloadHash !== hash)) return { operationId: operation.operationId, status: 'CONFLICT', reason: 'Operation UUID already belongs to a different action or account.' };
      const trip = await tripForEntity(tx, actor, operation.entityType, operation.entityId);
      if (existing && existing.status !== 'FAILED') return existing.result as unknown as DriverSyncResult;
      const retry = !!existing;
      if (trip.version !== operation.baseVersion) {
        const conflict: DriverSyncResult = { operationId: operation.operationId, status: 'CONFLICT', reason: 'Server route changed after this action was cached. Local work is retained for review.', serverVersion: trip.version };
        await persistOperation(tx, actor, operation, hash, conflict, retry); return conflict;
      }
      const time = offlineTime(operation, options.now?.() ?? new Date());
      if (operation.action === 'START_TRIP' || operation.action === 'FINISH_TRIP') {
        if (operation.entityType !== 'TRIP') throw new DomainError('INVALID_DOMAIN', 'This action requires a trip entity.');
        parse(z.object({}).strict(), operation.payload);
        if (operation.action === 'START_TRIP') await start(tx, actor, trip, operation.baseVersion, time);
        else await finish(tx, actor, trip, operation.baseVersion, time);
      } else {
        if (operation.entityType !== 'TRIP_STOP') throw new DomainError('INVALID_DOMAIN', 'This action requires a stop entity.');
        if (operation.action === 'ARRIVAL') {
          const payload = parse(driverArrivalSchema.omit({ expectedTripVersion: true }), operation.payload);
          await arrive(tx, actor, trip, operation.entityId, { ...payload, expectedTripVersion: operation.baseVersion }, time);
        } else {
          const payload = parse(driverDeliveryPayloadSchema, operation.payload);
          await complete(tx, actor, trip, operation.entityId, { ...payload, expectedTripVersion: operation.baseVersion }, time);
        }
      }
      const result: DriverSyncResult = { operationId: operation.operationId, status: 'SYNCED', trip: driverTripDetail(await scopedDriverTrip(tx, actor, trip.id)) };
      await appendAudit(tx, { actor, eventType: 'OFFLINE_ACTION_SYNCED', entityType: 'TRIP', entityId: trip.id,
        metadata: { version: result.trip!.version, driver: auditDriver(trip, time, operation.entityType === 'TRIP_STOP' ? operation.entityId : undefined) } });
      await persistOperation(tx, actor, operation, hash, result, retry);
      return result;
    }, true, 3);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const result: DriverSyncResult = { operationId: operation.operationId, status: error.code === 'DOMAIN_CONFLICT' ? 'CONFLICT' : 'FAILED', reason: error.message };
    if (['DOMAIN_FORBIDDEN', 'DOMAIN_NOT_FOUND'].includes(error.code)) return result;
    return transaction(db, userId, async (tx, actor) => {
      const existing = await tx.offlineOperation.findUnique({ where: { operationId: operation.operationId } });
      if (existing && (existing.userId !== actor.id || existing.payloadHash !== hash)) return { operationId: operation.operationId, status: 'CONFLICT', reason: 'Operation UUID already belongs to a different action or account.' };
      const trip = await tripForEntity(tx, actor, operation.entityType, operation.entityId);
      if (existing && existing.status !== 'FAILED') return existing.result as unknown as DriverSyncResult;
      if (result.status === 'CONFLICT') result.serverVersion = trip.version;
      await persistOperation(tx, actor, operation, hash, result, !!existing);
      return result;
    }, true, 3);
  }
}
export async function syncDriverOperations(db: PrismaClient, userId: string, raw: unknown, options: DriverServiceOptions = {}): Promise<DriverSyncResponse> {
  const input = parse(driverSyncSchema, raw);
  await transaction(db, userId, async () => undefined);
  const results: DriverSyncResult[] = [];
  let blocked = false;
  for (const operation of input.operations) {
    const result: DriverSyncResult = blocked ? { operationId: operation.operationId, status: 'FAILED', reason: 'An earlier queued operation needs review or retry before later actions can synchronize.' } : await syncOne(db, userId, operation, options);
    results.push(result); if (result.status !== 'SYNCED') blocked = true;
  }
  return { results };
}
export async function getDriverChoices(db: PrismaClient, userId: string) {
  const actor = await resolveActor(db, userId); requireRole(actor, ['DISPATCHER']);
  const scope = await db.userDepot.findFirst({ where: { userId } });
  if (!scope) return { drivers: [] };
  return { drivers: await db.user.findMany({ where: { active: true, role: 'DRIVER' }, select: { id: true, displayName: true, email: true }, orderBy: { displayName: 'asc' } }) };
}
export async function assignDriverToTrip(db: PrismaClient, userId: string, tripId: string, raw: unknown) {
  id(tripId); const input = parse(z.object({ driverUserId: z.string().uuid(), expectedTripVersion: z.number().int().positive() }).strict(), raw);
  try {
    return await db.$transaction(async tx => {
      const actor = await resolveActor(tx, userId); requireRole(actor, ['DISPATCHER']);
      const trip = await tx.trip.findUnique({ where: { id: tripId }, include: driverTripInclude });
      if (!trip) throw new DomainError('DOMAIN_NOT_FOUND', 'Trip not found.');
      await assertDepotScope(tx, actor, trip.vehicle.depotId);
      expectVersion(trip.version, input.expectedTripVersion);
      if (!['RELEASED', 'LOADING', 'READY_FOR_DISPATCH'].includes(trip.status) || trip.actualDeparture ||
        trip.planningRun?.status !== 'RELEASED' || !trip.planningRun.strategyVersion || !trip.planningRun.releasedAt || trip.planningRun.supersededAt ||
        trip.planningRun.depotId !== trip.vehicle.depotId) throw new DomainError('DOMAIN_CONFLICT', 'Assign a Driver to a released generated trip before departure.');
      const driver = await tx.user.findUnique({ where: { id: input.driverUserId } });
      if (!driver?.active || driver.role !== 'DRIVER') throw new DomainError('INVALID_DOMAIN', 'Select an active Driver account.');
      if (trip.driverUserId === driver.id) return { id: trip.id, version: trip.version };
      await advanceTrip(tx, trip, { driverUserId: driver.id });
      await appendAudit(tx, { actor, eventType: 'TRIP_DRIVER_ASSIGNED', entityType: 'TRIP', entityId: trip.id,
        metadata: { version: trip.version + 1, driver: { tripId: trip.id, driverUserId: driver.id } } });
      return { id: trip.id, version: trip.version + 1 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) throw new DomainError('DOMAIN_CONFLICT', 'Assignment changed concurrently. Reload the trip.');
    throw error;
  }
}
