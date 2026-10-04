import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '@waypoint/shared';
import { listDispatcherExceptions, listDispatcherOrders, listDispatcherTrips, readDispatcherContext, readDispatcherException,
  readDispatcherOrder, readDispatcherPlanningContext, readDispatcherPulse, readDispatcherTrip, type DispatcherServiceOptions } from './services.js';
import { reviewLoadingShortfall } from '../loader/services.js';
import { loadingMutation } from '../loader/routes.js';

export function dispatcherRouter(db: PrismaClient, options: DispatcherServiceOptions = {}) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.post('/exceptions/:id/review-load', async (request, response) => { response.json(await loadingMutation('review', () => reviewLoadingShortfall(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body))); });
  const queries = { context: readDispatcherContext, pulse: readDispatcherPulse, orders: listDispatcherOrders,
    'planning-context': readDispatcherPlanningContext, trips: listDispatcherTrips, exceptions: listDispatcherExceptions };
  for (const [path, service] of Object.entries(queries)) router.get(`/${path}`, async (request, response) => {
    response.json(await service(db, (response.locals.user as AuthUser).id, request.query, options));
  });
  const details = { orders: readDispatcherOrder, trips: readDispatcherTrip, exceptions: readDispatcherException };
  for (const [path, service] of Object.entries(details)) router.get(`/${path}/:id`, async (request, response) => {
    response.json(await service(db, (response.locals.user as AuthUser).id, String(request.params.id)));
  });
  return router;
}
