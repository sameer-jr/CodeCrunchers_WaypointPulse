import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '@waypoint/shared';
import { readTripLocation, recordOutletLocation, recordTripPosition, type LocationServiceOptions } from './services.js';

export function locationRouter(db: PrismaClient, options: LocationServiceOptions = {}) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.get('/trips/:id', async (request, response) => { response.json(await readTripLocation(db, (response.locals.user as AuthUser).id, String(request.params.id), options)); });
  router.put('/outlets/:id', async (request, response) => { response.json(await recordOutletLocation(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body, options)); });
  router.post('/trips/:id/position', async (request, response) => { response.json(await recordTripPosition(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body, options)); });
  return router;
}
