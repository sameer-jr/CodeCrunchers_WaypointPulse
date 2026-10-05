import { z } from 'zod';
import { AuditEntityType, AuditEventType, DeferralReason, OrderStatus, Prisma, ReferenceSource, type Role } from '@prisma/client';

export const auditMetadataSchema = z.object({
  fromStatus: z.nativeEnum(OrderStatus).optional(), toStatus: z.nativeEnum(OrderStatus).optional(),
  version: z.number().int().positive().optional(), reasonCode: z.nativeEnum(DeferralReason).optional(),
  source: z.nativeEnum(ReferenceSource).optional(),
  strategyVersion: z.string().max(80).optional(),
  planningCounts: z.object({ eligible: z.number().int().nonnegative(), served: z.number().int().nonnegative(), deferred: z.number().int().nonnegative(), trips: z.number().int().nonnegative() }).strict().optional(),
  validationValid: z.boolean().optional(),
  driver: z.object({ tripId: z.string().uuid(), stopId: z.string().uuid().optional(), driverUserId: z.string().uuid().optional(),
    outcome: z.enum(['DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED']).optional(), reasonCode: z.string().max(40).nullable().optional(),
    eventAt: z.string().datetime().optional(), completedAt: z.string().datetime().optional(),
    operationId: z.string().uuid().optional(), clientEventAt: z.string().datetime().optional(), operationCreatedAt: z.string().datetime().optional() }).strict().optional(),
  loading: z.object({ revision: z.number().int().positive(), previousLoadedUnits: z.number().int().nonnegative().nullable(),
    expectedUnits: z.number().int().positive(), loadedUnits: z.number().int().positive(), reasonCode: z.enum(['STOCK_UNAVAILABLE', 'DAMAGED_BEFORE_LOADING', 'COUNT_MISMATCH', 'OTHER']).nullable(),
    note: z.string().max(450).nullable(), reviewDecision: z.enum(['APPROVE', 'REJECT']).optional(), exceptionId: z.string().uuid().optional() }).strict().optional(),
  location: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
    label: z.string().max(120).nullable(), previousLatitude: z.number().finite().min(-90).max(90).nullable(),
    previousLongitude: z.number().finite().min(-180).max(180).nullable(), previousLabel: z.string().max(120).nullable(), reason: z.string().min(5).max(450) }).strict().optional(),
  quantities: z.object({ orderedUnits: z.number().int().positive(), loadedUnits: z.number().int().nonnegative().nullable(),
    deliveredUnits: z.number().int().nonnegative().nullable(), receivedUnits: z.number().int().nonnegative().nullable() }).strict().optional(),
  counts: z.record(z.enum(['outlets', 'vehicles', 'calendar', 'travel', 'allowances']), z.number().int().nonnegative()).optional(),
  proofAttachments: z.array(z.object({ id: z.string().uuid(), kind: z.enum(['PHOTO', 'SIGNATURE']), contentType: z.enum(['image/jpeg', 'image/png']),
    byteLength: z.number().int().positive().max(1048576), width: z.number().int().positive().max(1600), height: z.number().int().positive().max(1600),
    sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(4).optional()
}).strict();
export type DomainActor = { id: string; role: Role };
export async function appendAudit(tx: Prisma.TransactionClient, input: {
  actor: DomainActor | null; eventType: AuditEventType; entityType: AuditEntityType; entityId: string;
  metadata: z.input<typeof auditMetadataSchema>;
}) {
  const metadata = auditMetadataSchema.parse(input.metadata);
  return tx.auditEvent.create({ data: { actorUserId: input.actor?.id, actorRole: input.actor?.role,
    eventType: input.eventType, entityType: input.entityType, entityId: input.entityId, metadata: metadata as Prisma.InputJsonObject } });
}
