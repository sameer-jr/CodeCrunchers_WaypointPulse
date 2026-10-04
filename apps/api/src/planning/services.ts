import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DeferralReason, Prisma, type PrismaClient } from '@prisma/client';
import { planningActionInputSchema, planningGenerateInputSchema, planningListQuerySchema, type PlanningRunDetail, type PlanningRunList, type PlanningRunSummary, type PlanningSummary, type PlanningValidation } from '@waypoint/shared';
import { z } from 'zod';
import { appendAudit } from '../domain/audit.js';
import { dateOnly, weekStart } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { transitionOrderInTransaction } from '../domain/lifecycle.js';
import { orderDto, orderInclude, tripDto, tripInclude } from '../dispatcher/dto.js';
import { orderScopeWhere, resolveDispatcherScope, selectedDepotIds, tripScopeWhere, type DispatcherScope } from '../dispatcher/scope.js';
import { checkPlanningOptions, compareSnapshot, gatherPlanningData, getEligibleOrdersForPlanning, instantForMinute, minuteForInstant, snapshotHash, type PlanningServiceOptions, type PlanningSnapshot } from './data.js';
import { generatePlan } from './engine.js';
import { STRATEGY_VERSION, type GeneratedPlan, type PlanningDecision } from './model.js';
import { validatePlan } from './validator.js';

export type { PlanningServiceOptions } from './data.js';
const idSchema = z.string().uuid();
const runInclude = { depot: true, deferrals: true, allocations: { orderBy: { orderId: 'asc' }, include: { order: { include: orderInclude }, tripStop: true } }, trips: { orderBy: [{ vehicleId: 'asc' }, { tripNumber: 'asc' }], include: { ...tripInclude, fuelUsage: { include: { ledger: true } } } } } satisfies Prisma.PlanningRunInclude;
type RunRecord = Prisma.PlanningRunGetPayload<{ include: typeof runInclude }>;
type OrderVersions = Record<string, { version: number; status: string }>;
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new DomainError('INVALID_DOMAIN', 'Check the planning request fields and current version.'); return result.data; }
function conflict(message: string): never { throw new DomainError('DOMAIN_CONFLICT', message); }
async function transaction<T>(db: PrismaClient, write: boolean, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  try { return await db.$transaction(work, { isolationLevel: write ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120000 }); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) conflict('The planning state changed concurrently. Reload before retrying.'); throw error; }
}
function runScope(scope: DispatcherScope): Prisma.PlanningRunWhereInput {
  return { depotId: { in: scope.depotIds }, strategyVersion: { not: null },
    allocations: { every: { order: orderScopeWhere(scope.depotIds) } }, trips: { every: tripScopeWhere(scope.depotIds) } };
}
async function requireRun(tx: Prisma.TransactionClient, scope: DispatcherScope, id: string) {
  parse(idSchema, id);
  const run = await tx.planningRun.findFirst({ where: { AND: [runScope(scope), { id }] }, include: runInclude });
  if (!run) throw new DomainError('DOMAIN_NOT_FOUND', 'Planning run not found.');
  return run;
}
async function latestActive(tx: Prisma.TransactionClient, scope: DispatcherScope, depotId: string, serviceDate: Date) {
  return tx.planningRun.findFirst({ where: { AND: [runScope(scope), { depotId, serviceDate, status: { in: ['DRAFT', 'VALIDATED', 'RELEASED'] } }] }, orderBy: { revision: 'desc' } });
}
async function freshness(tx: Prisma.TransactionClient, run: RunRecord, options: PlanningServiceOptions) {
  const captured = run.snapshot as unknown as PlanningSnapshot;
  if (!captured?.input || !run.orderVersions) conflict('This generated run has no complete source snapshot.');
  const fresh = await gatherPlanningData(tx, run.depotId, run.serviceDate.toISOString().slice(0, 10), options, run.id, captured.input.orders.map(row => row.id));
  const expected = run.orderVersions as unknown as OrderVersions;
  const versionsMatch = fresh.input.orders.length >= captured.input.orders.length && captured.input.orders.every(row => {
    const current = fresh.input.orders.find(order => order.id === row.id), wanted = expected[row.id];
    return current && wanted && current.version === wanted.version && current.status === wanted.status;
  });
  const stale = !versionsMatch || run.snapshotHash !== snapshotHash(captured) || !compareSnapshot(captured, fresh.snapshot);
  return { ...fresh, stale, validationInput: fresh.input };
}
function persistedPlan(run: RunRecord): GeneratedPlan {
  const expected = run.orderVersions as unknown as OrderVersions;
  return { strategyVersion: run.strategyVersion!, decisions: run.allocations.map(row => ({ ...(row.checkMetadata as unknown as PlanningDecision),
    orderId: row.orderId, orderRef: row.order.orderRef, orderVersion: expected[row.orderId]?.version ?? -1, decision: row.decision,
    tripKey: row.tripStop ? `${run.trips.find(trip => trip.id === row.tripStop!.tripId)?.vehicleId}:${run.trips.find(trip => trip.id === row.tripStop!.tripId)?.tripNumber}` : null })),
    trips: run.trips.map(trip => ({ key: `${trip.vehicleId}:${trip.tripNumber}`, vehicleId: trip.vehicleId, tripNumber: trip.tripNumber,
      departureMinute: minuteForInstant(run.serviceDate.toISOString().slice(0, 10), trip.plannedDeparture) ?? -1, returnMinute: minuteForInstant(run.serviceDate.toISOString().slice(0, 10), trip.plannedReturn) ?? -1,
      distanceKm: trip.estimatedDistanceKm?.toString() ?? '-1', fuelLitres: trip.estimatedFuelLitres?.toString() ?? '-1',
      weightKg: trip.stops.filter(stop => stop.active).reduce((sum, stop) => sum.add(stop.order.orderedWeightKg), new Prisma.Decimal(0)).toString(),
      volumeM3: trip.stops.filter(stop => stop.active).reduce((sum, stop) => sum.add(stop.order.orderedVolumeM3), new Prisma.Decimal(0)).toString(),
      stops: trip.stops.filter(stop => stop.active).map(stop => ({ orderId: stop.orderId, sequence: stop.sequence,
        arrivalMinute: minuteForInstant(run.serviceDate.toISOString().slice(0, 10), stop.plannedArrival) ?? -1,
        serviceStartMinute: minuteForInstant(run.serviceDate.toISOString().slice(0, 10), stop.plannedServiceStart) ?? -1,
        serviceCompleteMinute: minuteForInstant(run.serviceDate.toISOString().slice(0, 10), stop.plannedServiceComplete) ?? -1,
        waitingMinutes: stop.plannedWaitingMinutes?.toNumber() ?? -1, serviceMinutes: stop.plannedServiceMinutes?.toNumber() ?? -1 })) })) };
}
function validatePersistedState(run: RunRecord, result: ReturnType<typeof validatePlan>) {
  const issues = [...result.issues], expectedStatus = run.status === 'DRAFT' ? 'DRAFT' : 'PLANNED';
  for (const allocation of run.allocations) {
    const assigned = allocation.decision === 'ASSIGNED', expectedOrderStatus = assigned ? run.status === 'DRAFT' ? 'CLOSED_FOR_PLANNING' : 'PLANNED' : 'DEFERRED';
    if (allocation.order.status !== expectedOrderStatus || assigned && (!allocation.tripStop?.active || allocation.tripStop.orderId !== allocation.orderId || !run.trips.some(trip => trip.id === allocation.tripStop?.tripId))) {
      issues.push({ code: 'ASSIGNMENT', message: 'Each decision must retain its exact order, stop and unreleased lifecycle stage.', orderId: allocation.orderId, tripKey: null });
    }
    if (!assigned && (allocation.tripStopId != null || run.deferrals.filter(row => row.orderId === allocation.orderId).length !== 1)) {
      issues.push({ code: 'ASSIGNMENT', message: 'Each deferred decision requires its persisted run reason and no assignment.', orderId: allocation.orderId, tripKey: null });
    }
    if (!assigned) {
      const metadata = allocation.checkMetadata as unknown as PlanningDecision, deferral = run.deferrals.find(row => row.orderId === allocation.orderId);
      const expectedCode = Object.values(DeferralReason).includes(metadata.reasonCode as DeferralReason) ? metadata.reasonCode : 'NO_FEASIBLE_ASSIGNMENT';
      if (!deferral || deferral.reasonCode !== expectedCode || deferral.reasonDetail !== metadata.reason.slice(0, 1000)) {
        issues.push({ code: 'ASSIGNMENT', message: 'The deferred explanation must match its retained run reason.', orderId: allocation.orderId, tripKey: null });
      }
    }
  }
  for (const trip of run.trips) {
    const tripKey = `${trip.vehicleId}:${trip.tripNumber}`;
    if (trip.status !== expectedStatus || trip.stops.some(stop => !stop.active || stop.status !== 'PLANNED')) issues.push({ code: 'ASSIGNMENT', message: 'Generated trip and stop state must match the unreleased run stage.', orderId: null, tripKey });
    const reservations = trip.fuelUsage.filter(row => row.kind === 'RESERVED' && row.status === 'ACTIVE');
    if (reservations.length !== 1 || trip.fuelUsage.some(row => row.kind === 'CONSUMED' && row.status === 'ACTIVE')
      || reservations.some(row => row.ledger.vehicleId !== trip.vehicleId || row.ledger.weekStart.getTime() !== weekStart(run.serviceDate.toISOString().slice(0, 10)).getTime()
        || trip.estimatedFuelLitres == null || !row.litres.eq(trip.estimatedFuelLitres) || !trip.plannedDeparture || row.occurredAt.getTime() !== trip.plannedDeparture.getTime())) issues.push({ code: 'FUEL_QUOTA', message: 'Every generated trip requires its exact active weekly fuel reservation and no consumption before release.', orderId: null, tripKey });
  }
  return { valid: issues.length === 0, issues };
}
async function summaryDto(tx: Prisma.TransactionClient, run: RunRecord, options: PlanningServiceOptions): Promise<PlanningRunSummary> {
  const live = run.status === 'DRAFT' || run.status === 'VALIDATED';
  const fresh = live ? await freshness(tx, run, options) : null, stale = fresh?.stale ?? false;
  const validation = run.validation as unknown as PlanningValidation | null;
  const currentlyValid = run.status === 'VALIDATED' && fresh && !stale ? validatePersistedState(run, validatePlan(fresh.validationInput, persistedPlan(run))).valid : false;
  const capturedDepot = (run.snapshot as unknown as PlanningSnapshot).display?.depot;
  return { id: run.id, planningRef: run.planningRef, serviceDate: run.serviceDate.toISOString().slice(0, 10), depot: capturedDepot ?? { id: run.depotId, name: run.depot.name },
    status: run.status, version: run.version, revision: run.revision!, strategyVersion: run.strategyVersion!, generatedAt: run.generatedAt!.toISOString(),
    validatedAt: run.validatedAt?.toISOString() ?? null, releasedAt: run.releasedAt?.toISOString() ?? null, supersededAt: run.supersededAt?.toISOString() ?? null,
    summary: run.summary as unknown as PlanningSummary, validation, stale, canValidate: live && !stale,
    canRelease: run.status === 'VALIDATED' && validation?.valid === true && !!currentlyValid, canRegenerate: live };
}
async function detailDto(tx: Prisma.TransactionClient, run: RunRecord, options: PlanningServiceOptions): Promise<PlanningRunDetail> {
  const summary = await summaryDto(tx, run, options), captured = run.snapshot as unknown as PlanningSnapshot;
  const sourceFacts = captured.facts as { vehicles: { id: string; source: 'OFFICIAL' | 'SYNTHETIC'; availability: { source: 'OFFICIAL' | 'SYNTHETIC' }[] }[]; outlets: { id: string; source: 'OFFICIAL' | 'SYNTHETIC' }[] };
  const sourceVehicles = sourceFacts.vehicles;
  const capacity = (used: string, maximum: string) => ({ used, capacity: maximum, remaining: new Prisma.Decimal(maximum).sub(used).toString(), percentage: new Prisma.Decimal(used).div(maximum).mul(100).toNumber() });
  return { ...summary, vehicles: captured.input.vehicles.map(vehicle => ({ id: vehicle.id, vehicleRef: vehicle.vehicleRef, active: vehicle.active,
      availability: vehicle.availability, availableFromMinute: vehicle.availableFromMinute, availableUntilMinute: vehicle.availableUntilMinute,
      availabilitySource: sourceVehicles.find(row => row.id === vehicle.id)?.availability[0]?.source ?? null, fuelKnown: vehicle.fuelKnown, remainingFuelLitres: vehicle.remainingFuelLitres })),
    decisions: run.allocations.map(row => {
      const metadata = row.checkMetadata as unknown as PlanningDecision;
      const original = captured.input.orders.find(order => order.id === row.orderId)!;
      const savedOrder = captured.display?.orders.find(order => order.id === row.orderId) ?? orderDto(row.order);
      const order = { ...savedOrder, orderRef: original.orderRef, temperatureRequirement: original.temperature, orderedUnits: original.units,
        orderedWeightKg: original.weightKg, orderedVolumeM3: original.volumeM3, requestedDeliveryDate: original.requestedDate, eligibleDeliveryDate: original.eligibleDate,
        outlet: { ...savedOrder.outlet, id: original.outlet.id, outletRef: original.outlet.outletRef, depotId: original.outlet.depotId,
          depotName: captured.display?.depot.name ?? savedOrder.outlet.depotName, brand: original.outlet.brand, district: original.outlet.district,
          dockType: original.outlet.dockType, accessConstraint: original.outlet.access, deliveryWindowOpen: original.outlet.windowOpen,
          deliveryWindowClose: original.outlet.windowClose, mallWindowOpen: original.outlet.mallOpen, mallWindowClose: original.outlet.mallClose,
          source: sourceFacts.outlets.find(outlet => outlet.id === original.outlet.id)?.source ?? savedOrder.outlet.source } };
      return { id: row.id, order, decision: row.decision, tripId: row.tripStop?.tripId ?? null,
        reasonCode: metadata.reasonCode, reason: metadata.reason, checks: metadata.checks, alternatives: metadata.alternatives, priority: metadata.priority,
        nextEligibleDate: run.deferrals.find(deferral => deferral.orderId === row.orderId)?.nextEligibleDate?.toISOString().slice(0, 10) ?? null };
    }), trips: run.trips.map(trip => {
      const vehicle = captured.input.vehicles.find(row => row.id === trip.vehicleId)!;
      const orders = trip.stops.map(stop => captured.input.orders.find(order => order.id === stop.orderId)!);
      const base = tripDto(trip), dto = { ...base, vehicle: { ...base.vehicle, vehicleRef: vehicle.vehicleRef, active: vehicle.active, type: vehicle.type,
          depot: captured.display?.depot ?? base.vehicle.depot,
          temperatureCapability: vehicle.temperature, weightCapacityKg: vehicle.weightCapacityKg, volumeCapacityM3: vehicle.volumeCapacityM3,
          source: sourceVehicles.find(row => row.id === vehicle.id)!.source }, stopCount: trip.stops.length,
        orderedUnits: orders.reduce((sum, order) => sum + order.units, 0),
        orderedWeightKg: orders.reduce((sum, order) => sum.add(order.weightKg), new Prisma.Decimal(0)).toString(),
        orderedVolumeM3: orders.reduce((sum, order) => sum.add(order.volumeM3), new Prisma.Decimal(0)).toString() };
      return { ...dto, estimatedFuelLitres: trip.estimatedFuelLitres?.toString() ?? '0', capacity: { weight: capacity(dto.orderedWeightKg, vehicle.weightCapacityKg), volume: capacity(dto.orderedVolumeM3, vehicle.volumeCapacityM3) },
        stops: trip.stops.map(stop => ({ id: stop.id, orderId: stop.orderId, orderRef: captured.input.orders.find(order => order.id === stop.orderId)!.orderRef,
          outletRef: captured.input.orders.find(order => order.id === stop.orderId)!.outlet.outletRef, sequence: stop.sequence, active: stop.active,
          plannedArrival: stop.plannedArrival!.toISOString(), plannedServiceStart: stop.plannedServiceStart!.toISOString(), plannedServiceComplete: stop.plannedServiceComplete!.toISOString(),
          plannedWaitingMinutes: stop.plannedWaitingMinutes!.toString(), plannedServiceMinutes: stop.plannedServiceMinutes!.toString() })) };
    }) };
}
async function updateOrderVersions(tx: Prisma.TransactionClient, runId: string, ids: string[]) {
  const orders = await tx.order.findMany({ where: { id: { in: ids } }, select: { id: true, version: true, status: true } });
  await tx.planningRun.update({ where: { id: runId }, data: { orderVersions: json(Object.fromEntries(orders.map(row => [row.id, { version: row.version, status: row.status }]))) } });
}
async function supersede(tx: Prisma.TransactionClient, scope: DispatcherScope, run: RunRecord, options: PlanningServiceOptions, now: Date) {
  if (!['DRAFT', 'VALIDATED'].includes(run.status) || run.releasedAt) conflict('Released planning history cannot be regenerated.');
  await tx.planningRun.update({ where: { id: run.id }, data: { status: 'SUPERSEDED', supersededAt: now, version: { increment: 1 } } });
  await tx.tripStop.updateMany({ where: { trip: { planningRunId: run.id } }, data: { active: false, status: 'CANCELLED' } });
  await tx.trip.updateMany({ where: { planningRunId: run.id, status: { in: ['DRAFT', 'PLANNED'] } }, data: { status: 'CANCELLED', version: { increment: 1 } } });
  await tx.fuelUsage.updateMany({ where: { trip: { planningRunId: run.id }, kind: 'RESERVED', status: 'ACTIVE' }, data: { status: 'VOIDED' } });
  for (const allocation of run.allocations) if (allocation.decision === 'ASSIGNED' && allocation.order.status === 'PLANNED') {
    await transitionOrderInTransaction(tx, { actorUserId: scope.actor.id, orderId: allocation.orderId, expectedVersion: allocation.order.version, next: 'CLOSED_FOR_PLANNING' }, { ...options, supersedingPlanningRunId: run.id });
  }
}

export async function generatePlanningRun(db: PrismaClient, userId: string, rawInput: unknown, options: PlanningServiceOptions = {}): Promise<PlanningRunDetail> {
  const request = parse(planningGenerateInputSchema, rawInput); checkPlanningOptions(options);
  const started = performance.now();
  const result = await transaction(db, true, async tx => {
    const scope = await resolveDispatcherScope(tx, userId); selectedDepotIds(scope, request.depotId);
    const current = await latestActive(tx, scope, request.depotId, dateOnly(request.serviceDate));
    const unreleased = current && ['DRAFT', 'VALIDATED'].includes(current.status) ? current : null;
    if (request.expectedRunId) {
      if (!unreleased || unreleased.id !== request.expectedRunId || unreleased.version !== request.expectedVersion) conflict('The selected run is no longer the current unreleased version.');
      await supersede(tx, scope, await requireRun(tx, scope, unreleased.id), options, options.now?.() ?? new Date());
    } else if (unreleased) conflict('An unreleased run already exists. Regenerate using its identifier and current version.');
    const gathered = await gatherPlanningData(tx, request.depotId, request.serviceDate, options);
    if (!gathered.input.operatingDay) throw new DomainError('MISSING_RELATED_DATA', 'Choose an imported operating service date with permitted reference provenance.');
    if (!gathered.input.orders.length) throw new DomainError('MISSING_RELATED_DATA', 'There are no eligible unassigned orders for this depot and service date.');
    if (gathered.input.orders.length > 5000) throw new DomainError('INVALID_DOMAIN', 'This run exceeds the supported 5000-order planning bound. Use a smaller demand scope.');
    const plan = generatePlan(gathered.input), now = options.now?.() ?? new Date();
    const maximum = await tx.planningRun.aggregate({ where: { depotId: request.depotId, serviceDate: dateOnly(request.serviceDate) }, _max: { revision: true } });
    const summary: PlanningSummary = { eligibleOrders: plan.decisions.length, served: plan.decisions.filter(row => row.decision === 'ASSIGNED').length,
      deferred: plan.decisions.filter(row => row.decision === 'DEFERRED').length, trips: plan.trips.length,
      orderedWeightKg: gathered.input.orders.reduce((sum, row) => sum.add(row.weightKg), new Prisma.Decimal(0)).toString(),
      orderedVolumeM3: gathered.input.orders.reduce((sum, row) => sum.add(row.volumeM3), new Prisma.Decimal(0)).toString(), generationDurationMs: 0 };
    const run = await tx.planningRun.create({ data: { planningRef: `WP-PLAN-${request.serviceDate}-${randomUUID()}`, depotId: request.depotId,
      serviceDate: dateOnly(request.serviceDate), createdByUserId: userId, status: 'DRAFT', revision: (maximum._max.revision ?? 0) + 1,
      strategyVersion: STRATEGY_VERSION, generatedAt: now, snapshot: json(gathered.snapshot), snapshotHash: snapshotHash(gathered.snapshot), summary: json(summary) } });
    const stopIds = new Map<string, string>();
    for (const trip of plan.trips) {
      const created = await tx.trip.create({ data: { tripRef: `WP-TRIP-${request.serviceDate}-${randomUUID()}`, planningRunId: run.id, serviceDate: dateOnly(request.serviceDate), vehicleId: trip.vehicleId,
        tripNumber: trip.tripNumber, status: 'DRAFT', plannedDeparture: instantForMinute(request.serviceDate, trip.departureMinute), plannedReturn: instantForMinute(request.serviceDate, trip.returnMinute), estimatedDistanceKm: trip.distanceKm, estimatedFuelLitres: trip.fuelLitres } });
      const ledger = gathered.vehicles.find(row => row.id === trip.vehicleId)!.fuelLedgers[0];
      if (!ledger || ledger.openingConsumedLitres == null) conflict('A weekly fuel opening is required before reserving an assigned trip.');
      await tx.fuelUsage.create({ data: { ledgerId: ledger.id, tripId: created.id, kind: 'RESERVED', litres: trip.fuelLitres, occurredAt: instantForMinute(request.serviceDate, trip.departureMinute),
        source: options.allowSyntheticReferences ? 'SYNTHETIC' : 'OFFICIAL', recordedByUserId: userId } });
      await tx.tripStop.createMany({ data: trip.stops.map(stop => { const id = randomUUID(); stopIds.set(stop.orderId, id); return { id, tripId: created.id, orderId: stop.orderId, sequence: stop.sequence, active: true,
        plannedArrival: instantForMinute(request.serviceDate, stop.arrivalMinute), plannedServiceStart: instantForMinute(request.serviceDate, stop.serviceStartMinute), plannedServiceComplete: instantForMinute(request.serviceDate, stop.serviceCompleteMinute),
        plannedWaitingMinutes: stop.waitingMinutes, plannedServiceMinutes: stop.serviceMinutes }; }) });
    }
    const nextDay = await tx.calendarDay.findFirst({ where: { date: { gt: dateOnly(request.serviceDate) }, operatingDay: true, ...(options.allowSyntheticReferences ? {} : { source: 'OFFICIAL' }) }, orderBy: { date: 'asc' } });
    for (const decision of plan.decisions) {
      const order = gathered.orders.find(row => row.id === decision.orderId)!;
      const changed = decision.decision === 'ASSIGNED' ? order.status === 'CLOSED_FOR_PLANNING' ? order : await transitionOrderInTransaction(tx, { actorUserId: userId, orderId: order.id, expectedVersion: order.version, next: 'CLOSED_FOR_PLANNING' }, options)
        : await transitionOrderInTransaction(tx, { actorUserId: userId, orderId: order.id, expectedVersion: order.version, next: 'DEFERRED',
          deferral: { planningRunId: run.id, reasonCode: Object.values(DeferralReason).includes(decision.reasonCode as DeferralReason) ? decision.reasonCode as DeferralReason : 'NO_FEASIBLE_ASSIGNMENT',
            reasonDetail: decision.reason.slice(0, 1000), ...(nextDay ? { nextEligibleDate: nextDay.date.toISOString().slice(0, 10) } : {}) } }, options);
      decision.orderVersion = changed.version;
      await tx.allocation.create({ data: { planningRunId: run.id, orderId: order.id, tripStopId: stopIds.get(order.id), decision: decision.decision, checkMetadata: json(decision) } });
    }
    await updateOrderVersions(tx, run.id, plan.decisions.map(row => row.orderId));
    summary.generationDurationMs = Math.round(performance.now() - started);
    await tx.planningRun.update({ where: { id: run.id }, data: { summary: json(summary) } });
    await appendAudit(tx, { actor: scope.actor, eventType: 'PLAN_GENERATED', entityType: 'PLANNING_RUN', entityId: run.id,
      metadata: { version: 1, strategyVersion: STRATEGY_VERSION, planningCounts: { eligible: summary.eligibleOrders, served: summary.served, deferred: summary.deferred, trips: summary.trips } } });
    return detailDto(tx, await requireRun(tx, scope, run.id), options);
  });
  return result;
}

export async function listPlanningRuns(db: PrismaClient, userId: string, rawQuery: unknown, options: PlanningServiceOptions = {}): Promise<PlanningRunList> {
  const query = parse(planningListQuerySchema, rawQuery); checkPlanningOptions(options);
  return transaction(db, false, async tx => {
    const scope = await resolveDispatcherScope(tx, userId); selectedDepotIds(scope, query.depotId);
    const where = { AND: [runScope(scope), { serviceDate: dateOnly(query.date), depotId: query.depotId }] };
    const [rows, total, active] = await Promise.all([tx.planningRun.findMany({ where, include: runInclude, orderBy: { revision: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), tx.planningRun.count({ where }), latestActive(tx, scope, query.depotId, dateOnly(query.date))]);
    return { runs: await Promise.all(rows.map(run => summaryDto(tx, run, options))), latestActiveId: active?.id ?? null, total, page: query.page, limit: query.limit };
  });
}
export async function readPlanningRun(db: PrismaClient, userId: string, id: string, options: PlanningServiceOptions = {}): Promise<PlanningRunDetail> {
  checkPlanningOptions(options);
  return transaction(db, false, async tx => { const scope = await resolveDispatcherScope(tx, userId); return detailDto(tx, await requireRun(tx, scope, id), options); });
}

export async function planningCapabilities(tx: Prisma.TransactionClient, scope: DispatcherScope, serviceDate: string, options: PlanningServiceOptions = {}) {
  checkPlanningOptions(options);
  const [calendar, demand, activeRuns] = await Promise.all([
    tx.calendarDay.findUnique({ where: { date: dateOnly(serviceDate) } }),
    Promise.all(scope.depotIds.map(async depotId => ({ depotId, orders: await getEligibleOrdersForPlanning(tx, depotId, serviceDate, options) }))),
    tx.planningRun.findMany({ where: { AND: [runScope(scope), { serviceDate: dateOnly(serviceDate), status: { in: ['DRAFT', 'VALIDATED'] } }] }, include: runInclude })
  ]);
  const permitted = calendar?.operatingDay && (calendar.source === 'OFFICIAL' || options.allowSyntheticReferences === true);
  const generationDepotIds = permitted ? demand.filter(row => row.orders.length > 0).map(row => row.depotId) : [];
  const runs = await Promise.all(activeRuns.map(run => summaryDto(tx, run, options)));
  return { generationAvailable: generationDepotIds.length > 0, generationDepotIds,
    validationAvailable: runs.some(run => run.canValidate), releaseAvailable: runs.some(run => run.canRelease) };
}

export async function validatePlanningRun(db: PrismaClient, userId: string, id: string, rawInput: unknown, options: PlanningServiceOptions = {}): Promise<PlanningRunDetail> {
  const request = parse(planningActionInputSchema, rawInput); checkPlanningOptions(options);
  return transaction(db, true, async tx => {
    const scope = await resolveDispatcherScope(tx, userId), run = await requireRun(tx, scope, id);
    if (!['DRAFT', 'VALIDATED'].includes(run.status) || run.version !== request.expectedVersion) conflict('Use the current unreleased run version to validate.');
    const fresh = await freshness(tx, run, options);
    if (fresh.stale) conflict('Demand or planning resources changed. Regenerate before validating.');
    const validation: PlanningValidation = { ...validatePersistedState(run, validatePlan(fresh.validationInput, persistedPlan(run))), checkedAt: (options.now?.() ?? new Date()).toISOString() };
    if (validation.valid) {
      await tx.planningRun.update({ where: { id }, data: { status: 'VALIDATED', validatedAt: new Date(validation.checkedAt), validation: json(validation), validatedSnapshotHash: run.snapshotHash, version: { increment: 1 } } });
      await tx.trip.updateMany({ where: { planningRunId: id }, data: { status: 'PLANNED', version: { increment: 1 } } });
      for (const row of run.allocations) if (row.decision === 'ASSIGNED' && row.order.status === 'CLOSED_FOR_PLANNING') await transitionOrderInTransaction(tx, { actorUserId: userId, orderId: row.orderId, expectedVersion: row.order.version, next: 'PLANNED' }, options);
      await updateOrderVersions(tx, id, run.allocations.map(row => row.orderId));
    } else {
      if (run.status === 'VALIDATED') conflict('The validated plan no longer passes independent checks. Regenerate before release.');
      await tx.planningRun.update({ where: { id }, data: { validation: json(validation), validatedAt: null, validatedSnapshotHash: null, version: { increment: 1 } } });
    }
    await appendAudit(tx, { actor: scope.actor, eventType: 'PLAN_VALIDATED', entityType: 'PLANNING_RUN', entityId: id, metadata: { version: run.version + 1, validationValid: validation.valid, strategyVersion: run.strategyVersion! } });
    return detailDto(tx, await requireRun(tx, scope, id), options);
  });
}
export async function releasePlanningRun(db: PrismaClient, userId: string, id: string, rawInput: unknown, options: PlanningServiceOptions = {}): Promise<PlanningRunDetail> {
  const request = parse(planningActionInputSchema, rawInput); checkPlanningOptions(options);
  return transaction(db, true, async tx => {
    const scope = await resolveDispatcherScope(tx, userId), run = await requireRun(tx, scope, id);
    if (run.status !== 'VALIDATED' || run.version !== request.expectedVersion || !(run.validation as unknown as PlanningValidation)?.valid || !run.validatedAt || run.validatedSnapshotHash !== run.snapshotHash) conflict('Only the current independently validated run can be released.');
    const current = await latestActive(tx, scope, run.depotId, run.serviceDate);
    if (current?.id !== id) conflict('Only the latest active generated run can be released.');
    const fresh = await freshness(tx, run, options);
    if (fresh.stale) conflict('Demand or planning resources changed. Regenerate and validate before release.');
    const validation = validatePersistedState(run, validatePlan(fresh.validationInput, persistedPlan(run)));
    if (!validation.valid) conflict('Fresh independent validation rejected the plan. Regenerate before release.');
    const now = options.now?.() ?? new Date();
    const releasedVersions = Object.fromEntries(run.allocations.map(row => [row.orderId, { version: row.order.version + (row.decision === 'ASSIGNED' ? 1 : 0),
      status: row.decision === 'ASSIGNED' ? 'RELEASED_TO_LOADING' : row.order.status }]));
    await tx.planningRun.update({ where: { id }, data: { status: 'RELEASED', releasedAt: now, orderVersions: json(releasedVersions), version: { increment: 1 } } });
    await tx.trip.updateMany({ where: { planningRunId: id, status: 'PLANNED' }, data: { status: 'RELEASED', version: { increment: 1 } } });
    for (const row of run.allocations) if (row.decision === 'ASSIGNED') await transitionOrderInTransaction(tx, { actorUserId: userId, orderId: row.orderId, expectedVersion: row.order.version, next: 'RELEASED_TO_LOADING' }, options);
    await appendAudit(tx, { actor: scope.actor, eventType: 'PLAN_RELEASED', entityType: 'PLANNING_RUN', entityId: id, metadata: { version: run.version + 1, strategyVersion: run.strategyVersion! } });
    return detailDto(tx, await requireRun(tx, scope, id), options);
  });
}
