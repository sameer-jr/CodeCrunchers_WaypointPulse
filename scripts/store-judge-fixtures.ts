import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { businessDate } from '../apps/api/src/domain/dates.js';
import { addBusinessDays, installStoreFixture, prepareStoreScenario } from '../apps/api/src/store/testing/synthetic.js';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname !== '/waypoint_store_judge') {
    throw new Error('Synthetic judge fixtures may only use the local /waypoint_store_judge database.');
  }
  const db = new PrismaClient();
  try {
    const today = businessDate(new Date());
    const fixture = await installStoreFixture(db, addBusinessDays(today, -1));
    const scenarios = [
      { orderRef: 'SYN-JUDGE-CLEAN', scenario: 'AWAITING_RECEIPT' as const },
      { orderRef: 'SYN-JUDGE-DISCREPANCY', scenario: 'AWAITING_RECEIPT' as const, loadedUnits: 69, deliveredUnits: 66 },
      { orderRef: 'SYN-JUDGE-DAMAGE', scenario: 'AWAITING_RECEIPT' as const },
      { orderRef: 'SYN-JUDGE-DEFERRED', scenario: 'DEFERRED' as const },
      { orderRef: 'SYN-JUDGE-PLANNED', scenario: 'PLANNED' as const }
    ];
    for (const scenario of scenarios) {
      if (!await db.order.findUnique({ where: { orderRef: scenario.orderRef } })) {
        await prepareStoreScenario(db, fixture, { ...scenario, requestedDate: today });
      }
    }
    console.log(JSON.stringify({ fixtureSource: 'SYNTHETIC', database: 'waypoint_store_judge', assignment: 'SYN-STORE-FRESH', scenarios: scenarios.map(row => row.orderRef), officialDataImported: false }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Judge fixture setup failed.'); process.exitCode = 1; });
