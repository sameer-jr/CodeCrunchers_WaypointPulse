import { z } from 'zod';
import type { DispatcherDepot, DispatcherOrderSummary, DispatcherTripSummary } from './dispatcher.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number(value.slice(0, 4)) >= 1 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a real service date.');
export const planningGenerateInputSchema = z.object({ serviceDate: date, depotId: z.string().uuid(), expectedRunId: z.string().uuid().nullable().optional(), expectedVersion: z.number().int().positive().optional() }).strict().superRefine((value, ctx) => {
  if (value.expectedRunId && !value.expectedVersion) ctx.addIssue({ code: 'custom', path: ['expectedVersion'], message: 'Use the current run version to regenerate.' });
  if (!value.expectedRunId && value.expectedVersion) ctx.addIssue({ code: 'custom', path: ['expectedRunId'], message: 'Use the current run identifier with its version.' });
});
export const planningActionInputSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const planningListQuerySchema = z.object({ date: date, depotId: z.string().uuid(), page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export type PlanningGenerateInput = z.infer<typeof planningGenerateInputSchema>;
export type PlanningActionInput = z.infer<typeof planningActionInputSchema>;
export type PlanningRunStatus = 'DRAFT' | 'VALIDATED' | 'RELEASED' | 'SUPERSEDED';
export type PlanningConstraintCode = 'DEPOT' | 'VEHICLE_AVAILABLE' | 'TEMPERATURE' | 'ACCESS' | 'WEIGHT_CAPACITY' | 'VOLUME_CAPACITY' | 'TRIP_LIMIT' | 'DELIVERY_WINDOW' | 'MALL_WINDOW' | 'FRESH_DEADLINE' | 'OPERATING_DAY' | 'FUEL_QUOTA' | 'FUEL_UNKNOWN' | 'TIME_FEASIBILITY' | 'REFERENCE_DATA';
export interface PlanningConstraintCheck { code: PlanningConstraintCode; passed: boolean; severity: 'BLOCKING'; reason: string; actual: string; required: string }
export interface PlanningValidationIssue { code: PlanningConstraintCode | 'DUPLICATE_ORDER' | 'COVERAGE' | 'SEQUENCE' | 'STALE_ORDER' | 'ASSIGNMENT' | 'TIMING'; message: string; orderId: string | null; tripKey: string | null }
export interface PlanningValidation { valid: boolean; issues: PlanningValidationIssue[]; checkedAt: string }
export interface PlanningSummary { eligibleOrders: number; served: number; deferred: number; trips: number; orderedWeightKg: string; orderedVolumeM3: string; generationDurationMs: number }
export interface PlanningRunSummary {
  id: string; planningRef: string; serviceDate: string; depot: DispatcherDepot; status: PlanningRunStatus; version: number; revision: number;
  strategyVersion: string; generatedAt: string; validatedAt: string | null; releasedAt: string | null; supersededAt: string | null;
  summary: PlanningSummary; validation: PlanningValidation | null; stale: boolean; canValidate: boolean; canRelease: boolean; canRegenerate: boolean;
}
export interface PlanningDecisionDetail {
  id: string; order: DispatcherOrderSummary; decision: 'ASSIGNED' | 'DEFERRED'; tripId: string | null; reasonCode: string | null; reason: string;
  checks: PlanningConstraintCheck[]; alternatives: { vehicleId: string; vehicleRef: string; tripNumber: number; checks: PlanningConstraintCheck[] }[];
  priority: { previousDeferrals: number; compatibleVehicles: number; windowMinutes: number; eligibleDate: string; createdAt: string };
  nextEligibleDate: string | null;
}
export interface PlanningTripDetail extends DispatcherTripSummary {
  estimatedFuelLitres: string; capacity: { weight: { used: string; capacity: string; remaining: string; percentage: number }; volume: { used: string; capacity: string; remaining: string; percentage: number } };
  stops: { id: string; orderId: string; orderRef: string; outletRef: string; sequence: number; active: boolean; plannedArrival: string;
    plannedServiceStart: string; plannedServiceComplete: string; plannedWaitingMinutes: string; plannedServiceMinutes: string }[];
}
export interface PlanningVehicleContext {
  id: string; vehicleRef: string; active: boolean; availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  availableFromMinute: number | null; availableUntilMinute: number | null; availabilitySource: 'OFFICIAL' | 'SYNTHETIC' | null;
  fuelKnown: boolean; remainingFuelLitres: string | null;
}
export interface PlanningRunDetail extends PlanningRunSummary { decisions: PlanningDecisionDetail[]; trips: PlanningTripDetail[]; vehicles: PlanningVehicleContext[] }
export interface PlanningRunList { runs: PlanningRunSummary[]; latestActiveId: string | null; total: number; page: number; limit: number }
