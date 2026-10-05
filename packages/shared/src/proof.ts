import { z } from 'zod';

export const PROOF_LIMITS = { maxPhotos: 3, maxSignatures: 1, maxPhotoBytes: 1048576, maxSignatureBytes: 262144,
  maxImageDimension: 4096, maxInputPixels: 16777216, maxPhotoDimension: 1600, maxSignatureWidth: 1600, maxSignatureHeight: 800 } as const;
export const PROOF_ATTACHMENT_KINDS = ['PHOTO', 'SIGNATURE'] as const;
export type ProofAttachmentKind = typeof PROOF_ATTACHMENT_KINDS[number];
const base64 = /^[A-Za-z0-9+/]*={0,2}$/;
export const proofAttachmentInputSchema = z.object({ kind: z.enum(PROOF_ATTACHMENT_KINDS), contentType: z.enum(['image/jpeg', 'image/png']),
  base64: z.string().min(4).max(Math.ceil(PROOF_LIMITS.maxPhotoBytes / 3) * 4).regex(base64, 'Attach a valid PNG or JPEG image.') }).strict().superRefine((input, context) => {
  if (input.base64.length % 4 !== 0) context.addIssue({ code: 'custom', path: ['base64'], message: 'Attach a valid PNG or JPEG image.' });
  const padding = input.base64.endsWith('==') ? 2 : input.base64.endsWith('=') ? 1 : 0;
  const size = input.base64.length * 3 / 4 - padding;
  const limit = input.kind === 'PHOTO' ? PROOF_LIMITS.maxPhotoBytes : PROOF_LIMITS.maxSignatureBytes;
  if (size > limit) context.addIssue({ code: 'custom', path: ['base64'], message: `${input.kind === 'PHOTO' ? 'Photo' : 'Signature'} exceeds its file-size limit.` });
});
export const proofAttachmentsInputSchema = z.array(proofAttachmentInputSchema).max(4).superRefine((attachments, context) => {
  for (const [kind, limit] of [['PHOTO', PROOF_LIMITS.maxPhotos], ['SIGNATURE', PROOF_LIMITS.maxSignatures]] as const) {
    if (attachments.filter(item => item.kind === kind).length > limit) context.addIssue({ code: 'custom', message: `Attach at most ${limit} ${kind === 'PHOTO' ? 'photos' : 'signature'}.` });
  }
});
export type ProofAttachmentInput = z.infer<typeof proofAttachmentInputSchema>;
export interface ProofAttachment {
  id: string; kind: ProofAttachmentKind; contentType: 'image/jpeg' | 'image/png'; byteLength: number; width: number; height: number; url: string;
}
export interface ProofMetadata {
  recipientName: string | null; recipientRole: string | null; hasPhoto: boolean; hasSignature: boolean; binaryAvailable: boolean; attachments?: ProofAttachment[];
}
