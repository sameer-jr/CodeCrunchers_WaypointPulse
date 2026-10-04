import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '@waypoint/shared';
import { completeDriverStop, finishDriverTrip, listDriverRoutes, readDriverTrip, recordDriverArrival, startDriverTrip, syncDriverOperations, type DriverServiceOptions } from './services.js';

export function driverRouter(db: PrismaClient, options: DriverServiceOptions = {}) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.get('/routes', async (request, response) => { response.json(await listDriverRoutes(db, (response.locals.user as AuthUser).id, request.query, options)); });
  router.get('/trips/:id', async (request, response) => { response.json(await readDriverTrip(db, (response.locals.user as AuthUser).id, String(request.params.id))); });
  router.post('/trips/:id/start', async (request, response) => { response.json(await startDriverTrip(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body, options)); });
  router.post('/stops/:id/arrival', async (request, response) => { response.json(await recordDriverArrival(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body, options)); });
  router.post('/stops/:id/complete', async (request, response) => { response.json(await completeDriverStop(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body, options)); });
  router.post('/trips/:id/finish', async (request, response) => { response.json(await finishDriverTrip(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body, options)); });
  router.post('/sync', async (request, response) => { response.json(await syncDriverOperations(db, (response.locals.user as AuthUser).id, request.body, options)); });
  return router;
}
