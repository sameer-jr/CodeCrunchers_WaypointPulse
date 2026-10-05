import { describe, expect, it } from 'vitest';
import { PROOF_LIMITS, proofAttachmentInputSchema, proofAttachmentsInputSchema } from './proof.js';

function encodedBytes(length: number) {
  const remainder = length % 3;
  return 'AAAA'.repeat(Math.floor(length / 3)) + (remainder === 1 ? 'AA==' : remainder === 2 ? 'AAA=' : '');
}
describe('Proof attachment transport limits', () => {
  it('accepts the full bounded photo and signature payload without recursive regex failure', () => {
    expect(proofAttachmentInputSchema.safeParse({ kind: 'PHOTO', contentType: 'image/jpeg', base64: encodedBytes(PROOF_LIMITS.maxPhotoBytes) }).success).toBe(true);
    expect(proofAttachmentInputSchema.safeParse({ kind: 'SIGNATURE', contentType: 'image/png', base64: encodedBytes(PROOF_LIMITS.maxSignatureBytes) }).success).toBe(true);
  });
  it('rejects a decoded byte above each separate transport limit', () => {
    for (const [kind, limit] of [['PHOTO', PROOF_LIMITS.maxPhotoBytes], ['SIGNATURE', PROOF_LIMITS.maxSignatureBytes]] as const) {
      expect(proofAttachmentInputSchema.safeParse({ kind, contentType: 'image/png', base64: encodedBytes(limit + 1) }).success).toBe(false);
    }
  });
  it('rejects malformed padding, embedded padding, data URLs and invalid symbols', () => {
    for (const base64 of ['AAAAA', 'AAA', 'AA=A', 'AA===', 'AA!!', 'data:image/png;base64,AAAA', 'AA==\n']) {
      expect(proofAttachmentInputSchema.safeParse({ kind: 'PHOTO', contentType: 'image/png', base64 }).success).toBe(false);
    }
  });
  it('accepts three photos and one signature and rejects extra evidence of either kind', () => {
    const photo = { kind: 'PHOTO', contentType: 'image/png', base64: 'AAAA' } as const;
    const signature = { ...photo, kind: 'SIGNATURE' } as const;
    expect(proofAttachmentsInputSchema.safeParse([photo, signature, photo, photo]).success).toBe(true);
    expect(proofAttachmentsInputSchema.safeParse([photo, photo, photo, photo]).success).toBe(false);
    expect(proofAttachmentsInputSchema.safeParse([signature, signature]).success).toBe(false);
  });
});
