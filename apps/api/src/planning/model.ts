import type { AccessConstraint, Brand, DockType, OrderStatus, TemperatureCapability, TemperatureRequirement, VehicleType } from '@prisma/client';

export const STRATEGY_VERSION = 'deterministic-depot-v1';
export const MAX_DAILY_TRIPS = 2;
export const FRESH_DEADLINE_MINUTE = 480;
export type ConstraintCode = 'DEPOT' | 'VEHICLE_AVAILABLE' | 'TEMPERATURE' | 'ACCESS' | 'WEIGHT_CAPACITY' | 'VOLUME_CAPACITY' | 'TRIP_LIMIT' | 'DELIVERY_WINDOW' | 'MALL_WINDOW' | 'FRESH_DEADLINE' | 'OPERATING_DAY' | 'FUEL_QUOTA' | 'FUEL_UNKNOWN' | 'TIME_FEASIBILITY' | 'REFERENCE_DATA';
export type ConstraintCheck = { code: ConstraintCode; passed: boolean; severity: 'BLOCKING'; reason: string; actual: string; required: string };
export type PlanningOrder = {
  id: string; orderRef: string; version: number; status: OrderStatus; requestedDate: string; eligibleDate: string; createdAt: string;
  temperature: TemperatureRequirement; units: number; weightKg: string; volumeM3: string; deferralCount: number; nextEligibleDate: string | null;
  outlet: { id: string; outletRef: string; depotId: string; district: string; brand: Brand; dockType: DockType; access: AccessConstraint;
    windowOpen: number; windowClose: number; mallOpen: number | null; mallClose: number | null };
};
export type PlanningVehicle = {
  id: string; vehicleRef: string; depotId: string; active: boolean; type: VehicleType; temperature: TemperatureCapability;
  weightCapacityKg: string; volumeCapacityM3: string; kmPerLitre: string;
  availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN'; availableFromMinute: number | null; availableUntilMinute: number | null;
  fuelKnown: boolean; remainingFuelLitres: string | null;
};
export type PlanningTravel = { depotId: string; district: string; depotKm: string; depotMinutes: string; interStopKm: string; interStopMinutes: string };
export type PlanningAllowance = { brand: Brand; dockType: DockType; minutes: string };
export type ExistingPlanningTrip = { id: string; vehicleId: string; tripNumber: number; departureMinute: number | null; returnMinute: number | null; status: string };
export type PlanningInput = { serviceDate: string; depotId: string; operatingDay: boolean; orders: PlanningOrder[]; vehicles: PlanningVehicle[];
  travel: PlanningTravel[]; allowances: PlanningAllowance[]; existingTrips: ExistingPlanningTrip[] };
export type PlannedStop = { orderId: string; sequence: number; arrivalMinute: number; serviceStartMinute: number; serviceCompleteMinute: number;
  waitingMinutes: number; serviceMinutes: number };
export type PlannedTrip = { key: string; vehicleId: string; tripNumber: number; departureMinute: number; returnMinute: number;
  distanceKm: string; fuelLitres: string; weightKg: string; volumeM3: string; stops: PlannedStop[] };
export type CandidateRejection = { vehicleId: string; vehicleRef: string; tripNumber: number; checks: ConstraintCheck[] };
export type PlanningDecision = { orderId: string; orderRef: string; orderVersion: number; decision: 'ASSIGNED' | 'DEFERRED'; tripKey: string | null;
  reasonCode: string | null; reason: string; checks: ConstraintCheck[]; alternatives: CandidateRejection[];
  priority: { previousDeferrals: number; compatibleVehicles: number; windowMinutes: number; eligibleDate: string; createdAt: string } };
export type GeneratedPlan = { strategyVersion: string; trips: PlannedTrip[]; decisions: PlanningDecision[] };
export type ValidationIssue = { code: ConstraintCode | 'DUPLICATE_ORDER' | 'COVERAGE' | 'SEQUENCE' | 'STALE_ORDER' | 'ASSIGNMENT' | 'TIMING';
  message: string; orderId: string | null; tripKey: string | null };
export type PlanValidation = { valid: boolean; issues: ValidationIssue[] };
export type CandidateEvaluation = { trip: PlannedTrip; checks: ConstraintCheck[]; incrementalFuelLitres: string; capabilityWaste: number };
