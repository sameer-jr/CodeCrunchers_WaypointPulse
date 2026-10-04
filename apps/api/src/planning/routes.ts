import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser, PlanningRunDetail } from '@waypoint/shared';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { generatePlanningRun, listPlanningRuns, readPlanningRun, releasePlanningRun, validatePlanningRun, type PlanningServiceOptions } from './services.js';

async function planningMutation(action: 'generate' | 'validate' | 'release', runId: unknown, work: () => Promise<PlanningRunDetail>) {
  const parsed = z.string().uuid().safeParse(runId), safeRunId = parsed.success ? parsed.data : undefined;
  if (action === 'generate') console.info(JSON.stringify({ event: 'planning.generation.started' }));
  try {
    const result = await work(), valid = action !== 'validate' || result.validation?.valid === true;
    console.info(JSON.stringify({ event: `planning.${action}.${valid ? 'succeeded' : 'failed'}`, runId: result.id,
      ...(action === 'generate' ? { counts: { eligible: result.summary.eligibleOrders, served: result.summary.served, deferred: result.summary.deferred, trips: result.summary.trips }, durationMs: result.summary.generationDurationMs } : {}),
      ...(action === 'validate' ? { issueCount: result.validation?.issues.length ?? 0 } : {}) }));
    return result;
  } catch (error) {
    console.info(JSON.stringify({ event: `planning.${action}.failed`, ...(safeRunId ? { runId: safeRunId } : {}), code: error instanceof DomainError ? error.code : 'INTERNAL_ERROR' }));
    throw error;
  }
}

export function planningRouter(db: PrismaClient, options: PlanningServiceOptions = {}) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.get('/', async (request, response) => { response.json(await listPlanningRuns(db, (response.locals.user as AuthUser).id, request.query, options)); });
  router.post('/', async (request, response) => { response.status(201).json(await planningMutation('generate', null, () => generatePlanningRun(db, (response.locals.user as AuthUser).id, request.body, options))); });
  router.get('/:id', async (request, response) => { response.json(await readPlanningRun(db, (response.locals.user as AuthUser).id, String(request.params.id), options)); });
  router.post('/:id/validate', async (request, response) => { response.json(await planningMutation('validate', request.params.id, () => validatePlanningRun(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body, options))); });
  router.post('/:id/release', async (request, response) => { response.json(await planningMutation('release', request.params.id, () => releasePlanningRun(db, (response.locals.user as AuthUser).id, String(request.params.id), request.body, options))); });
  return router;
}
