import { z } from 'zod';
import type { DispatcherVehicle } from './dispatcher.js';
import type { StoreOutlet, ORDER_STATUSES, TEMPERATURE_REQUIREMENTS } from './store.js';

export const DELIVERY_REASONS = ['CUSTOMER_UNAVAILABLE', 'OUTLET_CLOSED', 'DAMAGED_IN_TRANSIT', 'QUANTITY_REJECTED', 'ACCESS_BLOCKED', 'OTHER'] as const;
export const DRIVER_ACTIONS = ['START_TRIP', 'ARRIVAL', 'COMPLETE_DELIVERY', 'FINISH_TRIP'] as const;
export type DeliveryReason = typeof DELIVERY_REASONS[number];
export type DriverAction = typeof DRIVER_ACTIONS[number];
const version = z.number().int().positive();
const stopVersions = { expectedStopVersion: version, expectedOrderVersion: version };
const deliveryFields = { outcome: z.enum(['DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED']), deliveredUnits: z.number().int().nonnegative().max(2147483647),
  reasonCode: z.enum(DELIVERY_REASONS).optional(), driverNote: z.string().trim().max(1000).optional(),
  recipientName: z.string().trim().min(1).max(120).optional(), recipientRole: z.string().trim().min(1).max(80).optional() };
export const driverTripMutationSchema = z.object({ expectedTripVersion: version }).strict();
export const driverArrivalSchema = z.object({ expectedTripVersion: version, ...stopVersions }).strict();
export const driverDeliveryPayloadSchema = z.object({ ...stopVersions, ...deliveryFields }).strict().superRefine((input, context) => {
  if (input.outcome !== 'DELIVERED' && !input.reasonCode) context.addIssue({ code: 'custom', message: 'Select a delivery reason.', path: ['reasonCode'] });
  if (input.outcome !== 'FAILED' && !input.recipientName) context.addIssue({ code: 'custom', message: 'Enter the recipient name.', path: ['recipientName'] });
  if (input.outcome !== 'FAILED' && !input.recipientRole) context.addIssue({ code: 'custom', message: 'Enter the recipient role.', path: ['recipientRole'] });
  if ((input.reasonCode === 'OTHER' || input.reasonCode === 'DAMAGED_IN_TRANSIT' || input.reasonCode === 'QUANTITY_REJECTED') && (input.driverNote?.length ?? 0) < 5) {
    context.addIssue({ code: 'custom', message: 'Explain this delivery reason in at least five characters.', path: ['driverNote'] });
  }
  if (input.outcome === 'FAILED' && input.deliveredUnits !== 0) context.addIssue({ code: 'custom', message: 'A failed delivery has zero delivered units.', path: ['deliveredUnits'] });
});
export const driverDeliverySchema = z.object({ expectedTripVersion: version, ...stopVersions, ...deliveryFields }).strict().superRefine((input, context) => {
  const payload = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'expectedTripVersion'));
  const parsed = driverDeliveryPayloadSchema.safeParse(payload);
  if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});
export const driverOperationSchema = z.object({ operationId: z.string().uuid(), entityType: z.enum(['TRIP', 'TRIP_STOP']), entityId: z.string().uuid(),
  action: z.enum(DRIVER_ACTIONS), payload: z.record(z.string(), z.unknown()), createdAt: z.string().datetime(), clientEventAt: z.string().datetime(), baseVersion: version,
  recordedOffline: z.boolean().optional() }).strict();
export const driverSyncSchema = z.object({ operations: z.array(driverOperationSchema).min(1).max(20) }).strict();
export type DriverTripMutationInput = z.infer<typeof driverTripMutationSchema>;
export type DriverArrivalInput = z.infer<typeof driverArrivalSchema>;
export type DriverDeliveryInput = z.infer<typeof driverDeliveryPayloadSchema> & DriverTripMutationInput;
export type DriverOperation = z.infer<typeof driverOperationSchema>;
export interface DriverDelivery {
  id: string; outcome: 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'FAILED'; expectedLoadedUnits: number; deliveredUnits: number;
  reasonCode: DeliveryReason | null; driverNote: string | null; arrivedAt: string; completedAt: string;
  proof: { recipientName: string | null; recipientRole: string | null; hasPhoto: false; hasSignature: false; binaryAvailable: false } | null;
}
export interface DriverStop {
  id: string; sequence: number; version: number; status: string; plannedArrival: string | null; actualArrival: string | null; completedAt: string | null;
  order: { id: string; orderRef: string; version: number; status: typeof ORDER_STATUSES[number]; orderedUnits: number;
    temperatureRequirement: typeof TEMPERATURE_REQUIREMENTS[number]; outlet: StoreOutlet };
  loadedUnits: number; delivery: DriverDelivery | null; canArrive: boolean; canComplete: boolean;
  exceptions: { id: string; type: string; status: string; message: string; createdAt: string; resolvedAt: string | null }[];
}
export interface DriverTripDetail {
  id: string; tripRef: string; tripNumber: number; version: number; serviceDate: string; status: 'READY_FOR_DISPATCH' | 'IN_TRANSIT' | 'COMPLETED';
  vehicle: DispatcherVehicle; plannedDeparture: string | null; actualDeparture: string | null; completedAt: string | null;
  orderedUnits: number; loadedUnits: number; deliveredUnits: number; stopCount: number; completedStops: number; nextStopId: string | null;
  canStart: boolean; canFinish: boolean; stops: DriverStop[];
}
export interface DriverRouteList { selectedDate: string; availableDates: string[]; trips: DriverTripDetail[] }
export interface DriverSyncResult { operationId: string; status: 'SYNCED' | 'CONFLICT' | 'FAILED'; reason?: string; serverVersion?: number; trip?: DriverTripDetail }
export interface DriverSyncResponse { results: DriverSyncResult[] }
