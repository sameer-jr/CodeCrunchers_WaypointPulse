import type { PrismaClient } from '@prisma/client';
import { readConfig } from '../config.js';
import { installPlanningReferences } from '../planning/testing/synthetic.js';
import { PUBLIC_JUDGE_DATES } from './public-judge-dates.js';
import { assertPublicJudgeDatabase, preparePublicJudgeReview } from './public-judge-review.js';

export async function installPublicJudgeData(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  if (env.PUBLIC_JUDGE_DEMO !== 'true') return { enabled: false as const };
  readConfig(env);
  await assertPublicJudgeDatabase(db);
  const fixture = await installPlanningReferences(db, { key: 'DRIVER', serviceDate: PUBLIC_JUDGE_DATES.historyDate });
  const reviewOrders = await preparePublicJudgeReview(db, fixture);
  return { enabled: true as const, source: 'SYNTHETIC' as const, serviceDate: PUBLIC_JUDGE_DATES.executionDate,
    depotName: fixture.depot.name, primaryOrderRef: 'DEMO-REVIEW-AMBIENT-192', orderedUnits: 192,
    publicJudge: PUBLIC_JUDGE_DATES, reviewOrders,
    preparation: 'Independent demand and scoped assignments only. Generate, validate and release through Dispatcher; existing operational history is preserved.' };
}
