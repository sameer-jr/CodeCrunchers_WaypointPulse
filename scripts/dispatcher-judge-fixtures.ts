import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { DISPATCHER_SYNTHETIC_DATE, installDispatcherFixture } from '../apps/api/src/dispatcher/testing/synthetic.js';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname !== '/waypoint_dispatcher_judge') {
    throw new Error('Synthetic Dispatcher fixtures may only use the local /waypoint_dispatcher_judge database.');
  }
  const db = new PrismaClient();
  try {
    const fixture = await installDispatcherFixture(db);
    console.log(JSON.stringify({ source: 'SYNTHETIC', database: 'waypoint_dispatcher_judge', operationalDate: DISPATCHER_SYNTHETIC_DATE,
      storeOutlet: fixture.fresh.outletRef, dispatcherDepot: fixture.depot.name,
      confirmedOrders: ['SYN-DSP-FRESH-AMBIENT', 'SYN-DSP-FRESH-CHILLED', 'SYN-DSP-FRESH-FROZEN', 'SYN-DSP-STYLE-AMBIENT', 'SYN-DSP-TECH-AMBIENT', 'SYN-DSP-VAN-AMBIENT'],
      repeatedDeferral: 'SYN-DSP-DEFERRED-TWICE', preparedTrip: fixture.plannedTrip.tripRef,
      receiptReady: fixture.ready.orderRef, receiptDiscrepancy: fixture.discrepancy.orderRef, damage: fixture.damage.orderRef,
      fixturePreparation: 'Persisted trips and delivery history were prepared explicitly; no planning engine was invoked.', officialDataImported: false }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Dispatcher judge fixture setup failed.'); process.exitCode = 1; });
