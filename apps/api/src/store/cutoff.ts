import type { Prisma } from '@prisma/client';
import type { StoreContext, StoreTemperature } from '@waypoint/shared';
import { BUSINESS_TIME_ZONE, businessDate, dateOnly } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { outletDto, type StoreScope } from './scope.js';
import { syntheticReferencesPermitted } from '../domain/synthetic-mode.js';

export type StoreServiceOptions = { now?: () => Date; allowSyntheticReferences?: boolean };
export function storeNow(options: StoreServiceOptions): Date {
  if (options.allowSyntheticReferences && !syntheticReferencesPermitted()) throw new DomainError('INVALID_DOMAIN', 'Synthetic Store references require an explicitly enabled starter or public judge mode in production.');
  const now = options.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new DomainError('INVALID_DOMAIN', 'A valid server clock is required.');
  return now;
}
function cutoffClock(now: Date) {
  const today = businessDate(now), tomorrow = dateOnly(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const cutoffAt = new Date(`${today}T16:00:00+05:30`);
  return { today, tomorrow: tomorrow.toISOString().slice(0, 10), cutoffAt, cutoffPassed: now >= cutoffAt };
}
function referenceSource(options: StoreServiceOptions) {
  return options.allowSyntheticReferences ? {} : { source: 'OFFICIAL' as const };
}
async function nextOperatingDate(db: Prisma.TransactionClient, after: string, options: StoreServiceOptions) {
  return db.calendarDay.findFirst({ where: { date: { gt: dateOnly(after) }, operatingDay: true, ...referenceSource(options) }, orderBy: { date: 'asc' } });
}
export async function determineStoreEligibility(db: Prisma.TransactionClient, requested: string, now: Date, options: StoreServiceOptions) {
  const requestedDate = dateOnly(requested), clock = cutoffClock(now);
  if (requested <= clock.today) throw new DomainError('INVALID_DOMAIN', 'Choose a future requested delivery date. Today and past dates are closed.');
  const day = await db.calendarDay.findUnique({ where: { date: requestedDate } });
  if (!day || !day.operatingDay) throw new DomainError('INVALID_DOMAIN', 'Choose an operating date from the imported delivery calendar.');
  if (day.source !== 'OFFICIAL' && !options.allowSyntheticReferences) throw new DomainError('INVALID_DOMAIN', 'Official calendar data is required for delivery eligibility.');
  if (requested !== clock.tomorrow || !clock.cutoffPassed) return requestedDate;
  const next = await nextOperatingDate(db, requested, options);
  if (!next) throw new DomainError('MISSING_RELATED_DATA', 'The next-day cutoff has passed, and no later operating date is available in the imported calendar.');
  return next.date;
}
export async function storeContext(db: Prisma.TransactionClient, scope: StoreScope, options: StoreServiceOptions = {}): Promise<StoreContext> {
  const now = storeNow(options), clock = cutoffClock(now);
  const days = await db.calendarDay.findMany({ where: { date: { gt: dateOnly(clock.today) }, operatingDay: true, ...referenceSource(options) }, orderBy: { date: 'asc' }, take: 45 });
  const tomorrow = days.find(day => day.date.toISOString().slice(0, 10) === clock.tomorrow);
  const next = !clock.cutoffPassed && tomorrow ? tomorrow : days.find(day => day.date > dateOnly(clock.tomorrow));
  const temperatureRequirements: StoreTemperature[] = scope.outlet.brand === 'FRESH' ? ['AMBIENT', 'CHILLED', 'FROZEN'] : ['AMBIENT'];
  const operationalContext = { FRESH: 'Daily delivery requests, with ambient, chilled or frozen requirements.',
    STYLE: 'Weekly operational context. Orders remain ambient and use imported operating dates.',
    TECH: 'As-needed delivery requests. Orders remain ambient.' }[scope.outlet.brand];
  return { outlet: outletDto(scope.outlet), serverNow: now.toISOString(), today: clock.today, timezone: BUSINESS_TIME_ZONE,
    cutoffAt: clock.cutoffAt.toISOString(), cutoffPassed: clock.cutoffPassed, nextEligibleDate: next?.date.toISOString().slice(0, 10) ?? null,
    operatingDates: days.map(day => day.date.toISOString().slice(0, 10)), temperatureRequirements, operationalContext };
}
