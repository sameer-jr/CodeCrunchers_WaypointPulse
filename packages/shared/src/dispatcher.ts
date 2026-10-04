import { z } from 'zod';
import { ORDER_STATUSES, TEMPERATURE_REQUIREMENTS, type StoreOrderDetail, type StoreOrderSummary, type StoreOutlet } from './store.js';
import type { LoaderShortfallReview } from './loader.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number(value.slice(0, 4)) >= 1 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a real YYYY-MM-DD date.');
export const DISPATCHER_DATE_BASES = ['OPERATIONAL', 'REQUESTED'] as const;
export const DISPATCHER_TRIP_STATUSES = ['DRAFT', 'PLANNED', 'RELEASED', 'LOADING', 'READY_FOR_DISPATCH', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'] as const;
export const DISPATCHER_EXCEPTION_TYPES = ['RECEIPT_DISCREPANCY', 'DAMAGED_GOODS', 'LOADING_SHORTFALL', 'DELIVERY_PARTIAL', 'DELIVERY_FAILED', 'SYNC_CONFLICT'] as const;
export const DISPATCHER_EXCEPTION_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED'] as const;
export const dispatcherContextQuerySchema = z.object({ date: date.optional() }).strict();
const pagination = { page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) };
const search = z.string().trim().max(80).optional();
export const dispatcherOrdersQuerySchema = z.object({ date: date.optional(), dateBasis: z.enum(DISPATCHER_DATE_BASES).default('OPERATIONAL'),
  status: z.enum(ORDER_STATUSES).optional(), brand: z.enum(['FRESH', 'STYLE', 'TECH']).optional(), depotId: z.string().uuid().optional(),
  district: z.string().trim().min(1).max(80).optional(), temperatureRequirement: z.enum(TEMPERATURE_REQUIREMENTS).optional(),
  previouslyDeferred: z.enum(['true', 'false']).optional().transform(value => value === undefined ? undefined : value === 'true'), search, ...pagination }).strict();
export const dispatcherTripsQuerySchema = z.object({ date: date.optional(), depotId: z.string().uuid().optional(), status: z.enum(DISPATCHER_TRIP_STATUSES).optional(), search, ...pagination }).strict();
export const dispatcherExceptionsQuerySchema = z.object({ date: date.optional(), depotId: z.string().uuid().optional(), status: z.enum(DISPATCHER_EXCEPTION_STATUSES).optional(),
  type: z.enum(DISPATCHER_EXCEPTION_TYPES).optional(), search, ...pagination }).strict();
export type DispatcherOrdersQuery = z.output<typeof dispatcherOrdersQuerySchema>;
export type DispatcherTripsQuery = z.output<typeof dispatcherTripsQuerySchema>;
export type DispatcherExceptionsQuery = z.output<typeof dispatcherExceptionsQuerySchema>;
export interface DispatcherDepot { id: string; name: string }
export interface DispatcherContext {
  selectedDate: string; dateSource: 'REQUEST' | 'CONFIGURED_DEMO' | 'PERSISTED' | 'CURRENT_DATE'; timezone: 'Asia/Colombo';
  calendar: { date: string; operatingDay: boolean; source: 'OFFICIAL' | 'SYNTHETIC' } | null;
  depots: DispatcherDepot[]; availableDates: string[]; districts: string[];
}
export interface DispatcherOutlet extends StoreOutlet { depotId: string }
export interface DispatcherDeferral { id: string; reasonCode: string; reasonDetail: string; deferredAt: string; nextEligibleDate: string | null; resolvedAt: string | null }
export interface DispatcherOrderSummary extends StoreOrderSummary {
  outlet: DispatcherOutlet; operationalDate: string; operationalDateSource: 'TRIP' | 'ELIGIBLE_REQUEST';
  deferralCount: number; latestDeferral: DispatcherDeferral | null;
  trip: { id: string; tripRef: string; serviceDate: string; vehicleRef: string; tripNumber: number; status: typeof DISPATCHER_TRIP_STATUSES[number] } | null;
}
export interface DispatcherOrderDetail extends DispatcherOrderSummary {
  timeline: StoreOrderDetail['timeline']; deferrals: DispatcherDeferral[]; delivery: StoreOrderDetail['delivery']; receipt: StoreOrderDetail['receipt'];
  issues: DispatcherExceptionSummary[];
}
export interface DispatcherPage { total: number; page: number; limit: number }
export interface DispatcherOrderList extends DispatcherPage { context: DispatcherContext; dateBasis: typeof DISPATCHER_DATE_BASES[number]; orders: DispatcherOrderSummary[] }
export interface DispatcherVehicle {
  id: string; vehicleRef: string; depot: DispatcherDepot; type: 'TRUCK' | 'VAN'; temperatureCapability: 'AMBIENT' | 'REEFER'; active: boolean;
  weightCapacityKg: string; volumeCapacityM3: string; source: 'OFFICIAL' | 'SYNTHETIC'; operationalAvailability: 'UNKNOWN';
}
export interface DispatcherFleet {
  total: number; activeMasterRecords: number; trucks: number; vans: number; reefer: number; ambient: number;
  weightCapacityKg: string; volumeCapacityM3: string; reeferWeightCapacityKg: string; reeferVolumeCapacityM3: string;
  operationalAvailability: 'UNKNOWN';
}
export interface DispatcherTripSummary {
  id: string; tripRef: string; serviceDate: string; status: typeof DISPATCHER_TRIP_STATUSES[number]; tripNumber: number; vehicle: DispatcherVehicle;
  version: number; driverUserId: string | null; completedAt: string | null;
  driverName: string | null; plannedDeparture: string | null; actualDeparture: string | null; plannedReturn: string | null; actualReturn: string | null;
  stopCount: number; orderedUnits: number; orderedWeightKg: string; orderedVolumeM3: string;
  planningOrigin: 'GENERATED' | 'PREPARED' | null; planningRunId: string | null; planningStatus: 'DRAFT' | 'VALIDATED' | 'RELEASED' | 'SUPERSEDED' | null;
}
export interface DispatcherTripDetail extends DispatcherTripSummary {
  stops: { id: string; sequence: number; active: boolean; status: string; plannedArrival: string | null; actualArrival: string | null;
    order: DispatcherOrderSummary }[];
}
export interface DispatcherTripList extends DispatcherPage { context: DispatcherContext; trips: DispatcherTripSummary[] }
export interface DispatcherExceptionSummary {
  id: string; type: typeof DISPATCHER_EXCEPTION_TYPES[number]; status: typeof DISPATCHER_EXCEPTION_STATUSES[number]; message: string;
  createdAt: string; resolvedAt: string | null; originRole: 'DISPATCHER' | 'LOADER' | 'DRIVER' | 'STORE_MANAGER' | null;
  originRoleSource: 'AUDIT_SNAPSHOT' | 'CURRENT_ACCOUNT' | 'UNKNOWN';
  operationalDate: string; depot: DispatcherDepot; order: { id: string; orderRef: string; status: typeof ORDER_STATUSES[number]; outletRef: string; brand: 'FRESH' | 'STYLE' | 'TECH' } | null;
  trip: { id: string; tripRef: string; serviceDate: string } | null;
}
export interface DispatcherExceptionDetail extends DispatcherExceptionSummary {
  orderDetail: DispatcherOrderDetail | null;
  receipt: StoreOrderDetail['receipt']; delivery: StoreOrderDetail['delivery'];
  loadingShortfall: LoaderShortfallReview | null;
}
export interface DispatcherExceptionList extends DispatcherPage { context: DispatcherContext; exceptions: DispatcherExceptionSummary[] }
export interface DispatcherPulse {
  context: DispatcherContext;
  metrics: { totalOrders: number; awaitingPlanning: number; planned: number; deferred: number; loadingReady: number; inTransit: number;
    delivered: number; receiptIssues: number; openExceptions: number; activeTrips: number };
  fleet: DispatcherFleet; orders: DispatcherOrderSummary[]; trips: DispatcherTripSummary[]; attention: DispatcherExceptionSummary[];
}
export interface DispatcherPlanningContext {
  context: DispatcherContext; orders: DispatcherOrderSummary[]; deferredOrders: DispatcherOrderSummary[]; vehicles: DispatcherVehicle[];
  fleet: DispatcherFleet; trips: DispatcherTripSummary[];
  totals: { awaitingPlanningCount: number; deferredCount: number; orderedUnits: number; orderedWeightKg: string; orderedVolumeM3: string;
    ambient: number; chilled: number; frozen: number; vanOnly: number; mallDock: number };
  travel: { depotId: string; district: string; roadClass: string; depotDistanceKm: string; depotMinutes: string; interStopKm: string; interStopMinutes: string; source: 'OFFICIAL' | 'SYNTHETIC' }[];
  serviceAllowances: { brand: 'FRESH' | 'STYLE' | 'TECH'; dockType: string; serviceMinutes: string; source: 'OFFICIAL' | 'SYNTHETIC' }[];
  generationAvailable: boolean; generationDepotIds: string[]; validationAvailable: boolean; releaseAvailable: boolean;
  calendarEligibility: 'OPERATING_CALENDAR' | 'NON_OPERATING' | 'UNKNOWN';
  limits: { orders: number; deferredOrders: number; vehicles: number; trips: number };
}
