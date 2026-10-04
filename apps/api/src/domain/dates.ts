import { z } from 'zod';
import { DomainError } from './errors.js';

export const BUSINESS_TIME_ZONE = 'Asia/Colombo';
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number(value.slice(0, 4)) >= 1 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Use a real YYYY-MM-DD business date.');
export function dateOnly(value: string): Date {
  const result = dateSchema.safeParse(value);
  if (!result.success) throw new DomainError('INVALID_DOMAIN', 'Use a real YYYY-MM-DD business date.');
  return new Date(`${result.data}T00:00:00.000Z`);
}
export function businessDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}
export function weekStart(value: string): Date {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date;
}
export function isoWeek(value: string) {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
  const year = date.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  first.setUTCDate(first.getUTCDate() + 3 - (first.getUTCDay() + 6) % 7);
  return { year, week: 1 + Math.round((date.getTime() - first.getTime()) / 604800000) };
}
