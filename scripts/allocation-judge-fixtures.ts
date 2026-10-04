import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PLANNING_SYNTHETIC_DATE, installPlanningFixture } from '../apps/api/src/planning/testing/synthetic.js';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname !== '/waypoint_allocation_judge') {
    throw new Error('Allocation fixtures may only use the local /waypoint_allocation_judge database.');
  }
  const db = new PrismaClient();
  try {
    const fixture = await installPlanningFixture(db);
    console.log(JSON.stringify({ source: 'SYNTHETIC', database: 'waypoint_allocation_judge', operationalDate: PLANNING_SYNTHETIC_DATE,
      dispatcherDepot: fixture.depot.name, storeOutlet: fixture.storeOutlet.outletRef,
      preparation: 'Independent demand, day-specific availability, fuel opening/usage, calendar and travel/service references only. No allocator output was imported.',
      officialDataImported: false, repeatedSetup: 'Existing plans, releases, deferrals and Store-created orders are retained.' }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Allocation fixture setup failed.'); process.exitCode = 1; });
