import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '@waypoint/shared';
import { readProofAttachment } from './services.js';

export function proofRouter(db: PrismaClient) {
  const router = Router();
  router.get('/attachments/:id', async (request, response) => {
    const attachment = await readProofAttachment(db, (response.locals.user as AuthUser).id, String(request.params.id));
    response.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': attachment.contentType,
      'Content-Length': String(attachment.byteLength),
      'Content-Disposition': `inline; filename="delivery-${attachment.kind.toLowerCase()}-${attachment.id}.${attachment.contentType === 'image/jpeg' ? 'jpg' : 'png'}"` });
    response.send(Buffer.from(attachment.bytes));
  });
  return router;
}
