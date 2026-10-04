import { z } from 'zod';
import type { DispatcherDepot, DispatcherVehicle, DispatcherTripSummary } from './dispatcher.js';
import type { StoreOutlet, ORDER_STATUSES, TEMPERATURE_REQUIREMENTS } from './store.js';

export const LOADING_SHORTFALL_REASONS = ['STOCK_UNAVAILABLE', 'DAMAGED_BEFORE_LOADING', 'COUNT_MISMATCH', 'OTHER'] as const;
export type LoadingShortfallReason = typeof LOADING_SHORTFALL_REASONS[number];
const version = z.number().int().positive();
const note = z.string().trim().min(1).max(450);
export const loaderLoadsQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number(value.slice(0, 4)) > 0 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a real YYYY-MM-DD date.').optional() }).strict();
export const recordStopLoadSchema = z.object({ expectedTripVersion: version, expectedOrderVersion: version,
  expectedStopUpdatedAt: z.string().datetime(), expectedLoadRevision: z.number().int().nonnegative(),
  loadedUnits: z.number().int().positive().max(2147483647), reasonCode: z.enum(LOADING_SHORTFALL_REASONS).optional(), note: note.optional()
}).strict().refine(input => input.reasonCode !== 'OTHER' || (input.note?.length ?? 0) >= 5, { message: 'Explain the OTHER reason in at least five characters.', path: ['note'] });
export const readyTripSchema = z.object({ expectedTripVersion: version }).strict();
export const reviewLoadingShortfallSchema = z.object({ expectedTripVersion: version, expectedOrderVersion: version,
  expectedLoadRevision: version, decision: z.enum(['APPROVE', 'REJECT']), note: note.optional() }).strict();
export type RecordStopLoadInput = z.infer<typeof recordStopLoadSchema>;
export type ReadyTripInput = z.infer<typeof readyTripSchema>;
export type ReviewLoadingShortfallInput = z.infer<typeof reviewLoadingShortfallSchema>;
export type LoaderLoadState = 'NOT_STARTED' | 'LOADING' | 'COMPLETE' | 'AWAITING_APPROVAL' | 'APPROVED_REVISION' | 'CORRECTION_REQUIRED' | 'READY_FOR_DISPATCH';
export interface LoaderLoadRecord {
  id: string; expectedUnits: number; loadedUnits: number | null; status: 'PENDING' | 'LOADING' | 'COMPLETE' | 'EXCEPTION';
  revision: number; reviewStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'; reasonCode: LoadingShortfallReason | null; note: string | null;
  recordedByUserId: string | null; recordedAt: string | null; reviewedByUserId: string | null; reviewedAt: string | null;
}
export interface LoaderTripSummary {
  id: string; tripRef: string; version: number; serviceDate: string; status: DispatcherTripSummary['status']; tripNumber: number;
  planningRunId: string; vehicle: DispatcherVehicle; plannedDeparture: string | null; stopCount: number; orderedUnits: number; expectedUnits: number;
  loadedUnits: number; orderedWeightKg: string; orderedVolumeM3: string; temperatureRequirements: typeof TEMPERATURE_REQUIREMENTS[number][];
  completedStops: number; pendingStops: number; shortfallStops: number; loadingState: LoaderLoadState;
  canMarkReady: boolean; readinessBlockers: string[];
}
export interface LoaderStop {
  id: string; sequence: number; updatedAt: string; status: string; plannedArrival: string | null;
  order: { id: string; orderRef: string; version: number; status: typeof ORDER_STATUSES[number]; orderedUnits: number;
    orderedWeightKg: string; orderedVolumeM3: string; temperatureRequirement: typeof TEMPERATURE_REQUIREMENTS[number]; outlet: StoreOutlet };
  load: LoaderLoadRecord | null; loadingState: LoaderLoadState; canRecord: boolean;
  exceptions: { id: string; type: string; status: string; message: string; createdAt: string; resolvedAt: string | null }[];
}
export interface LoaderTripDetail extends LoaderTripSummary { stops: LoaderStop[] }
export interface LoaderLoadList { selectedDate: string; availableDates: string[]; depots: DispatcherDepot[]; trips: LoaderTripSummary[] }
export interface LoaderShortfallReview {
  tripId: string; tripVersion: number; tripStopId: string; stopSequence: number; orderId: string; orderVersion: number; orderRef: string;
  orderedUnits: number; expectedUnits: number; loadedUnits: number | null; loadRecordId: string; loadRevision: number;
  reviewStatus: LoaderLoadRecord['reviewStatus']; reasonCode: LoadingShortfallReason | null; note: string | null;
  recordedAt: string | null; reviewedAt: string | null; reviewedByUserId: string | null; canReview: boolean;
}
