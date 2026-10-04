import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser, LoaderTripDetail } from '@waypoint/shared';
import { DomainError } from '../domain/errors.js';
import { listLoaderLoads, markTripReady, readLoaderTrip, recordStopLoad, type LoaderServiceOptions } from './services.js';

export async function loadingMutation(event: string, work: () => Promise<LoaderTripDetail>): Promise<LoaderTripDetail> {
  try {
    const result = await work();
    console.info(JSON.stringify({ event: `loading.${event}.succeeded`, tripId: result.id, version: result.version, status: result.status }));
    return result;
  } catch (error) {
    console.info(JSON.stringify({ event: `loading.${event}.failed`, code: error instanceof DomainError ? error.code : 'INTERNAL_ERROR' }));
    throw error;
  }
}
export function loaderRouter(db: PrismaClient, options: LoaderServiceOptions = {}) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.get('/loads', async (request, response) => { response.json(await listLoaderLoads(db, (response.locals.user as AuthUser).id, request.query, options)); });
  router.get('/trips/:id', async (request, response) => { response.json(await readLoaderTrip(db, (response.locals.user as AuthUser).id, String(request.params.id))); });
  router.post('/stops/:id/load', async (request, response) => { response.json(await loadingMutation('record', () => recordStopLoad(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body))); });
  router.post('/trips/:id/ready', async (request, response) => { response.json(await loadingMutation('ready', () => markTripReady(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body))); });
  return router;
}
