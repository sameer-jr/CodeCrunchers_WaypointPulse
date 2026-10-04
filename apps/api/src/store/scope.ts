import type { Prisma } from '@prisma/client';
import type { StoreOutlet } from '@waypoint/shared';
import { DomainError } from '../domain/errors.js';
import { requireRole, resolveActor } from '../domain/scope.js';

export async function resolveStoreScope(db: Prisma.TransactionClient, userId: string) {
  const actor = await resolveActor(db, userId);
  requireRole(actor, ['STORE_MANAGER']);
  const assignments = await db.userOutlet.findMany({ where: { userId: actor.id }, take: 2,
    include: { outlet: { include: { depot: true } } } });
  if (assignments.length !== 1) throw new DomainError('DOMAIN_FORBIDDEN', 'A single outlet assignment is required. Ask your administrator to assign your store.');
  return { actor, outlet: assignments[0].outlet };
}

export type StoreScope = Awaited<ReturnType<typeof resolveStoreScope>>;
export function outletDto(outlet: StoreScope['outlet']): StoreOutlet {
  return { id: outlet.id, outletRef: outlet.outletRef, brand: outlet.brand, district: outlet.district, depotName: outlet.depot.name,
    dockType: outlet.dockType, accessConstraint: outlet.accessConstraint, source: outlet.source,
    deliveryWindowOpen: outlet.deliveryWindowOpen, deliveryWindowClose: outlet.deliveryWindowClose,
    mallWindowOpen: outlet.mallWindowOpen, mallWindowClose: outlet.mallWindowClose };
}
