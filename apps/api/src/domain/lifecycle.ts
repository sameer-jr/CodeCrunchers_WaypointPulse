import { z } from 'zod';
import { AuditEventType, DeferralReason, OrderStatus, Prisma, type PrismaClient, type Role } from '@prisma/client';
import { appendAudit, type DomainActor } from './audit.js';
import { dateOnly, dateSchema } from './dates.js';
import { DomainError } from './errors.js';
import { assertOrderScope, resolveActor } from './scope.js';
import { syntheticReferencesPermitted } from './synthetic-mode.js';

const dispatcher: Role[] = ['DISPATCHER'];
const loader: Role[] = ['LOADER'];
const driver: Role[] = ['DRIVER'];
const store: Role[] = ['STORE_MANAGER'];
export const ORDER_TRANSITIONS: Partial<Record<OrderStatus, Partial<Record<OrderStatus, readonly Role[]>>>> = {
  DRAFT: { CONFIRMED: [...store, ...dispatcher] },
  CONFIRMED: { CLOSED_FOR_PLANNING: dispatcher, DEFERRED: dispatcher },
  CLOSED_FOR_PLANNING: { PLANNED: dispatcher, DEFERRED: dispatcher },
  DEFERRED: { CONFIRMED: dispatcher, CLOSED_FOR_PLANNING: dispatcher, DEFERRED: dispatcher },
  PLANNED: { RELEASED_TO_LOADING: dispatcher, CLOSED_FOR_PLANNING: dispatcher },
  RELEASED_TO_LOADING: { LOADING: loader },
  LOADING: { LOADING_EXCEPTION: loader, READY_FOR_DISPATCH: loader },
  LOADING_EXCEPTION: { READY_FOR_DISPATCH: [...dispatcher, ...loader] },
  READY_FOR_DISPATCH: { IN_TRANSIT: [...driver, ...dispatcher] },
  IN_TRANSIT: { ARRIVED: driver },
  ARRIVED: { DELIVERED: driver, PARTIALLY_DELIVERED: driver, DELIVERY_FAILED: driver },
  DELIVERED: { AWAITING_RECEIPT: [...driver, ...dispatcher, ...store] },
  PARTIALLY_DELIVERED: { AWAITING_RECEIPT: [...driver, ...dispatcher, ...store] },
  DELIVERY_FAILED: { DEFERRED: dispatcher },
  AWAITING_RECEIPT: { RECEIPT_CONFIRMED: store, RECEIPT_ISSUE: store },
  RECEIPT_ISSUE: { RECEIPT_CONFIRMED: store }
};
export const transitionSchema = z.object({
  actorUserId: z.string().uuid(), orderId: z.string().uuid(), next: z.nativeEnum(OrderStatus), expectedVersion: z.number().int().positive(),
  deferral: z.object({ reasonCode: z.nativeEnum(DeferralReason), reasonDetail: z.string().trim().min(1).max(1000),
    nextEligibleDate: dateSchema.optional(), planningRunId: z.string().uuid().optional() }).strict().optional()
}).strict();
type TransitionInput = z.infer<typeof transitionSchema>;
type LifecycleOptions = { allowSyntheticReferences?: boolean; supersedingPlanningRunId?: string };
const eventTypes: Partial<Record<OrderStatus, AuditEventType>> = {
  CONFIRMED: 'ORDER_CONFIRMED', PLANNED: 'ORDER_ALLOCATED', DEFERRED: 'ORDER_DEFERRED',
  RELEASED_TO_LOADING: 'PLAN_RELEASED', LOADING: 'LOADING_STARTED', LOADING_EXCEPTION: 'LOADING_SHORTFALL_REPORTED',
  READY_FOR_DISPATCH: 'READY_FOR_DISPATCH', IN_TRANSIT: 'TRIP_STARTED', DELIVERED: 'STOP_COMPLETED',
  PARTIALLY_DELIVERED: 'DELIVERY_PARTIAL', DELIVERY_FAILED: 'DELIVERY_FAILED',
  RECEIPT_CONFIRMED: 'RECEIPT_CONFIRMED', RECEIPT_ISSUE: 'RECEIPT_ISSUE_REPORTED'
};
function related(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError('MISSING_RELATED_DATA', message);
}
async function eligibleCalendar(tx: Prisma.TransactionClient, date: Date, options: LifecycleOptions) {
  const day = await tx.calendarDay.findUnique({ where: { date } });
  related(day?.operatingDay, 'An imported operating calendar day is required.');
  related(day.source === 'OFFICIAL' || options.allowSyntheticReferences === true, 'Synthetic calendar fixtures cannot establish official eligibility.');
}
async function checkRelatedData(tx: Prisma.TransactionClient, input: TransitionInput, actor: DomainActor, options: LifecycleOptions) {
  const { next, orderId } = input;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { outlet: true } });
  if (order.status === 'PLANNED' && next === 'CLOSED_FOR_PLANNING') {
    related(options.supersedingPlanningRunId, 'A generated planning run is required to return a planned order to planning.');
    const old = await tx.planningRun.findUnique({ where: { id: options.supersedingPlanningRunId }, include: {
      allocations: { where: { orderId }, include: { tripStop: { include: { trip: true } } } }
    } });
    const assignment = old?.allocations.find(row => row.decision === 'ASSIGNED');
    related(old?.strategyVersion && old.status === 'SUPERSEDED' && old.supersededAt && !old.releasedAt && old.depotId === order.outlet.depotId
      && assignment?.tripStop && !assignment.tripStop.active && assignment.tripStop.trip.status === 'CANCELLED'
      && assignment.tripStop.trip.planningRunId === old.id, 'Only a superseded, unreleased generated assignment can return to planning.');
    related(!await tx.tripStop.findFirst({ where: { orderId, active: true } }), 'An active assignment prevents regeneration.');
  }
  if (['CONFIRMED', 'CLOSED_FOR_PLANNING'].includes(next)) {
    await eligibleCalendar(tx, order.requestedDeliveryDate, options);
    if (order.eligibleDeliveryDate) await eligibleCalendar(tx, order.eligibleDeliveryDate, options);
    related(order.outlet.source === 'OFFICIAL' || options.allowSyntheticReferences === true, 'Official outlet reference data is required.');
    return;
  }
  if (next === 'DEFERRED') {
    related(input.deferral, 'Deferral requires a reason code and detail.');
    if (input.deferral.nextEligibleDate) {
      const date = dateOnly(input.deferral.nextEligibleDate);
      related(date >= order.requestedDeliveryDate, 'Next eligible date cannot precede the original request.');
      await eligibleCalendar(tx, date, options);
    }
    if (input.deferral.planningRunId) {
      const plan = await tx.planningRun.findUnique({ where: { id: input.deferral.planningRunId } });
      related(plan?.depotId === order.outlet.depotId, 'Deferral planning run must belong to the order depot.');
    }
    return;
  }
  const stop = await tx.tripStop.findFirst({ where: { orderId, active: true }, include: {
    trip: true, allocations: { include: { planningRun: true } }, load: true,
    delivery: { include: { proof: true, receipt: true } }
  } });
  related(stop, 'The transition requires an active trip stop.');
  if (next === 'PLANNED' || next === 'RELEASED_TO_LOADING') {
    const allocation = stop.allocations.find(row => row.decision === 'ASSIGNED');
    related(allocation, 'A persisted assignment is required.');
    await eligibleCalendar(tx, stop.trip.serviceDate, options);
    if (next === 'PLANNED') related(['VALIDATED', 'RELEASED'].includes(allocation.planningRun.status) && allocation.planningRun.validatedAt && stop.trip.status === 'PLANNED', 'Planning requires a validated run and planned trip.');
    else related(allocation.planningRun.status === 'RELEASED' && allocation.planningRun.releasedAt && stop.trip.status === 'RELEASED', 'Loading release requires a released planning run and trip.');
  } else if (next === 'LOADING') {
    related(stop.load?.status === 'LOADING' && stop.load.recordedByUserId === actor.id && stop.load.recordedAt, 'Loading requires its recorded loading record.');
  } else if (next === 'LOADING_EXCEPTION') {
    related(stop.load?.loadedUnits != null && stop.load.loadedUnits < stop.load.expectedUnits && stop.load.reviewStatus === 'PENDING' && stop.load.reason, 'Shortfall requires separate loaded units, reason and pending review.');
    related(await tx.exception.findFirst({ where: { loadRecordId: stop.load.id, type: 'LOADING_SHORTFALL', status: { not: 'RESOLVED' } } }), 'Shortfall requires an actionable loading exception.');
  } else if (next === 'READY_FOR_DISPATCH' || next === 'IN_TRANSIT') {
    const load = stop.load;
    related(load?.loadedUnits != null && load.loadedUnits > 0 && load.status === 'COMPLETE', 'Dispatch requires a completed load record with positive loaded units.');
    related(load.reviewStatus === 'NOT_REQUIRED' || (load.reviewStatus === 'APPROVED' && load.reviewedAt && load.reviewedByUserId), 'Loading revisions must be approved before departure.');
    related(!await tx.exception.findFirst({ where: { loadRecordId: load.id, status: { not: 'RESOLVED' } } }), 'Open loading exceptions hold departure.');
    if (next === 'IN_TRANSIT') related(stop.trip.actualDeparture && stop.trip.status === 'IN_TRANSIT', 'Departure requires the recorded trip departure.');
  } else if (next === 'ARRIVED') {
    related(stop.actualArrival && stop.status === 'ARRIVED', 'Arrival requires the recorded stop arrival.');
  } else if (['DELIVERED', 'PARTIALLY_DELIVERED', 'DELIVERY_FAILED', 'AWAITING_RECEIPT'].includes(next)) {
    const delivery = stop.delivery;
    related(delivery && stop.actualArrival, 'A completed delivery record and actual stop arrival are required.');
    if (next === 'AWAITING_RECEIPT') related(delivery.outcome !== 'FAILED', 'Failed deliveries cannot await a receipt.');
    else related(delivery.outcome === (next === 'DELIVERY_FAILED' ? 'FAILED' : next) && stop.status === (next === 'DELIVERY_FAILED' ? 'FAILED' : 'COMPLETED'), 'Delivery outcome and stop completion must match the requested state.');
    related(delivery.recordedByDriverId === stop.trip.driverUserId, 'Delivery must be recorded by the assigned driver.');
    if (actor.role === 'DRIVER') related(delivery.recordedByDriverId === actor.id, 'The driver must own this delivery record.');
    if (delivery.outcome !== 'FAILED') related(delivery.proof?.recipientName, 'Successful delivery requires recipient proof metadata.');
  } else if (next === 'RECEIPT_CONFIRMED' || next === 'RECEIPT_ISSUE') {
    const receipt = stop.delivery?.receipt;
    related(receipt && receipt.confirmedByUserId === actor.id, 'Receipt must be recorded by the scoped Store Manager.');
    related(receipt.status === (next === 'RECEIPT_CONFIRMED' ? 'CONFIRMED' : 'ISSUE_REPORTED'), 'Receipt status must match the requested state.');
    const unresolved = await tx.exception.findFirst({ where: { receiptId: receipt.id, status: { not: 'RESOLVED' } } });
    if (next === 'RECEIPT_ISSUE') related(receipt.issueNote && unresolved, 'Receipt issues must retain an actionable discrepancy.');
    else related(!unresolved && receipt.receivedUnits === stop.delivery!.deliveredUnits, 'Discrepancies must be resolved before clean receipt confirmation.');
  }
}

export async function transitionOrderInTransaction(tx: Prisma.TransactionClient, rawInput: TransitionInput, options: LifecycleOptions = {}) {
  const parsed = transitionSchema.safeParse(rawInput);
  if (!parsed.success) throw new DomainError('INVALID_DOMAIN', 'Invalid lifecycle request; roles and unrelated fields are not accepted.');
  if (options.allowSyntheticReferences && !syntheticReferencesPermitted()) throw new DomainError('INVALID_DOMAIN', 'Synthetic eligibility requires an explicitly enabled starter or public judge mode in production.');
  const input = parsed.data;
  if (input.next !== 'DEFERRED' && input.deferral) throw new DomainError('INVALID_DOMAIN', 'Deferral details are only valid for a deferral.');
  const actor = await resolveActor(tx, input.actorUserId);
  const order = await assertOrderScope(tx, actor, input.orderId, true);
  if (order.version !== input.expectedVersion) throw new DomainError('DOMAIN_CONFLICT', 'The order changed. Reload before retrying.');
  const roles = ORDER_TRANSITIONS[order.status]?.[input.next];
  if (!roles) throw new DomainError('INVALID_DOMAIN', `Transition from ${order.status} to ${input.next} is not allowed.`);
  if (!roles.includes(actor.role)) throw new DomainError('DOMAIN_FORBIDDEN', 'Your role cannot perform this transition.');
  await checkRelatedData(tx, input, actor, options);
  await tx.$queryRaw`SELECT set_config('waypoint.lifecycle', 'on', true)`;
  const changed = await tx.order.updateMany({ where: { id: order.id, version: input.expectedVersion, status: order.status },
    data: { status: input.next, version: { increment: 1 }, ...(input.next === 'CONFIRMED' && !order.confirmedAt ? { confirmedAt: new Date() } : {}) } });
  if (changed.count !== 1) throw new DomainError('DOMAIN_CONFLICT', 'The order changed. Reload before retrying.');
  if (input.next === 'DEFERRED') {
    await tx.deferralRecord.create({ data: { orderId: order.id, ...input.deferral!, deferredByUserId: actor.id,
      nextEligibleDate: input.deferral?.nextEligibleDate ? dateOnly(input.deferral.nextEligibleDate) : undefined } });
  }
  const stop = await tx.tripStop.findFirst({ where: { orderId: order.id, active: true }, include: { load: true, delivery: { include: { receipt: true } } } });
  await appendAudit(tx, { actor, eventType: eventTypes[input.next] ?? 'ORDER_STATE_CHANGED', entityType: 'ORDER', entityId: order.id,
    metadata: { fromStatus: order.status, toStatus: input.next, version: order.version + 1,
      quantities: { orderedUnits: order.orderedUnits, loadedUnits: stop?.load?.loadedUnits ?? null,
        deliveredUnits: stop?.delivery?.deliveredUnits ?? null, receivedUnits: stop?.delivery?.receipt?.receivedUnits ?? null },
      ...(input.deferral ? { reasonCode: input.deferral.reasonCode } : {}) } });
  return tx.order.findUniqueOrThrow({ where: { id: order.id } });
}

export async function transitionOrder(prisma: PrismaClient, rawInput: TransitionInput, options: LifecycleOptions = {}) {
  try {
    return await prisma.$transaction(tx => transitionOrderInTransaction(tx, rawInput, options), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
      throw new DomainError('DOMAIN_CONFLICT', 'The operation conflicts with a concurrent change or existing planning decision.');
    }
    throw error;
  }
}
