import { z } from 'zod';
import type { ProofMetadata } from './proof.js';

export const ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'CLOSED_FOR_PLANNING', 'PLANNED', 'DEFERRED', 'RELEASED_TO_LOADING', 'LOADING', 'LOADING_EXCEPTION', 'READY_FOR_DISPATCH', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'DELIVERY_FAILED', 'AWAITING_RECEIPT', 'RECEIPT_CONFIRMED', 'RECEIPT_ISSUE'] as const;
export type StoreOrderStatus = typeof ORDER_STATUSES[number];
export const TEMPERATURE_REQUIREMENTS = ['AMBIENT', 'CHILLED', 'FROZEN'] as const;
export type StoreTemperature = typeof TEMPERATURE_REQUIREMENTS[number];
export const RECEIPT_ISSUE_TYPES = ['NONE', 'QUANTITY_DISCREPANCY', 'DAMAGED_GOODS', 'OTHER'] as const;
export type StoreReceiptIssue = typeof RECEIPT_ISSUE_TYPES[number];
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a delivery date.').refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number(value.slice(0, 4)) >= 1 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Choose a real delivery date.');
const positiveDecimal = z.number({ error: 'Enter a number.' }).positive('Enter a value greater than zero.').max(999999999.999, 'Enter a value no greater than 999,999,999.999.').multipleOf(0.001, 'Use up to three decimal places.');
export const storeOrderInputSchema = z.object({
  requestedDeliveryDate: dateString,
  temperatureRequirement: z.enum(TEMPERATURE_REQUIREMENTS),
  orderedUnits: z.number({ error: 'Enter the requested units.' }).int('Enter whole units.').positive('Enter at least one unit.').max(2147483647, 'Enter no more than 2,147,483,647 units.'),
  orderedWeightKg: positiveDecimal,
  orderedVolumeM3: positiveDecimal
}).strict();
export type StoreOrderInput = z.infer<typeof storeOrderInputSchema>;
export const storeReceiptInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  receivedUnits: z.number({ error: 'Enter the received units.' }).int('Enter whole units.').min(0, 'Received units cannot be negative.').max(2147483647, 'Enter no more than 2,147,483,647 units.'),
  issueType: z.enum(RECEIPT_ISSUE_TYPES),
  issueNote: z.string().trim().max(1000).optional()
}).strict().superRefine((input, ctx) => {
  if (input.issueType !== 'NONE' && (input.issueNote?.length ?? 0) < 5) ctx.addIssue({ code: 'custom', path: ['issueNote'], message: 'Explain the issue in at least five characters.' });
});
export type StoreReceiptInput = z.infer<typeof storeReceiptInputSchema>;
export interface StoreOutlet {
  id: string; outletRef: string; brand: 'FRESH' | 'STYLE' | 'TECH'; district: string; depotName: string;
  dockType: string; accessConstraint: string; source: 'OFFICIAL' | 'SYNTHETIC';
  deliveryWindowOpen: number; deliveryWindowClose: number; mallWindowOpen: number | null; mallWindowClose: number | null;
}
export interface StoreContext {
  outlet: StoreOutlet; serverNow: string; today: string; timezone: 'Asia/Colombo'; cutoffAt: string;
  cutoffPassed: boolean; nextEligibleDate: string | null; operatingDates: string[];
  temperatureRequirements: StoreTemperature[]; operationalContext: string;
}
export interface StoreOrderSummary {
  id: string; orderRef: string; status: StoreOrderStatus; version: number;
  requestedDeliveryDate: string; eligibleDeliveryDate: string; eligibilityNotice: string | null;
  createdAt: string; confirmedAt: string | null; temperatureRequirement: StoreTemperature;
  orderedUnits: number; orderedWeightKg: string; orderedVolumeM3: string;
  loadedUnits: number | null; deliveredUnits: number | null; receivedUnits: number | null;
  plannedArrival: string | null; actualArrival: string | null; completedAt: string | null;
  receiptStatus: 'CONFIRMED' | 'ISSUE_REPORTED' | null; issueType: Exclude<StoreReceiptIssue, 'NONE'> | null;
}
export interface StoreHome {
  context: StoreContext;
  counts: { upcoming: number; deferred: number; awaitingReceipt: number; completed: number; attention: number };
  orders: StoreOrderSummary[]; attention: StoreOrderSummary[];
}
export interface StoreOrderList { orders: StoreOrderSummary[]; total: number }
export interface StoreOrderDetail extends StoreOrderSummary {
  outlet: StoreOutlet; canReceive: boolean;
  timeline: { id: string; eventType: string; status: StoreOrderStatus | null; timestamp: string }[];
  deferrals: { id: string; reasonCode: string; reasonDetail: string; deferredAt: string; nextEligibleDate: string | null; resolvedAt: string | null }[];
  trip: { id?: string; tripRef: string; vehicleRef: string; tripNumber: number; plannedArrival: string | null; actualArrival: string | null; actualDeparture: string | null } | null;
  delivery: { id: string; outcome: 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'FAILED'; driverNote: string | null; arrivedAt: string; completedAt: string;
    proof: ProofMetadata | null } | null;
  receipt: { id: string; status: 'CONFIRMED' | 'ISSUE_REPORTED'; receivedUnits: number; issueType: Exclude<StoreReceiptIssue, 'NONE'> | null; issueNote: string | null; confirmedAt: string } | null;
  issues: { id: string; type: string; status: string; message: string; createdAt: string; resolvedAt: string | null }[];
}
