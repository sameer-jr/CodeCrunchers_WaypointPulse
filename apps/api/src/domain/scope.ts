import type { Prisma, Role } from '@prisma/client';
import { DomainError } from './errors.js';
import type { DomainActor } from './audit.js';

type Database = Prisma.TransactionClient;
export const RELEASED_TRIP_STATES = ['RELEASED', 'LOADING', 'READY_FOR_DISPATCH', 'IN_TRANSIT', 'COMPLETED'] as const;
export async function resolveActor(db: Database, userId: string): Promise<DomainActor> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, active: true } });
  if (!user?.active) throw new DomainError('DOMAIN_FORBIDDEN', 'An active authenticated account is required.');
  return { id: user.id, role: user.role };
}
export function requireRole(actor: DomainActor, roles: readonly Role[]) {
  if (!roles.includes(actor.role)) throw new DomainError('DOMAIN_FORBIDDEN', 'Your role cannot perform this domain action.');
}
export async function assertDepotScope(db: Database, actor: DomainActor, depotId: string) {
  requireRole(actor, ['DISPATCHER', 'LOADER']);
  if (!await db.userDepot.findUnique({ where: { userId_depotId: { userId: actor.id, depotId } } })) {
    throw new DomainError('DOMAIN_FORBIDDEN', 'This depot is outside your assigned operational scope.');
  }
}
export async function assertOutletScope(db: Database, actor: DomainActor, outletId: string) {
  const outlet = await db.outlet.findUnique({ where: { id: outletId } });
  if (!outlet) throw new DomainError('DOMAIN_NOT_FOUND', 'Outlet not found.');
  if (actor.role === 'STORE_MANAGER') {
    if (!await db.userOutlet.findUnique({ where: { userId_outletId: { userId: actor.id, outletId } } })) {
      throw new DomainError('DOMAIN_FORBIDDEN', 'This outlet is outside your assigned store scope.');
    }
  } else await assertDepotScope(db, actor, outlet.depotId);
  return outlet;
}
export async function assertTripScope(db: Database, actor: DomainActor, tripId: string, mutation = false) {
  const trip = await db.trip.findUnique({ where: { id: tripId }, include: { vehicle: true } });
  if (!trip) throw new DomainError('DOMAIN_NOT_FOUND', 'Trip not found.');
  if (actor.role === 'DRIVER') {
    if (trip.driverUserId !== actor.id || !RELEASED_TRIP_STATES.some(status => status === trip.status)) {
      throw new DomainError('DOMAIN_FORBIDDEN', 'This released trip is not assigned to your driver account.');
    }
  } else {
    await assertDepotScope(db, actor, trip.vehicle.depotId);
    if (actor.role === 'LOADER' && (!RELEASED_TRIP_STATES.some(status => status === trip.status) ||
      (mutation && !['RELEASED', 'LOADING', 'READY_FOR_DISPATCH'].includes(trip.status)))) {
      throw new DomainError('DOMAIN_FORBIDDEN', 'Loading access requires a released trip that has not departed.');
    }
  }
  return trip;
}
export async function assertOrderScope(db: Database, actor: DomainActor, orderId: string, mutation = false) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { outlet: true } });
  if (!order) throw new DomainError('DOMAIN_NOT_FOUND', 'Order not found.');
  if (actor.role === 'STORE_MANAGER' || actor.role === 'DISPATCHER') await assertOutletScope(db, actor, order.outletId);
  else {
    const stop = await db.tripStop.findFirst({ where: { orderId, active: true } });
    if (!stop) throw new DomainError('DOMAIN_FORBIDDEN', 'The order has no released assignment in your scope.');
    await assertTripScope(db, actor, stop.tripId, mutation);
  }
  return order;
}
