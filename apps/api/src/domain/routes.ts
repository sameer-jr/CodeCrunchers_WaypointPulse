import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '@waypoint/shared';
import { z } from 'zod';
import { DomainError } from './errors.js';
import { readOrder, readOutlet, readTrip } from './reads.js';

export function domainReadRouter(prisma: PrismaClient) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  const readers = { outlets: readOutlet, orders: readOrder, trips: readTrip };
  for (const [resource, read] of Object.entries(readers)) {
    router.get(`/${resource}/:id`, async (request, response) => {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) throw new DomainError('INVALID_DOMAIN', 'Use a valid resource identifier.');
      const user = response.locals.user as AuthUser;
      response.json({ data: await read(prisma, user.id, id.data) });
    });
  }
  return router;
}
