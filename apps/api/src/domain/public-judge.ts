import type { PrismaClient } from '@prisma/client';
import { readConfig } from '../config.js';
import { installLoaderFixture } from '../loader/testing/synthetic.js';
import { PUBLIC_JUDGE_DATES } from './public-judge-dates.js';
import { assertPublicJudgeDatabase, preparePublicJudgeReview } from './public-judge-review.js';

export async function installPublicJudgeData(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  if (env.PUBLIC_JUDGE_DEMO !== 'true') return { enabled: false as const };
  readConfig(env);
  await assertPublicJudgeDatabase(db);
  const fixture = await installLoaderFixture(db, { key: 'DRIVER', serviceDate: PUBLIC_JUDGE_DATES.historyDate });
  const reviewOrders = await preparePublicJudgeReview(db, fixture);
  return { enabled: true as const, source: 'SYNTHETIC' as const, serviceDate: fixture.serviceDate,
    depotName: fixture.depot.name, shortfallOrderRef: fixture.shortfallOrder.orderRef, orderedUnits: fixture.shortfallOrder.orderedUnits,
    publicJudge: PUBLIC_JUDGE_DATES, reviewOrders,
    preparation: 'Independent demand and scoped assignments only. Generate, validate and release through Dispatcher; existing operational history is preserved.' };
}
