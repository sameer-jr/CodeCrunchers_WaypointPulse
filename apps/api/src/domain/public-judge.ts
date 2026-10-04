import type { PrismaClient } from '@prisma/client';
import { readConfig } from '../config.js';
import { installLoaderFixture } from '../loader/testing/synthetic.js';

export async function installPublicJudgeData(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  if (env.PUBLIC_JUDGE_DEMO !== 'true') return { enabled: false as const };
  readConfig(env);
  const officialCounts = await Promise.all([
    db.referenceImport.count({ where: { source: 'OFFICIAL' } }), db.outlet.count({ where: { source: 'OFFICIAL' } }),
    db.vehicle.count({ where: { source: 'OFFICIAL' } }), db.calendarDay.count({ where: { source: 'OFFICIAL' } }),
    db.districtTravel.count({ where: { source: 'OFFICIAL' } }), db.serviceAllowance.count({ where: { source: 'OFFICIAL' } }),
    db.vehicleAvailability.count({ where: { source: 'OFFICIAL' } }), db.fuelLedger.count({ where: { openingSource: 'OFFICIAL' } }),
    db.fuelUsage.count({ where: { source: 'OFFICIAL' } })
  ]);
  if (officialCounts.some(count => count > 0)) throw new Error('Public judge installation requires a separate database without official reference data.');
  const fixture = await installLoaderFixture(db, { key: 'DRIVER', serviceDate: '2040-03-05' });
  return { enabled: true as const, source: 'SYNTHETIC' as const, serviceDate: fixture.serviceDate,
    depotName: fixture.depot.name, shortfallOrderRef: fixture.shortfallOrder.orderRef, orderedUnits: fixture.shortfallOrder.orderedUnits,
    preparation: 'Independent demand and scoped assignments only. Generate, validate and release through Dispatcher; existing operational history is preserved.' };
}
