import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ORDER_STATUSES, storeOrderInputSchema, storeReceiptInputSchema, type AuthUser } from '@waypoint/shared';
import { DomainError } from '../domain/errors.js';
import { dateSchema } from '../domain/dates.js';
import { validateBody } from '../http.js';
import { confirmStoreReceipt, createStoreOrder, listStoreOrders, readStoreContext, readStoreHome, readStoreOrder, type StoreServiceOptions } from './services.js';

const filtersSchema = z.object({ status: z.enum(ORDER_STATUSES).optional(), date: dateSchema.optional() }).strict();
function orderId(value: unknown) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new DomainError('INVALID_DOMAIN', 'Use a valid order identifier.');
  return parsed.data;
}
export function storeRouter(prisma: PrismaClient, options: StoreServiceOptions = {}) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.get('/context', async (_request, response) => response.json(await readStoreContext(prisma, (response.locals.user as AuthUser).id, options)));
  router.get('/home', async (_request, response) => response.json(await readStoreHome(prisma, (response.locals.user as AuthUser).id, options)));
  router.get('/orders', async (request, response) => {
    const parsed = filtersSchema.safeParse(request.query);
    if (!parsed.success) throw new DomainError('INVALID_DOMAIN', 'Choose valid status and requested-date filters.');
    response.json(await listStoreOrders(prisma, (response.locals.user as AuthUser).id, parsed.data));
  });
  router.get('/orders/:id', async (request, response) => response.json(await readStoreOrder(prisma, (response.locals.user as AuthUser).id, orderId(request.params.id))));
  router.post('/orders', validateBody(storeOrderInputSchema), async (request, response) => response.status(201).json(await createStoreOrder(prisma, (response.locals.user as AuthUser).id, request.body, options)));
  router.post('/orders/:id/receipt', validateBody(storeReceiptInputSchema), async (request, response) => response.status(201).json(await confirmStoreReceipt(prisma, (response.locals.user as AuthUser).id, orderId(request.params.id), request.body, options)));
  return router;
}
