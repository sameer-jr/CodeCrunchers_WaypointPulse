import { Prisma, type PrismaClient } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { ORDER_STATUSES, dispatcherContextQuerySchema, dispatcherOrdersQuerySchema, dispatcherTripsQuerySchema, dispatcherExceptionsQuerySchema,
  type DispatcherContext, type DispatcherExceptionDetail, type DispatcherExceptionList, type DispatcherFleet, type DispatcherOrderDetail,
  type DispatcherOrderList, type DispatcherPlanningContext, type DispatcherPulse, type DispatcherTripDetail, type DispatcherTripList, type StoreOrderDetail } from '@waypoint/shared';
import { dateOnly } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { dispatcherContext, type DispatcherServiceOptions } from './context.js';
import { deferralDto, exceptionDtos, exceptionInclude, exceptionLinks, orderDto, orderInclude, tripDto, tripInclude, vehicleDto, type OrderRecord } from './dto.js';
import { exceptionDateWhere, orderDateWhere } from './filters.js';
import { exceptionScopeWhere, orderScopeWhere, resolveDispatcherScope, selectedDepotIds, tripScopeWhere, type DispatcherScope } from './scope.js';
import { planningCapabilities } from '../planning/services.js';
import { readShortfallReview } from '../loader/services.js';

export type { DispatcherServiceOptions } from './context.js';
function parse<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_DOMAIN', 'Check the selected date, filters and pagination values.');
  return parsed.data;
}
function id(value: string) {
  if (!z.string().uuid().safeParse(value).success) throw new DomainError('INVALID_DOMAIN', 'Use a valid resource identifier.');
  return value;
}
function read<T>(db: PrismaClient, userId: string, run: (tx: Prisma.TransactionClient, scope: DispatcherScope) => Promise<T>) {
  return db.$transaction(async tx => run(tx, await resolveDispatcherScope(tx, userId)), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
async function fleet(db: Prisma.TransactionClient, depotIds: string[]): Promise<DispatcherFleet> {
  const where = { depotId: { in: depotIds } };
  const [all, reefer, groups] = await Promise.all([
    db.vehicle.aggregate({ where, _count: true, _sum: { weightCapacityKg: true, volumeCapacityM3: true } }),
    db.vehicle.aggregate({ where: { ...where, temperatureCapability: 'REEFER' }, _sum: { weightCapacityKg: true, volumeCapacityM3: true } }),
    db.vehicle.groupBy({ by: ['type', 'temperatureCapability', 'active'], where, _count: true })
  ]);
  const count = (predicate: (row: typeof groups[number]) => boolean) => groups.filter(predicate).reduce((total, row) => total + row._count, 0);
  return { total: all._count, activeMasterRecords: count(row => row.active), trucks: count(row => row.type === 'TRUCK'), vans: count(row => row.type === 'VAN'),
    reefer: count(row => row.temperatureCapability === 'REEFER'), ambient: count(row => row.temperatureCapability === 'AMBIENT'),
    weightCapacityKg: all._sum.weightCapacityKg?.toString() ?? '0', volumeCapacityM3: all._sum.volumeCapacityM3?.toString() ?? '0',
    reeferWeightCapacityKg: reefer._sum.weightCapacityKg?.toString() ?? '0', reeferVolumeCapacityM3: reefer._sum.volumeCapacityM3?.toString() ?? '0', operationalAvailability: 'UNKNOWN' };
}
function deliveryDto(delivery: OrderRecord['stops'][number]['delivery']): StoreOrderDetail['delivery'] {
  if (!delivery) return null;
  return { id: delivery.id, outcome: delivery.outcome, driverNote: delivery.driverNote, arrivedAt: delivery.arrivedAt.toISOString(), completedAt: delivery.completedAt.toISOString(),
    proof: delivery.proof ? { recipientName: delivery.proof.recipientName, recipientRole: delivery.proof.recipientRole, hasPhoto: !!delivery.proof.photoStorageKey, hasSignature: !!delivery.proof.signatureStorageKey, binaryAvailable: false } : null };
}
function receiptDto(receipt: NonNullable<OrderRecord['stops'][number]['delivery']>['receipt']): StoreOrderDetail['receipt'] {
  return receipt ? { id: receipt.id, status: receipt.status, receivedUnits: receipt.receivedUnits, issueType: receipt.issueType, issueNote: receipt.issueNote, confirmedAt: receipt.confirmedAt.toISOString() } : null;
}
async function orderDetail(db: Prisma.TransactionClient, scope: DispatcherScope, order: OrderRecord): Promise<DispatcherOrderDetail> {
  const [audits, deferrals, issues] = await Promise.all([
    db.auditEvent.findMany({ where: { entityType: 'ORDER', entityId: order.id }, select: { id: true, eventType: true, timestamp: true, metadata: true } }),
    db.deferralRecord.findMany({ where: { orderId: order.id }, orderBy: { deferredAt: 'desc' } }),
    db.exception.findMany({ where: { AND: [exceptionScopeWhere(scope.depotIds), { OR: [{ orderId: order.id }, { loadRecord: { is: { tripStop: { orderId: order.id } } } },
      { deliveryRecord: { is: { tripStop: { orderId: order.id } } } }, { receipt: { is: { deliveryRecord: { tripStop: { orderId: order.id } } } } }] }] }, include: exceptionInclude, orderBy: { createdAt: 'desc' } })
  ]);
  const version = (metadata: Prisma.JsonValue) => typeof metadata === 'object' && metadata && 'version' in metadata && typeof metadata.version === 'number' ? metadata.version : 0;
  audits.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || version(a.metadata) - version(b.metadata) || a.id.localeCompare(b.id));
  const delivery = order.stops[0]?.delivery ?? null;
  return { ...orderDto(order), timeline: audits.map(row => {
    const metadata = row.metadata as Record<string, unknown>;
    const status = typeof metadata.toStatus === 'string' && ORDER_STATUSES.some(value => value === metadata.toStatus) ? metadata.toStatus as OrderRecord['status'] : null;
    return { id: row.id, eventType: row.eventType, timestamp: row.timestamp.toISOString(), status };
  }), deferrals: deferrals.map(deferralDto), delivery: deliveryDto(delivery), receipt: receiptDto(delivery?.receipt ?? null), issues: await exceptionDtos(db, issues) };
}
export async function readDispatcherContext(db: PrismaClient, userId: string, query: unknown = {}, options: DispatcherServiceOptions = {}): Promise<DispatcherContext> {
  const filters = parse(dispatcherContextQuerySchema, query);
  return read(db, userId, (tx, scope) => dispatcherContext(tx, scope, filters.date, options));
}
export async function listDispatcherOrders(db: PrismaClient, userId: string, query: unknown = {}, options: DispatcherServiceOptions = {}): Promise<DispatcherOrderList> {
  const normalized = typeof query === 'object' && query && 'previouslyDeferred' in query && typeof query.previouslyDeferred === 'boolean' ? { ...query, previouslyDeferred: String(query.previouslyDeferred) } : query;
  const filters = parse(dispatcherOrdersQuerySchema, normalized);
  return read(db, userId, async (tx, scope) => {
    const depotIds = selectedDepotIds(scope, filters.depotId), context = await dispatcherContext(tx, scope, filters.date, options);
    const where: Prisma.OrderWhereInput = { AND: [orderScopeWhere(depotIds), orderDateWhere(context.selectedDate, filters.dateBasis),
      { ...(filters.status ? { status: filters.status } : {}), ...(filters.temperatureRequirement ? { temperatureRequirement: filters.temperatureRequirement } : {}),
        ...(filters.previouslyDeferred === undefined ? {} : { deferrals: filters.previouslyDeferred ? { some: {} } : { none: {} } }),
        outlet: { ...(filters.brand ? { brand: filters.brand } : {}), ...(filters.district ? { district: filters.district } : {}) },
        ...(filters.search ? { OR: [{ orderRef: { contains: filters.search, mode: 'insensitive' } }, { outlet: { outletRef: { contains: filters.search, mode: 'insensitive' } } }] } : {}) }] };
    const [orders, total] = await Promise.all([tx.order.findMany({ where, include: orderInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (filters.page - 1) * filters.limit, take: filters.limit }), tx.order.count({ where })]);
    return { context, dateBasis: filters.dateBasis, orders: orders.map(orderDto), total, page: filters.page, limit: filters.limit };
  });
}
export async function readDispatcherOrder(db: PrismaClient, userId: string, orderId: string): Promise<DispatcherOrderDetail> {
  id(orderId);
  return read(db, userId, async (tx, scope) => {
    const order = await tx.order.findFirst({ where: { id: orderId, ...orderScopeWhere(scope.depotIds) }, include: orderInclude });
    if (!order) throw new DomainError('DOMAIN_NOT_FOUND', 'Order not found.');
    return orderDetail(tx, scope, order);
  });
}
export async function listDispatcherTrips(db: PrismaClient, userId: string, query: unknown = {}, options: DispatcherServiceOptions = {}): Promise<DispatcherTripList> {
  const filters = parse(dispatcherTripsQuerySchema, query);
  return read(db, userId, async (tx, scope) => {
    const context = await dispatcherContext(tx, scope, filters.date, options), depotIds = selectedDepotIds(scope, filters.depotId);
    const where: Prisma.TripWhereInput = { ...tripScopeWhere(depotIds), serviceDate: dateOnly(context.selectedDate), ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { OR: [{ tripRef: { contains: filters.search, mode: 'insensitive' } }, { vehicle: { vehicleRef: { contains: filters.search, mode: 'insensitive' } } }] } : {}) };
    const [trips, total] = await Promise.all([tx.trip.findMany({ where, include: tripInclude, orderBy: [{ plannedDeparture: 'asc' }, { tripRef: 'asc' }], skip: (filters.page - 1) * filters.limit, take: filters.limit }), tx.trip.count({ where })]);
    return { context, trips: trips.map(tripDto), total, page: filters.page, limit: filters.limit };
  });
}
export async function readDispatcherTrip(db: PrismaClient, userId: string, tripId: string): Promise<DispatcherTripDetail> {
  id(tripId);
  return read(db, userId, async (tx, scope) => {
    const trip = await tx.trip.findFirst({ where: { id: tripId, ...tripScopeWhere(scope.depotIds) }, include: tripInclude });
    if (!trip) throw new DomainError('DOMAIN_NOT_FOUND', 'Trip not found.');
    return { ...tripDto(trip), stops: trip.stops.map(stop => ({ id: stop.id, sequence: stop.sequence, active: stop.active, status: stop.status,
      plannedArrival: stop.plannedArrival?.toISOString() ?? null, actualArrival: stop.actualArrival?.toISOString() ?? null, order: orderDto(stop.order) })) };
  });
}
function exceptionSearch(search?: string): Prisma.ExceptionWhereInput {
  if (!search) return {};
  const orderRef = { contains: search, mode: 'insensitive' as const };
  return { OR: [{ message: { contains: search, mode: 'insensitive' } }, { order: { is: { orderRef } } },
    { receipt: { is: { deliveryRecord: { tripStop: { order: { orderRef } } } } } }, { deliveryRecord: { is: { tripStop: { order: { orderRef } } } } },
    { loadRecord: { is: { tripStop: { order: { orderRef } } } } }, { trip: { is: { tripRef: { contains: search, mode: 'insensitive' } } } }] };
}
export async function listDispatcherExceptions(db: PrismaClient, userId: string, query: unknown = {}, options: DispatcherServiceOptions = {}): Promise<DispatcherExceptionList> {
  const filters = parse(dispatcherExceptionsQuerySchema, query);
  return read(db, userId, async (tx, scope) => {
    const context = await dispatcherContext(tx, scope, filters.date, options), depotIds = selectedDepotIds(scope, filters.depotId);
    const where: Prisma.ExceptionWhereInput = { AND: [exceptionScopeWhere(depotIds), exceptionDateWhere(context.selectedDate), exceptionSearch(filters.search)],
      ...(filters.status ? { status: filters.status } : {}), ...(filters.type ? { type: filters.type } : {}) };
    const [rows, total] = await Promise.all([tx.exception.findMany({ where, include: exceptionInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (filters.page - 1) * filters.limit, take: filters.limit }), tx.exception.count({ where })]);
    return { context, exceptions: await exceptionDtos(tx, rows), total, page: filters.page, limit: filters.limit };
  });
}
export async function readDispatcherException(db: PrismaClient, userId: string, exceptionId: string): Promise<DispatcherExceptionDetail> {
  id(exceptionId);
  return read(db, userId, async (tx, scope) => {
    const row = await tx.exception.findFirst({ where: { id: exceptionId, ...exceptionScopeWhere(scope.depotIds) }, include: exceptionInclude });
    if (!row) throw new DomainError('DOMAIN_NOT_FOUND', 'Exception not found.');
    const link = exceptionLinks(row), order = link.order ? await tx.order.findFirst({ where: { id: link.order.id, ...orderScopeWhere(scope.depotIds) }, include: orderInclude }) : null;
    const deliveryId = row.deliveryRecordId ?? row.receipt?.deliveryRecordId;
    const delivery = deliveryId ? await tx.deliveryRecord.findUnique({ where: { id: deliveryId }, include: { proof: true, receipt: true } }) : null;
    return { ...(await exceptionDtos(tx, [row]))[0], orderDetail: order ? await orderDetail(tx, scope, order) : null, delivery: deliveryDto(delivery), receipt: receiptDto(delivery?.receipt ?? null), loadingShortfall: await readShortfallReview(tx, row.id) };
  });
}
export async function readDispatcherPulse(db: PrismaClient, userId: string, query: unknown = {}, options: DispatcherServiceOptions = {}): Promise<DispatcherPulse> {
  const filters = parse(dispatcherContextQuerySchema, query);
  return read(db, userId, async (tx, scope) => {
    const context = await dispatcherContext(tx, scope, filters.date, options);
    const orderWhere: Prisma.OrderWhereInput = { AND: [orderScopeWhere(scope.depotIds), orderDateWhere(context.selectedDate)] };
    const tripWhere: Prisma.TripWhereInput = { ...tripScopeWhere(scope.depotIds), serviceDate: dateOnly(context.selectedDate) };
    const exceptionWhere: Prisma.ExceptionWhereInput = { AND: [exceptionScopeWhere(scope.depotIds), exceptionDateWhere(context.selectedDate)], status: { in: ['OPEN', 'UNDER_REVIEW'] } };
    const [groups, activeTrips, openExceptions, master, orders, trips, attention] = await Promise.all([
      tx.order.groupBy({ by: ['status'], where: orderWhere, _count: true }),
      tx.trip.count({ where: { ...tripWhere, status: { in: ['PLANNED', 'RELEASED', 'LOADING', 'READY_FOR_DISPATCH', 'IN_TRANSIT'] } } }),
      tx.exception.count({ where: exceptionWhere }), fleet(tx, scope.depotIds),
      tx.order.findMany({ where: orderWhere, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 12 }),
      tx.trip.findMany({ where: tripWhere, include: tripInclude, orderBy: { tripRef: 'asc' }, take: 8 }),
      tx.exception.findMany({ where: exceptionWhere, include: exceptionInclude, orderBy: { createdAt: 'desc' }, take: 10 })
    ]);
    const count = (statuses: OrderRecord['status'][]) => groups.filter(row => statuses.includes(row.status)).reduce((sum, row) => sum + row._count, 0);
    return { context, metrics: { totalOrders: groups.reduce((sum, row) => sum + row._count, 0), awaitingPlanning: count(['CONFIRMED', 'CLOSED_FOR_PLANNING']), planned: count(['PLANNED']),
      deferred: count(['DEFERRED']), loadingReady: count(['RELEASED_TO_LOADING', 'LOADING', 'LOADING_EXCEPTION', 'READY_FOR_DISPATCH']), inTransit: count(['IN_TRANSIT', 'ARRIVED']),
      delivered: count(['DELIVERED', 'PARTIALLY_DELIVERED', 'AWAITING_RECEIPT', 'RECEIPT_CONFIRMED', 'RECEIPT_ISSUE']), receiptIssues: count(['RECEIPT_ISSUE']), openExceptions, activeTrips },
      fleet: master, orders: orders.map(orderDto), trips: trips.map(tripDto), attention: await exceptionDtos(tx, attention) };
  });
}
export async function readDispatcherPlanningContext(db: PrismaClient, userId: string, query: unknown = {}, options: DispatcherServiceOptions = {}): Promise<DispatcherPlanningContext> {
  const filters = parse(dispatcherContextQuerySchema, query);
  return read(db, userId, async (tx, scope) => {
    const context = await dispatcherContext(tx, scope, filters.date, options), selectedDate = dateOnly(context.selectedDate);
    const calendarEligibility = context.calendar ? context.calendar.operatingDay ? 'OPERATING_CALENDAR' as const : 'NON_OPERATING' as const : 'UNKNOWN' as const;
    const base: Prisma.OrderWhereInput = { ...orderScopeWhere(scope.depotIds), stops: { none: { active: true } },
      OR: [{ eligibleDeliveryDate: { lte: selectedDate } }, { eligibleDeliveryDate: null, requestedDeliveryDate: { lte: selectedDate } }] };
    const eligible: Prisma.OrderWhereInput = { ...base, status: { in: ['CONFIRMED', 'CLOSED_FOR_PLANNING'] },
      ...(calendarEligibility === 'OPERATING_CALENDAR' ? {} : { id: { in: [] } }) };
    const deferred: Prisma.OrderWhereInput = { ...base, status: 'DEFERRED' };
    const [orders, deferredOrders, vehicles, trips, aggregate, deferredCount, temperatures, vanOnly, mallDock, master, travel, outletKeys] = await Promise.all([
      tx.order.findMany({ where: eligible, include: orderInclude, orderBy: [{ requestedDeliveryDate: 'asc' }, { createdAt: 'asc' }], take: 100 }),
      tx.order.findMany({ where: deferred, include: orderInclude, orderBy: { updatedAt: 'desc' }, take: 100 }),
      tx.vehicle.findMany({ where: { depotId: { in: scope.depotIds } }, include: { depot: true }, orderBy: { vehicleRef: 'asc' }, take: 200 }),
      tx.trip.findMany({ where: { ...tripScopeWhere(scope.depotIds), serviceDate: selectedDate }, include: tripInclude, orderBy: { tripRef: 'asc' }, take: 50 }),
      tx.order.aggregate({ where: eligible, _count: true, _sum: { orderedUnits: true, orderedWeightKg: true, orderedVolumeM3: true } }),
      tx.order.count({ where: deferred }), tx.order.groupBy({ by: ['temperatureRequirement'], where: eligible, _count: true }),
      tx.order.count({ where: { AND: [eligible, { outlet: { accessConstraint: 'VAN_ONLY' } }] } }),
      tx.order.count({ where: { AND: [eligible, { outlet: { accessConstraint: 'MALL_DOCK' } }] } }), fleet(tx, scope.depotIds),
      tx.districtTravel.findMany({ where: { depotId: { in: scope.depotIds } }, orderBy: [{ depotId: 'asc' }, { district: 'asc' }] }),
      tx.outlet.groupBy({ by: ['brand', 'dockType'], where: { depotId: { in: scope.depotIds } } })
    ]);
    const allowances = outletKeys.length ? await tx.serviceAllowance.findMany({ where: { OR: outletKeys.map(row => ({ brand: row.brand, dockType: row.dockType })) } }) : [];
    const count = (requirement: OrderRecord['temperatureRequirement']) => temperatures.find(row => row.temperatureRequirement === requirement)?._count ?? 0;
    const capabilities = await planningCapabilities(tx, scope, context.selectedDate, options);
    return { context, orders: orders.map(orderDto), deferredOrders: deferredOrders.map(orderDto), vehicles: vehicles.map(vehicleDto), fleet: master, trips: trips.map(tripDto),
      totals: { awaitingPlanningCount: aggregate._count, deferredCount, orderedUnits: aggregate._sum.orderedUnits ?? 0, orderedWeightKg: aggregate._sum.orderedWeightKg?.toString() ?? '0', orderedVolumeM3: aggregate._sum.orderedVolumeM3?.toString() ?? '0',
        ambient: count('AMBIENT'), chilled: count('CHILLED'), frozen: count('FROZEN'), vanOnly, mallDock },
      travel: travel.map(row => ({ depotId: row.depotId, district: row.district, roadClass: row.roadClass, depotDistanceKm: row.depotDistanceKm.toString(), depotMinutes: row.depotMinutes.toString(), interStopKm: row.interStopKm.toString(), interStopMinutes: row.interStopMinutes.toString(), source: row.source })),
      serviceAllowances: allowances.map(row => ({ brand: row.brand, dockType: row.dockType, serviceMinutes: row.serviceMinutes.toString(), source: row.source })),
      ...capabilities, calendarEligibility, limits: { orders: 100, deferredOrders: 100, vehicles: 200, trips: 50 } };
  });
}
