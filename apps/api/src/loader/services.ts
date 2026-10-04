import { Prisma, type PrismaClient } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { loaderLoadsQuerySchema, readyTripSchema, recordStopLoadSchema, reviewLoadingShortfallSchema,
  type LoaderLoadList, type LoaderTripDetail, type LoaderShortfallReview, type RecordStopLoadInput } from '@waypoint/shared';
import { appendAudit, auditMetadataSchema, type DomainActor } from '../domain/audit.js';
import { businessDate, dateOnly } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { transitionOrderInTransaction } from '../domain/lifecycle.js';
import { assertDepotScope, requireRole, resolveActor } from '../domain/scope.js';
import { loaderTripDetail, loaderTripInclude, loaderTripSummary, loadDto, readinessBlockers, shortfallReviewDto, type LoaderTripRecord } from './dto.js';

export type LoaderServiceOptions = { demoDate?: string; now?: () => Date };
const loadingTripStatuses = ['RELEASED', 'LOADING', 'READY_FOR_DISPATCH'] as const;
function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_DOMAIN', 'Check the loading fields, quantities and version values.');
  return result.data;
}
function resourceId(value: string) { return parse(z.string().uuid(), value); }
function releasedTripWhere(depotIds: string[]): Prisma.TripWhereInput {
  return { vehicle: { depotId: { in: depotIds } }, status: { in: [...loadingTripStatuses] }, actualDeparture: null,
    planningRun: { is: { status: 'RELEASED', releasedAt: { not: null }, supersededAt: null, strategyVersion: { not: null } } } };
}
function releasedSource(trip: LoaderTripRecord): boolean {
  return loadingTripStatuses.some(status => status === trip.status) && !trip.actualDeparture && !!trip.planningRun?.strategyVersion &&
    trip.planningRun.status === 'RELEASED' && !!trip.planningRun.releasedAt && !trip.planningRun.supersededAt && trip.planningRun.depotId === trip.vehicle.depotId &&
    trip.stops.every(stop => stop.status !== 'CANCELLED' && stop.order.outlet.depotId === trip.vehicle.depotId &&
      stop.allocations.some(row => row.planningRunId === trip.planningRunId && row.decision === 'ASSIGNED' && row.orderId === stop.orderId));
}
async function scopedTrip(tx: Prisma.TransactionClient, actor: DomainActor, tripId: string): Promise<LoaderTripRecord> {
  const trip = await tx.trip.findUnique({ where: { id: tripId }, include: loaderTripInclude });
  if (!trip) throw new DomainError('DOMAIN_NOT_FOUND', 'Released trip not found.');
  await assertDepotScope(tx, actor, trip.vehicle.depotId);
  if (!releasedSource(trip)) {
    throw new DomainError('DOMAIN_FORBIDDEN', 'Loading requires a released generated plan that has not departed.');
  }
  return trip;
}
async function transaction<T>(db: PrismaClient, userId: string, role: 'LOADER' | 'DISPATCHER', work: (tx: Prisma.TransactionClient, actor: DomainActor) => Promise<T>, mutation = false): Promise<T> {
  try {
    return await db.$transaction(async tx => {
      const actor = await resolveActor(tx, userId);
      requireRole(actor, [role]);
      return work(tx, actor);
    }, { isolationLevel: mutation ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) throw new DomainError('DOMAIN_CONFLICT', 'Loading changed concurrently. Reload before retrying.');
    throw error;
  }
}
function expectVersion(actual: number, expected: number) {
  if (actual !== expected) throw new DomainError('DOMAIN_CONFLICT', 'The manifest changed. Reload before retrying.');
}
async function advanceTrip(tx: Prisma.TransactionClient, trip: LoaderTripRecord, status: 'LOADING' | 'READY_FOR_DISPATCH' = 'LOADING') {
  const updated = await tx.trip.updateMany({ where: { id: trip.id, version: trip.version, status: trip.status }, data: { status, version: { increment: 1 } } });
  if (updated.count !== 1) throw new DomainError('DOMAIN_CONFLICT', 'The trip changed. Reload before retrying.');
}
export async function listLoaderLoads(db: PrismaClient, userId: string, query: unknown = {}, options: LoaderServiceOptions = {}): Promise<LoaderLoadList> {
  const filters = parse(loaderLoadsQuerySchema, query);
  return transaction(db, userId, 'LOADER', async (tx, actor) => {
    const assignments = await tx.userDepot.findMany({ where: { userId: actor.id }, include: { depot: true } });
    const depots = assignments.map(row => ({ id: row.depotId, name: row.depot.name })), where = releasedTripWhere(depots.map(row => row.id));
    const dates = await tx.trip.findMany({ where, distinct: ['serviceDate'], select: { serviceDate: true }, orderBy: { serviceDate: 'desc' }, take: 90 });
    const availableDates = dates.map(row => row.serviceDate.toISOString().slice(0, 10));
    const selectedDate = filters.date ?? options.demoDate ?? businessDate(options.now?.() ?? new Date());
    const trips = await tx.trip.findMany({ where: { ...where, serviceDate: dateOnly(selectedDate) }, include: loaderTripInclude, orderBy: [{ plannedDeparture: 'asc' }, { tripRef: 'asc' }] });
    return { selectedDate, availableDates: availableDates.sort(), depots, trips: trips.filter(releasedSource).map(loaderTripSummary) };
  });
}
export async function readLoaderTrip(db: PrismaClient, userId: string, tripId: string): Promise<LoaderTripDetail> {
  resourceId(tripId);
  return transaction(db, userId, 'LOADER', async (tx, actor) => loaderTripDetail(await scopedTrip(tx, actor, tripId)));
}
function loadingAudit(input: RecordStopLoadInput, revision: number, expectedUnits: number, previousLoadedUnits: number | null, exceptionId?: string) {
  return { revision, previousLoadedUnits, expectedUnits, loadedUnits: input.loadedUnits, reasonCode: input.reasonCode ?? null, note: input.note ?? null,
    ...(exceptionId ? { exceptionId } : {}) };
}
async function writeLoad(tx: Prisma.TransactionClient, actor: DomainActor, trip: LoaderTripRecord, stop: LoaderTripRecord['stops'][number], input: RecordStopLoadInput) {
  const now = new Date(), shortfall = input.loadedUnits < stop.order.orderedUnits;
  let exceptionId: string | undefined;
  const data = { expectedUnits: stop.order.orderedUnits, loadedUnits: input.loadedUnits, status: 'LOADING' as const,
    reason: input.reasonCode ? `${input.reasonCode}${input.note ? `: ${input.note}` : ''}` : null,
    reviewStatus: shortfall ? 'PENDING' as const : 'NOT_REQUIRED' as const, recordedByUserId: actor.id, recordedAt: now,
    reviewedByUserId: null, reviewedAt: null };
  if (stop.load?.reviewStatus === 'REJECTED') await tx.exception.updateMany({ where: { loadRecordId: stop.load.id, type: 'LOADING_SHORTFALL', status: { not: 'RESOLVED' } }, data: { status: 'RESOLVED', resolvedAt: now } });
  const load = stop.load ? await tx.loadRecord.update({ where: { id: stop.load.id }, data: { ...data, revision: { increment: 1 } } }) :
    await tx.loadRecord.create({ data: { tripStopId: stop.id, ...data } });
  if (stop.order.status === 'RELEASED_TO_LOADING') await transitionOrderInTransaction(tx, { actorUserId: actor.id, orderId: stop.orderId, expectedVersion: stop.order.version, next: 'LOADING' });
  const finished = await tx.loadRecord.update({ where: { id: load.id }, data: { status: shortfall ? 'EXCEPTION' : 'COMPLETE' } });
  if (shortfall) {
    const exception = await tx.exception.create({ data: { orderId: stop.orderId, tripId: trip.id, loadRecordId: load.id, type: 'LOADING_SHORTFALL',
      createdByUserId: actor.id, message: `Loading revision ${finished.revision}: expected ${finished.expectedUnits}, loaded ${finished.loadedUnits}. ${finished.reason}` } });
    exceptionId = exception.id;
    const order = await tx.order.findUniqueOrThrow({ where: { id: stop.orderId } });
    if (order.status === 'LOADING') await transitionOrderInTransaction(tx, { actorUserId: actor.id, orderId: order.id, expectedVersion: order.version, next: 'LOADING_EXCEPTION' });
    else await appendAudit(tx, { actor, eventType: 'LOADING_SHORTFALL_REPORTED', entityType: 'LOAD_RECORD', entityId: finished.id,
      metadata: { loading: loadingAudit(input, finished.revision, finished.expectedUnits, stop.load?.loadedUnits ?? null, exceptionId) } });
  }
  await appendAudit(tx, { actor, eventType: 'LOAD_RECORDED', entityType: 'LOAD_RECORD', entityId: finished.id,
    metadata: { loading: loadingAudit(input, finished.revision, finished.expectedUnits, stop.load?.loadedUnits ?? null, exceptionId),
      quantities: { orderedUnits: stop.order.orderedUnits, loadedUnits: finished.loadedUnits, deliveredUnits: null, receivedUnits: null } } });
}
export async function recordStopLoad(db: PrismaClient, userId: string, stopId: string, rawInput: unknown): Promise<LoaderTripDetail> {
  resourceId(stopId);
  const input = parse(recordStopLoadSchema, rawInput);
  return transaction(db, userId, 'LOADER', async (tx, actor) => {
    const reference = await tx.tripStop.findUnique({ where: { id: stopId }, select: { tripId: true } });
    if (!reference) throw new DomainError('DOMAIN_NOT_FOUND', 'Released stop not found.');
    const trip = await scopedTrip(tx, actor, reference.tripId), stop = trip.stops.find(row => row.id === stopId);
    if (!stop || !['RELEASED', 'LOADING'].includes(trip.status)) throw new DomainError('DOMAIN_CONFLICT', 'This trip cannot accept loading changes.');
    expectVersion(trip.version, input.expectedTripVersion);
    expectVersion(stop.order.version, input.expectedOrderVersion);
    expectVersion(stop.load?.revision ?? 0, input.expectedLoadRevision);
    if (stop.updatedAt.toISOString() !== input.expectedStopUpdatedAt) throw new DomainError('DOMAIN_CONFLICT', 'The stop changed. Reload before retrying.');
    if (stop.load && stop.load.status !== 'PENDING' && stop.load.reviewStatus !== 'REJECTED') throw new DomainError('DOMAIN_CONFLICT', 'Completed or pending-review loads cannot be overwritten.');
    if (!['RELEASED_TO_LOADING', 'LOADING', 'LOADING_EXCEPTION'].includes(stop.order.status)) throw new DomainError('DOMAIN_CONFLICT', 'The order is outside the loading stage.');
    if (input.loadedUnits > stop.order.orderedUnits) throw new DomainError('INVALID_DOMAIN', 'Loaded quantity cannot exceed ordered quantity.');
    if (input.loadedUnits < stop.order.orderedUnits && !input.reasonCode) throw new DomainError('INVALID_DOMAIN', 'Select a reason for the loading shortfall.');
    if (input.loadedUnits === stop.order.orderedUnits && (input.reasonCode || input.note)) throw new DomainError('INVALID_DOMAIN', 'A complete load does not require a shortfall reason.');
    const changed = await tx.tripStop.updateMany({ where: { id: stop.id, active: true, updatedAt: stop.updatedAt }, data: { updatedAt: new Date() } });
    if (changed.count !== 1) throw new DomainError('DOMAIN_CONFLICT', 'The stop changed. Reload before retrying.');
    await writeLoad(tx, actor, trip, stop, input);
    await advanceTrip(tx, trip);
    return loaderTripDetail(await scopedTrip(tx, actor, trip.id));
  }, true);
}
export async function markTripReady(db: PrismaClient, userId: string, tripId: string, rawInput: unknown): Promise<LoaderTripDetail> {
  resourceId(tripId);
  const input = parse(readyTripSchema, rawInput);
  return transaction(db, userId, 'LOADER', async (tx, actor) => {
    const trip = await scopedTrip(tx, actor, tripId);
    if (trip.status === 'READY_FOR_DISPATCH') return loaderTripDetail(trip);
    expectVersion(trip.version, input.expectedTripVersion);
    const blockers = readinessBlockers(trip);
    if (trip.status !== 'LOADING' || blockers.length) throw new DomainError('MISSING_RELATED_DATA', blockers[0] ?? 'Loading must start before readiness.');
    for (const stop of trip.stops) {
      if (stop.order.status !== 'READY_FOR_DISPATCH') await transitionOrderInTransaction(tx, { actorUserId: actor.id, orderId: stop.orderId,
        expectedVersion: stop.order.version, next: 'READY_FOR_DISPATCH' });
    }
    await advanceTrip(tx, trip, 'READY_FOR_DISPATCH');
    await appendAudit(tx, { actor, eventType: 'READY_FOR_DISPATCH', entityType: 'TRIP', entityId: trip.id, metadata: { version: trip.version + 1 } });
    return loaderTripDetail(await scopedTrip(tx, actor, trip.id));
  }, true);
}
export async function readShortfallReview(tx: Prisma.TransactionClient, exceptionId: string): Promise<LoaderShortfallReview | null> {
  const row = await tx.exception.findUnique({ where: { id: exceptionId }, include: { loadRecord: { include: { tripStop: true } } } });
  if (row?.type !== 'LOADING_SHORTFALL' || !row.loadRecord) return null;
  const trip = await tx.trip.findUnique({ where: { id: row.loadRecord.tripStop.tripId }, include: loaderTripInclude });
  const stop = trip?.stops.find(item => item.id === row.loadRecord!.tripStopId);
  const detail = trip && stop ? shortfallReviewDto(trip, stop, row.id) : null;
  if (detail && trip) detail.canReview = detail.canReview && releasedSource(trip);
  if (!detail || detail.canReview) return detail;
  const audits = await tx.auditEvent.findMany({ where: { entityType: 'LOAD_RECORD', entityId: row.loadRecord.id,
    metadata: { path: ['loading', 'exceptionId'], equals: row.id } }, orderBy: [{ timestamp: 'asc' }, { id: 'asc' }] });
  const recorded = audits.find(audit => audit.eventType === 'LOAD_RECORDED'), reviewed = audits.filter(audit =>
    ['MANIFEST_REVISION_APPROVED', 'MANIFEST_REVISION_REJECTED'].includes(audit.eventType)).at(-1);
  const facts = recorded ? auditMetadataSchema.safeParse(recorded.metadata) : null;
  if (facts?.success && facts.data.loading) {
    const snapshot = facts.data.loading;
    detail.expectedUnits = snapshot.expectedUnits;
    detail.loadedUnits = snapshot.loadedUnits;
    detail.reasonCode = snapshot.reasonCode;
    detail.note = snapshot.note;
    detail.recordedAt = recorded!.timestamp.toISOString();
  }
  if (reviewed) {
    detail.reviewStatus = reviewed.eventType === 'MANIFEST_REVISION_APPROVED' ? 'APPROVED' : 'REJECTED';
    detail.reviewedAt = reviewed.timestamp.toISOString();
    detail.reviewedByUserId = reviewed.actorUserId;
  }
  return detail;
}
export async function reviewLoadingShortfall(db: PrismaClient, userId: string, exceptionId: string, rawInput: unknown): Promise<LoaderTripDetail> {
  resourceId(exceptionId);
  const input = parse(reviewLoadingShortfallSchema, rawInput);
  return transaction(db, userId, 'DISPATCHER', async (tx, actor) => {
    const row = await tx.exception.findUnique({ where: { id: exceptionId }, include: { loadRecord: { include: { tripStop: true } } } });
    if (row?.type !== 'LOADING_SHORTFALL' || !row.loadRecord) throw new DomainError('DOMAIN_NOT_FOUND', 'Loading shortfall not found.');
    const trip = await scopedTrip(tx, actor, row.loadRecord.tripStop.tripId), stop = trip.stops.find(item => item.id === row.loadRecord!.tripStopId);
    if (!stop?.load) throw new DomainError('DOMAIN_CONFLICT', 'The loading stop changed.');
    const load = stop.load;
    expectVersion(trip.version, input.expectedTripVersion);
    expectVersion(stop.order.version, input.expectedOrderVersion);
    expectVersion(load.revision, input.expectedLoadRevision);
    if (trip.status !== 'LOADING' || row.status === 'RESOLVED' || load.reviewStatus !== 'PENDING' || stop.order.status !== 'LOADING_EXCEPTION' ||
      load.expectedUnits !== stop.order.orderedUnits || load.loadedUnits == null || load.loadedUnits <= 0 || load.loadedUnits >= load.expectedUnits) throw new DomainError('DOMAIN_CONFLICT', 'This shortfall is no longer awaiting review.');
    const approved = input.decision === 'APPROVE', now = new Date(), facts = loadDto(load)!;
    await tx.loadRecord.update({ where: { id: load.id }, data: { reviewStatus: approved ? 'APPROVED' : 'REJECTED', status: approved ? 'COMPLETE' : 'EXCEPTION',
      reviewedByUserId: actor.id, reviewedAt: now, revision: { increment: 1 } } });
    await tx.exception.update({ where: { id: row.id }, data: { status: approved ? 'RESOLVED' : 'UNDER_REVIEW', reviewedByUserId: actor.id, resolvedAt: approved ? now : null } });
    await appendAudit(tx, { actor, eventType: approved ? 'MANIFEST_REVISION_APPROVED' : 'MANIFEST_REVISION_REJECTED', entityType: 'LOAD_RECORD', entityId: load.id,
      metadata: { loading: { revision: load.revision + 1, previousLoadedUnits: load.loadedUnits, expectedUnits: load.expectedUnits, loadedUnits: load.loadedUnits,
        reasonCode: facts.reasonCode, note: input.note ?? null, reviewDecision: input.decision, exceptionId: row.id },
        quantities: { orderedUnits: stop.order.orderedUnits, loadedUnits: load.loadedUnits, deliveredUnits: null, receivedUnits: null } } });
    await advanceTrip(tx, trip);
    return loaderTripDetail(await scopedTrip(tx, actor, trip.id));
  }, true);
}
