import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { spawn } from 'node:child_process';
import { businessDate, dateOnly, isoWeek } from '../apps/api/src/domain/dates.js';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || url.hostname !== '127.0.0.1' || url.pathname !== '/waypoint') {
    throw new Error('Synthetic Store demo setup only manages the local development /waypoint database.');
  }
  const db = new PrismaClient();
  try {
    const today = businessDate(new Date());
    const outlet = await db.$transaction(async tx => {
      const depot = await tx.depot.upsert({ where: { name: 'SYNTHETIC Store Demo Depot' }, update: {}, create: { name: 'SYNTHETIC Store Demo Depot' } });
      const outlet = await tx.outlet.upsert({ where: { outletRef: 'SYN-DEMO-FRESH' }, update: {}, create: {
        outletRef: 'SYN-DEMO-FRESH', brand: 'FRESH', district: 'SYNTHETIC Demo District', depotId: depot.id,
        dockType: 'STREET', accessConstraint: 'NORMAL', deliveryWindowOpen: 360, deliveryWindowClose: 420, source: 'SYNTHETIC'
      } });
      for (let index = 0; index < 60; index++) {
        const date = dateOnly(today); date.setUTCDate(date.getUTCDate() + index);
        const text = date.toISOString().slice(0, 10), dow = (date.getUTCDay() + 6) % 7, iso = isoWeek(text);
        await tx.calendarDay.upsert({ where: { date }, update: {}, create: { date, operatingDay: dow !== 6,
          dayOfWeek: dow, dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow]!, weekend: dow === 6,
          isoYear: iso.year, isoWeek: iso.week, payday: false, festivalRamp: 0, holiday: false, monsoon: false, source: 'SYNTHETIC' } });
      }
      return outlet;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    await new Promise<void>((done, reject) => {
      const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/assign-store.ts', '--outlet-id', outlet.id, '--replace'], { stdio: 'inherit', windowsHide: true });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? done() : reject(new Error('Store demo assignment failed.')));
    });
    console.log(JSON.stringify({ fixtureSource: 'SYNTHETIC', outlet: outlet.outletRef, calendar: '60 explicit demo dates; Sundays non-operating', beginning: today, officialRowsOverwritten: false, ordersOrPlansCreated: false }));
    console.log('Set STORE_ALLOW_SYNTHETIC=true only in local development and restart the API to use this labelled demo. Production rejects this option.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Synthetic Store setup failed.'); process.exitCode = 1; });
