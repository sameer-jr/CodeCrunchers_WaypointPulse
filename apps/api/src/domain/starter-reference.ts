import { Prisma, type PrismaClient } from '@prisma/client';
import { readConfig } from '../config.js';
import { installPlanningReferences } from '../planning/testing/synthetic.js';
import { businessDate, dateOnly, isoWeek, weekStart } from './dates.js';
import { PUBLIC_JUDGE_DATES } from './public-judge-dates.js';
import { assertPublicJudgeDatabase, type JudgeFixture } from './public-judge-review.js';

export const STARTER_CALENDAR_DAYS = 90;

export async function prepareStarterReferences(tx: Prisma.TransactionClient, fixture: JudgeFixture, now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error('Starter references require a valid current clock.');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waypoint-public-judge-review-v1'))`;
  await assertPublicJudgeDatabase(tx);
  const dates = Array.from({ length: STARTER_CALENDAR_DAYS + 1 }, (_, offset) => {
    const day = dateOnly(businessDate(now)); day.setUTCDate(day.getUTCDate() + offset); return day.toISOString().slice(0, 10);
  });
  for (const serviceDate of dates) {
    const date = dateOnly(serviceDate), weekday = (date.getUTCDay() + 6) % 7, iso = isoWeek(serviceDate);
    await tx.calendarDay.upsert({ where: { date }, update: {}, create: { date, dayOfWeek: weekday,
      dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday], weekend: weekday === 6,
      isoYear: iso.year, isoWeek: iso.week, operatingDay: true, payday: false, festivalRamp: 0, holiday: false, monsoon: false, source: 'SYNTHETIC' } });
  }
  const weeks = [...new Set(dates.map(date => weekStart(date).toISOString().slice(0, 10)))];
  for (const vehicleRef of ['SYN-PLAN-DRIVER-AMBIENT', 'SYN-PLAN-DRIVER-REEFER']) {
    const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { vehicleRef } });
    if (vehicle.source !== 'SYNTHETIC' || vehicle.depotId !== fixture.depot.id) throw new Error('Starter availability requires the existing synthetic vehicles.');
    for (const serviceDate of dates) await tx.vehicleAvailability.upsert({ where: { vehicleId_serviceDate: { vehicleId: vehicle.id, serviceDate: dateOnly(serviceDate) } }, update: {},
      create: { vehicleId: vehicle.id, serviceDate: dateOnly(serviceDate), status: 'AVAILABLE', availableFromMinute: 300, availableUntilMinute: 1080,
        source: 'SYNTHETIC', note: 'Safe starter availability from 05:00 to 18:00; existing operational changes are preserved.', createdByUserId: fixture.dispatcher.id } });
    for (const week of weeks) await tx.fuelLedger.upsert({ where: { vehicleId_weekStart: { vehicleId: vehicle.id, weekStart: dateOnly(week) } }, update: {},
      create: { vehicleId: vehicle.id, weekStart: dateOnly(week), openingConsumedLitres: '0', openingSource: 'SYNTHETIC' } });
  }
  return { currentDate: dates[0], preparedThrough: dates.at(-1)!, source: 'SYNTHETIC' as const };
}

export async function installStarterReferenceData(db: PrismaClient, env: NodeJS.ProcessEnv = process.env, now = new Date()) {
  if (env.STARTER_REFERENCE_DATA !== 'true') return { enabled: false as const };
  readConfig(env);
  await assertPublicJudgeDatabase(db);
  const fixture = await installPlanningReferences(db, { key: 'DRIVER', serviceDate: PUBLIC_JUDGE_DATES.historyDate });
  const prepared = await db.$transaction(tx => prepareStarterReferences(tx, fixture, now), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
  return { enabled: true as const, ...prepared, seededOrders: 0, seededTransactions: 0 };
}
