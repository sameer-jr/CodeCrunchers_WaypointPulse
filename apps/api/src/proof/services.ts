import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { assertOrderScope, assertTripScope, requireRole, resolveActor } from '../domain/scope.js';
import { scopedDriverTrip } from '../driver/scope.js';
import { resolveStoreScope } from '../store/scope.js';

export async function readProofAttachment(db: PrismaClient, userId: string, attachmentId: string) {
  if (!z.string().uuid().safeParse(attachmentId).success) throw new DomainError('INVALID_DOMAIN', 'Use a valid attachment identifier.');
  return db.$transaction(async tx => {
    const actor = await resolveActor(tx, userId); requireRole(actor, ['DRIVER', 'DISPATCHER', 'STORE_MANAGER']);
    const reference = await tx.deliveryAttachment.findUnique({ where: { id: attachmentId }, select: {
      proof: { select: { deliveryRecord: { select: { tripStop: { select: { id: true, tripId: true, orderId: true, order: { select: { outletId: true } } } } } } } }
    } });
    if (!reference) throw new DomainError('DOMAIN_NOT_FOUND', 'Delivery attachment not found.');
    const stop = reference.proof.deliveryRecord.tripStop;
    if (actor.role === 'DRIVER') {
      const trip = await scopedDriverTrip(tx, actor, stop.tripId);
      if (!trip.stops.some(row => row.id === stop.id)) throw new DomainError('DOMAIN_FORBIDDEN', 'This proof is outside your assigned active stops.');
    } else if (actor.role === 'STORE_MANAGER') {
      const scope = await resolveStoreScope(tx, actor.id);
      if (scope.outlet.id !== stop.order.outletId) throw new DomainError('DOMAIN_NOT_FOUND', 'Delivery attachment not found.');
    } else { await assertOrderScope(tx, actor, stop.orderId); await assertTripScope(tx, actor, stop.tripId); }
    return tx.deliveryAttachment.findUniqueOrThrow({ where: { id: attachmentId }, select: { id: true, kind: true, contentType: true, byteLength: true, bytes: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
