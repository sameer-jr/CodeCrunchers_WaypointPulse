import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PROOF_LIMITS, proofAttachmentsInputSchema, type ProofAttachmentInput } from '@waypoint/shared';
import { DomainError } from '../domain/errors.js';

export interface PreparedProofAttachment {
  id: string; kind: 'PHOTO' | 'SIGNATURE'; ordinal: number; contentType: 'image/jpeg' | 'image/png';
  bytes: Uint8Array<ArrayBuffer>; sha256: string; byteLength: number; width: number; height: number;
}
function invalidImage(message = 'Attach a valid PNG or JPEG image within the proof limits.'): never { throw new DomainError('INVALID_DOMAIN', message); }
async function normalizeImage(input: ProofAttachmentInput, ordinal: number): Promise<PreparedProofAttachment> {
  const bytes = Buffer.from(input.base64, 'base64');
  if (bytes.toString('base64') !== input.base64) invalidImage();
  const limit = input.kind === 'PHOTO' ? PROOF_LIMITS.maxPhotoBytes : PROOF_LIMITS.maxSignatureBytes;
  if (!bytes.length || bytes.length > limit) invalidImage();
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (input.contentType === 'image/png' ? !isPng : !isJpeg) invalidImage();
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: PROOF_LIMITS.maxInputPixels });
    const metadata = await image.metadata();
    const expectedFormat = input.contentType === 'image/jpeg' ? 'jpeg' : 'png';
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width > PROOF_LIMITS.maxImageDimension ||
      metadata.height > PROOF_LIMITS.maxImageDimension || (metadata.pages ?? 1) !== 1) invalidImage();
    image.rotate().resize({ width: input.kind === 'PHOTO' ? PROOF_LIMITS.maxPhotoDimension : PROOF_LIMITS.maxSignatureWidth,
      height: input.kind === 'PHOTO' ? PROOF_LIMITS.maxPhotoDimension : PROOF_LIMITS.maxSignatureHeight, fit: 'inside', withoutEnlargement: true });
    const output = await (input.kind === 'PHOTO' ? image.flatten({ background: '#ffffff' }).jpeg({ quality: 82 }) : image.png({ compressionLevel: 9 })).toBuffer({ resolveWithObject: true });
    if (output.data.length > limit) invalidImage('This image remains too large after processing. Choose a smaller photo or signature.');
    return { id: randomUUID(), kind: input.kind, ordinal, contentType: input.kind === 'PHOTO' ? 'image/jpeg' : 'image/png',
      bytes: Uint8Array.from(output.data), sha256: createHash('sha256').update(output.data).digest('hex'), byteLength: output.data.length,
      width: output.info.width, height: output.info.height };
  } catch (error) { if (error instanceof DomainError) throw error; return invalidImage(); }
}
export async function prepareProofAttachments(input: ProofAttachmentInput[] | undefined): Promise<PreparedProofAttachment[]> {
  const parsed = proofAttachmentsInputSchema.safeParse(input ?? []);
  if (!parsed.success) invalidImage('Attach up to three photos and one signature within their file-size limits.');
  const attachments: PreparedProofAttachment[] = [];
  let photoOrdinal = 0;
  for (const item of parsed.data) attachments.push(await normalizeImage(item, item.kind === 'SIGNATURE' ? 3 : photoOrdinal++));
  return attachments;
}
export function proofAttachmentAudit(attachments: PreparedProofAttachment[]) {
  return attachments.map(({ id, kind, contentType, byteLength, width, height, sha256 }) => ({ id, kind, contentType, byteLength, width, height, sha256 }));
}
