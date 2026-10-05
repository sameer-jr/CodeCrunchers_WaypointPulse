import type { Prisma } from '@prisma/client';
import type { ProofAttachment, ProofMetadata } from '@waypoint/shared';

export const proofAttachmentMetadataSelect = { id: true, kind: true, contentType: true, byteLength: true, width: true, height: true, ordinal: true } satisfies Prisma.DeliveryAttachmentSelect;
export const deliveryProofInclude = { attachments: { select: proofAttachmentMetadataSelect, orderBy: { ordinal: 'asc' } } } satisfies Prisma.DeliveryProofInclude;
type ProofRecord = Prisma.DeliveryProofGetPayload<{ include: typeof deliveryProofInclude }>;
export function deliveryProofDto(proof: ProofRecord | null): ProofMetadata | null {
  if (!proof) return null;
  const attachments: ProofAttachment[] = proof.attachments.map(row => ({ id: row.id, kind: row.kind as ProofAttachment['kind'],
    contentType: row.contentType as ProofAttachment['contentType'], byteLength: row.byteLength, width: row.width, height: row.height,
    url: `/api/proof/attachments/${row.id}` }));
  return { recipientName: proof.recipientName, recipientRole: proof.recipientRole,
    hasPhoto: attachments.some(item => item.kind === 'PHOTO') || !!proof.photoStorageKey,
    hasSignature: attachments.some(item => item.kind === 'SIGNATURE') || !!proof.signatureStorageKey,
    binaryAvailable: attachments.length > 0, attachments };
}
