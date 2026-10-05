import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type OrderStatus } from '@prisma/client';
import { ORDER_STATUSES, storeOrderInputSchema, storeReceiptInputSchema,
  type StoreHome, type StoreOrderDetail, type StoreOrderInput, type StoreOrderList, type StoreOrderSummary, type StoreReceiptInput } from '@waypoint/shared';
import { appendAudit } from '../domain/audit.js';
import { businessDate, dateOnly, dateSchema } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { transitionOrderInTransaction } from '../domain/lifecycle.js';
import { determineStoreEligibility, storeContext, storeNow, type StoreServiceOptions } from './cutoff.js';
import { outletDto, resolveStoreScope, type StoreScope } from './scope.js';
import { deliveryProofDto, deliveryProofInclude } from '../proof/dto.js';

export type { StoreServiceOptions } from './cutoff.js';
const orderInclude = { stops: { where: { active: true }, take: 1,
  include: { trip: { include: { vehicle: true } }, load: true, delivery: { include: { proof: { include: deliveryProofInclude }, receipt: true } } } } } satisfies Prisma.OrderInclude;
type StoreOrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
const receiptStates: OrderStatus[] = ['DELIVERED', 'PARTIALLY_DELIVERED', 'AWAITING_RECEIPT'];
const activeStates: OrderStatus[] = ['DRAFT', 'CONFIRMED', 'CLOSED_FOR_PLANNING', 'PLANNED', 'RELEASED_TO_LOADING', 'LOADING', 'LOADING_EXCEPTION', 'READY_FOR_DISPATCH', 'IN_TRANSIT', 'ARRIVED'];
const openIssue = { some: { status: { not: 'RESOLVED' as const } } };
const attentionWhere: Prisma.OrderWhereInput = { OR: [{ status: { in: ['RECEIPT_ISSUE', 'LOADING_EXCEPTION', 'DELIVERY_FAILED'] } },
  { exceptions: openIssue }, { stops: { some: { active: true, OR: [{ load: { is: { exceptions: openIssue } } },
    { delivery: { is: { exceptions: openIssue } } }, { delivery: { is: { receipt: { is: { exceptions: openIssue } } } } }] } } }] };
function summary(order: StoreOrderRecord): StoreOrderSummary {
  const stop = order.stops[0], delivery = stop?.delivery, receipt = delivery?.receipt;
  const requested = order.requestedDeliveryDate.toISOString().slice(0, 10), eligible = (order.eligibleDeliveryDate ?? order.requestedDeliveryDate).toISOString().slice(0, 10);
  return { id: order.id, orderRef: order.orderRef, status: order.status, version: order.version,
    requestedDeliveryDate: requested, eligibleDeliveryDate: eligible,
    eligibilityNotice: eligible !== requested ? `The 4:00 PM Sri Lanka cutoff passed. Your original request remains ${requested}; the next eligible operating run is ${eligible}.` : null,
    createdAt: order.createdAt.toISOString(), confirmedAt: order.confirmedAt?.toISOString() ?? null, temperatureRequirement: order.temperatureRequirement,
    orderedUnits: order.orderedUnits, orderedWeightKg: order.orderedWeightKg.toString(), orderedVolumeM3: order.orderedVolumeM3.toString(),
    loadedUnits: stop?.load?.loadedUnits ?? null, deliveredUnits: delivery?.deliveredUnits ?? null, receivedUnits: receipt?.receivedUnits ?? null,
    plannedArrival: stop?.plannedArrival?.toISOString() ?? null, actualArrival: stop?.actualArrival?.toISOString() ?? null,
    completedAt: delivery?.completedAt.toISOString() ?? null, receiptStatus: receipt?.status ?? null, issueType: receipt?.issueType ?? null };
}
async function scopedOrder(db: Prisma.TransactionClient, scope: StoreScope, id: string) {
  const order = await db.order.findFirst({ where: { id, outletId: scope.outlet.id }, include: orderInclude });
  if (!order) throw new DomainError('DOMAIN_NOT_FOUND', 'Order not found.');
  return order;
}
async function orderDetail(db: Prisma.TransactionClient, scope: StoreScope, order: StoreOrderRecord): Promise<StoreOrderDetail> {
  const stop = order.stops[0], delivery = stop?.delivery, receipt = delivery?.receipt;
  const [events, deferrals, issues] = await Promise.all([
    db.auditEvent.findMany({ where: { entityType: 'ORDER', entityId: order.id }, orderBy: [{ timestamp: 'asc' }, { id: 'asc' }] }),
    db.deferralRecord.findMany({ where: { orderId: order.id }, orderBy: { deferredAt: 'desc' } }),
    db.exception.findMany({ where: { OR: [{ orderId: order.id }, ...(stop?.load ? [{ loadRecordId: stop.load.id }] : []), ...(delivery ? [{ deliveryRecordId: delivery.id }] : []), ...(receipt ? [{ receiptId: receipt.id }] : [])] }, orderBy: { createdAt: 'desc' } })
  ]);
  const auditVersion = (metadata: Prisma.JsonValue) => typeof metadata === 'object' && metadata && 'version' in metadata && typeof metadata.version === 'number' ? metadata.version : 0;
  events.sort((first, second) => first.timestamp.getTime() - second.timestamp.getTime() || auditVersion(first.metadata) - auditVersion(second.metadata) || first.id.localeCompare(second.id));
  return { ...summary(order), outlet: outletDto(scope.outlet),
    canReceive: receiptStates.includes(order.status) && !!delivery && delivery.outcome !== 'FAILED' && !receipt,
    timeline: events.map(event => {
      const metadata = event.metadata as Record<string, unknown>;
      const status = typeof metadata.toStatus === 'string' && ORDER_STATUSES.some(value => value === metadata.toStatus) ? metadata.toStatus as OrderStatus : null;
      return { id: event.id, eventType: event.eventType, status, timestamp: event.timestamp.toISOString() };
    }),
    deferrals: deferrals.map(row => ({ id: row.id, reasonCode: row.reasonCode, reasonDetail: row.reasonDetail, deferredAt: row.deferredAt.toISOString(), nextEligibleDate: row.nextEligibleDate?.toISOString().slice(0, 10) ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null })),
    trip: stop ? { id: stop.trip.id, tripRef: stop.trip.tripRef, vehicleRef: stop.trip.vehicle.vehicleRef, tripNumber: stop.trip.tripNumber,
      plannedArrival: stop.plannedArrival?.toISOString() ?? null, actualArrival: stop.actualArrival?.toISOString() ?? null, actualDeparture: stop.trip.actualDeparture?.toISOString() ?? null } : null,
    delivery: delivery ? { id: delivery.id, outcome: delivery.outcome, driverNote: delivery.driverNote, arrivedAt: delivery.arrivedAt.toISOString(), completedAt: delivery.completedAt.toISOString(),
      proof: deliveryProofDto(delivery.proof) } : null,
    receipt: receipt ? { id: receipt.id, status: receipt.status, receivedUnits: receipt.receivedUnits, issueType: receipt.issueType, issueNote: receipt.issueNote, confirmedAt: receipt.confirmedAt.toISOString() } : null,
    issues: issues.map(row => ({ id: row.id, type: row.type, status: row.status, message: row.message, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null })) };
}
async function transaction<T>(db: PrismaClient, run: (tx: Prisma.TransactionClient) => Promise<T>, serializationRetries = 0) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034' && attempt < serializationRetries) {
          await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt));
          continue;
        }
        if (['P2002', 'P2034'].includes(error.code)) throw new DomainError('DOMAIN_CONFLICT', 'The order changed or this receipt already exists. Reload before retrying.');
      }
      throw error;
    }
  }
}
export async function readStoreContext(db: PrismaClient, userId: string, options: StoreServiceOptions = {}) {
  return db.$transaction(async tx => storeContext(tx, await resolveStoreScope(tx, userId), options), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function readStoreHome(db: PrismaClient, userId: string, options: StoreServiceOptions = {}): Promise<StoreHome> {
  return db.$transaction(async tx => {
    const scope = await resolveStoreScope(tx, userId), context = await storeContext(tx, scope, options), where = { outletId: scope.outlet.id };
    const [upcoming, deferred, awaitingReceipt, completed, attention, orders, attentionOrders] = await Promise.all([
      tx.order.count({ where: { ...where, status: { in: activeStates }, OR: [{ eligibleDeliveryDate: { gte: dateOnly(context.today) } }, { eligibleDeliveryDate: null, requestedDeliveryDate: { gte: dateOnly(context.today) } }] } }),
      tx.order.count({ where: { ...where, status: 'DEFERRED' } }),
      tx.order.count({ where: { ...where, status: { in: receiptStates }, stops: { some: { active: true, delivery: { is: { outcome: { not: 'FAILED' }, receipt: { is: null } } } } } } }),
      tx.order.count({ where: { ...where, status: 'RECEIPT_CONFIRMED' } }),
      tx.order.count({ where: { ...where, ...attentionWhere } }),
      tx.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 20 }),
      tx.order.findMany({ where: { ...where, ...attentionWhere }, include: orderInclude, orderBy: { updatedAt: 'desc' }, take: 10 })
    ]);
    return { context, counts: { upcoming, deferred, awaitingReceipt, completed, attention }, orders: orders.map(summary), attention: attentionOrders.map(summary) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export type StoreOrderFilters = { status?: OrderStatus; date?: string };
export async function listStoreOrders(db: PrismaClient, userId: string, filters: StoreOrderFilters = {}): Promise<StoreOrderList> {
  if (filters.status && !ORDER_STATUSES.some(status => status === filters.status)) throw new DomainError('INVALID_DOMAIN', 'Choose a valid order status.');
  if (filters.date && !dateSchema.safeParse(filters.date).success) throw new DomainError('INVALID_DOMAIN', 'Use a valid requested delivery date filter.');
  return db.$transaction(async tx => {
    const scope = await resolveStoreScope(tx, userId);
    const where = { outletId: scope.outlet.id, ...(filters.status ? { status: filters.status } : {}), ...(filters.date ? { requestedDeliveryDate: dateOnly(filters.date) } : {}) };
    const [orders, total] = await Promise.all([tx.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 100 }), tx.order.count({ where })]);
    return { orders: orders.map(summary), total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function readStoreOrder(db: PrismaClient, userId: string, id: string): Promise<StoreOrderDetail> {
  return db.$transaction(async tx => { const scope = await resolveStoreScope(tx, userId); return orderDetail(tx, scope, await scopedOrder(tx, scope, id)); }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function createStoreOrder(db: PrismaClient, userId: string, input: StoreOrderInput, options: StoreServiceOptions = {}): Promise<StoreOrderDetail> {
  const parsed = storeOrderInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_DOMAIN', 'Check the order fields. Ownership and role fields are not accepted.');
  const now = storeNow(options);
  return transaction(db, async tx => {
    const scope = await resolveStoreScope(tx, userId), request = parsed.data;
    if (scope.outlet.source !== 'OFFICIAL' && !options.allowSyntheticReferences) throw new DomainError('INVALID_DOMAIN', 'Official outlet data is required. Synthetic judge references need explicit development opt-in.');
    if (scope.outlet.brand !== 'FRESH' && request.temperatureRequirement !== 'AMBIENT') throw new DomainError('INVALID_DOMAIN', `${scope.outlet.brand === 'STYLE' ? 'Style' : 'Tech'} orders support ambient delivery only.`);
    const eligibleDeliveryDate = await determineStoreEligibility(tx, request.requestedDeliveryDate, now, options);
    const order = await tx.order.create({ data: { ...request, requestedDeliveryDate: dateOnly(request.requestedDeliveryDate), eligibleDeliveryDate,
      orderRef: `WP-${businessDate(now).replaceAll('-', '')}-${randomUUID().replaceAll('-', '').toUpperCase()}`, outletId: scope.outlet.id, createdByUserId: scope.actor.id } });
    await appendAudit(tx, { actor: scope.actor, eventType: 'ORDER_CREATED', entityType: 'ORDER', entityId: order.id,
      metadata: { toStatus: 'DRAFT', version: 1, quantities: { orderedUnits: order.orderedUnits, loadedUnits: null, deliveredUnits: null, receivedUnits: null } } });
    await transitionOrderInTransaction(tx, { actorUserId: scope.actor.id, orderId: order.id, expectedVersion: 1, next: 'CONFIRMED' }, options);
    return orderDetail(tx, scope, await scopedOrder(tx, scope, order.id));
  }, 5);
}
export async function confirmStoreReceipt(db: PrismaClient, userId: string, id: string, input: StoreReceiptInput, options: StoreServiceOptions = {}): Promise<StoreOrderDetail> {
  const parsed = storeReceiptInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_DOMAIN', 'Check the received quantity and explain reported issues in at least five characters.');
  const now = storeNow(options);
  return transaction(db, async tx => {
    const scope = await resolveStoreScope(tx, userId), order = await scopedOrder(tx, scope, id), request = parsed.data, delivery = order.stops[0]?.delivery;
    if (order.version !== request.expectedVersion) throw new DomainError('DOMAIN_CONFLICT', 'The order changed. Reload before confirming receipt.');
    if (delivery?.receipt) throw new DomainError('DOMAIN_CONFLICT', 'A receipt has already been recorded for this delivery.');
    if (!receiptStates.includes(order.status) || !delivery || delivery.outcome === 'FAILED') throw new DomainError('MISSING_RELATED_DATA', 'Receipt confirmation requires a completed successful delivery.');
    const issueType = request.issueType !== 'NONE' ? request.issueType : request.receivedUnits !== delivery.deliveredUnits ? 'QUANTITY_DISCREPANCY' : null;
    if (issueType && (request.issueNote?.length ?? 0) < 5) throw new DomainError('INVALID_DOMAIN', 'Explain the receipt issue in at least five characters.');
    let version = order.version;
    if (order.status !== 'AWAITING_RECEIPT') {
      const awaiting = await transitionOrderInTransaction(tx, { actorUserId: scope.actor.id, orderId: order.id, expectedVersion: version, next: 'AWAITING_RECEIPT' }, options);
      version = awaiting.version;
    }
    const receipt = await tx.receipt.create({ data: { deliveryRecordId: delivery.id, receivedUnits: request.receivedUnits, status: issueType ? 'ISSUE_REPORTED' : 'CONFIRMED',
      issueType, issueNote: request.issueNote || null, confirmedByUserId: scope.actor.id, confirmedAt: now } });
    if (issueType) await tx.exception.create({ data: { orderId: order.id, deliveryRecordId: delivery.id, receiptId: receipt.id,
      type: issueType === 'DAMAGED_GOODS' ? 'DAMAGED_GOODS' : 'RECEIPT_DISCREPANCY', message: request.issueNote!, createdByUserId: scope.actor.id } });
    await transitionOrderInTransaction(tx, { actorUserId: scope.actor.id, orderId: order.id, expectedVersion: version, next: issueType ? 'RECEIPT_ISSUE' : 'RECEIPT_CONFIRMED' }, options);
    return orderDetail(tx, scope, await scopedOrder(tx, scope, order.id));
  });
}
