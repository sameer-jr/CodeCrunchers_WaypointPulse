import type { Prisma } from '@prisma/client';
import type { DispatcherContext } from '@waypoint/shared';
import { BUSINESS_TIME_ZONE, businessDate, dateSchema, dateOnly } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { orderScopeWhere, tripScopeWhere, type DispatcherScope } from './scope.js';

export type DispatcherServiceOptions = { now?: () => Date; demoDate?: string; allowSyntheticReferences?: boolean };
export async function dispatcherContext(db: Prisma.TransactionClient, scope: DispatcherScope, selectedDate?: string, options: DispatcherServiceOptions = {}): Promise<DispatcherContext> {
  if (selectedDate && !dateSchema.safeParse(selectedDate).success) throw new DomainError('INVALID_DOMAIN', 'Use a valid selected operational date.');
  if (options.demoDate && !dateSchema.safeParse(options.demoDate).success) throw new DomainError('INVALID_DOMAIN', 'The configured Dispatcher demo date is invalid.');
  const [orderDates, tripDates, districts, awaiting] = await Promise.all([
    db.order.findMany({ where: orderScopeWhere(scope.depotIds), distinct: ['eligibleDeliveryDate', 'requestedDeliveryDate'], select: { eligibleDeliveryDate: true, requestedDeliveryDate: true }, orderBy: { requestedDeliveryDate: 'desc' }, take: 60 }),
    db.trip.findMany({ where: tripScopeWhere(scope.depotIds), distinct: ['serviceDate'], select: { serviceDate: true }, orderBy: { serviceDate: 'desc' }, take: 60 }),
    db.outlet.findMany({ where: { depotId: { in: scope.depotIds } }, distinct: ['district'], select: { district: true }, orderBy: { district: 'asc' } }),
    db.order.findFirst({ where: { ...orderScopeWhere(scope.depotIds), status: { in: ['CONFIRMED', 'CLOSED_FOR_PLANNING'] }, stops: { none: { active: true } } }, select: { eligibleDeliveryDate: true, requestedDeliveryDate: true }, orderBy: [{ eligibleDeliveryDate: 'asc' }, { requestedDeliveryDate: 'asc' }] })
  ]);
  const availableDates = [...new Set([...orderDates.map(row => (row.eligibleDeliveryDate ?? row.requestedDeliveryDate).toISOString().slice(0, 10)), ...tripDates.map(row => row.serviceDate.toISOString().slice(0, 10))])].sort();
  const persisted = awaiting ? (awaiting.eligibleDeliveryDate ?? awaiting.requestedDeliveryDate).toISOString().slice(0, 10) : availableDates.at(-1);
  const now = options.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new DomainError('INVALID_DOMAIN', 'A valid server clock is required.');
  const date = selectedDate ?? options.demoDate ?? persisted ?? businessDate(now);
  const calendar = await db.calendarDay.findUnique({ where: { date: dateOnly(date) }, select: { operatingDay: true, source: true } });
  return { selectedDate: date, dateSource: selectedDate ? 'REQUEST' : options.demoDate ? 'CONFIGURED_DEMO' : persisted ? 'PERSISTED' : 'CURRENT_DATE', timezone: BUSINESS_TIME_ZONE,
    calendar: calendar ? { date, ...calendar } : null, depots: scope.depots, availableDates, districts: districts.map(row => row.district) };
}
