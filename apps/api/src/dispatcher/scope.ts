import type { Prisma } from '@prisma/client';
import { DomainError } from '../domain/errors.js';
import { requireRole, resolveActor } from '../domain/scope.js';

export async function resolveDispatcherScope(db: Prisma.TransactionClient, userId: string) {
  const actor = await resolveActor(db, userId);
  requireRole(actor, ['DISPATCHER']);
  const assignments = await db.userDepot.findMany({ where: { userId: actor.id }, include: { depot: true }, orderBy: { depot: { name: 'asc' } } });
  if (!assignments.length) throw new DomainError('DOMAIN_FORBIDDEN', 'A depot assignment is required. Ask your administrator to assign your operational scope.');
  return { actor, depots: assignments.map(row => ({ id: row.depot.id, name: row.depot.name })), depotIds: assignments.map(row => row.depotId) };
}
export type DispatcherScope = Awaited<ReturnType<typeof resolveDispatcherScope>>;
export function selectedDepotIds(scope: DispatcherScope, depotId?: string) {
  if (depotId && !scope.depotIds.includes(depotId)) throw new DomainError('DOMAIN_FORBIDDEN', 'This depot is outside your assigned operational scope.');
  return depotId ? [depotId] : scope.depotIds;
}
export function orderScopeWhere(depotIds: string[]): Prisma.OrderWhereInput {
  return { outlet: { depotId: { in: depotIds } }, stops: { none: { active: true, OR: [
    { trip: { vehicle: { depotId: { notIn: depotIds } } } },
    { trip: { stops: { some: { order: { outlet: { depotId: { notIn: depotIds } } } } } } }
  ] } } };
}
export function tripScopeWhere(depotIds: string[]): Prisma.TripWhereInput {
  return { vehicle: { depotId: { in: depotIds } }, stops: { none: { order: { outlet: { depotId: { notIn: depotIds } } } } } };
}
export function exceptionScopeWhere(depotIds: string[]): Prisma.ExceptionWhereInput {
  const order = { is: orderScopeWhere(depotIds) }, trip = { is: tripScopeWhere(depotIds) };
  const stop = { trip: tripScopeWhere(depotIds), order: orderScopeWhere(depotIds) };
  const loadRecord = { is: { tripStop: stop } };
  const deliveryRecord = { is: { tripStop: stop } };
  const receipt = { is: { deliveryRecord: { tripStop: stop } } };
  return { AND: [{ OR: [{ orderId: null }, { order }] }, { OR: [{ tripId: null }, { trip }] },
    { OR: [{ loadRecordId: null }, { loadRecord }] }, { OR: [{ deliveryRecordId: null }, { deliveryRecord }] }, { OR: [{ receiptId: null }, { receipt }] }],
    OR: [{ order }, { trip }, { loadRecord }, { deliveryRecord }, { receipt }] };
}
