import { proofAttachmentsInputSchema, type ProofAttachmentInput } from '@waypoint/shared';
import type { LocalDriverOperation } from '../offline/model';

export function pendingProofAttachments(operations: LocalDriverOperation[], tripId: string, stopId: string): ProofAttachmentInput[] {
  const operation = operations.find(item => item.tripId === tripId && item.entityId === stopId && item.action === 'COMPLETE_DELIVERY' && item.syncStatus !== 'SYNCED');
  const attachments = operation?.payload.attachments;
  const parsed = proofAttachmentsInputSchema.safeParse(attachments);
  return parsed.success ? parsed.data : [];
}
