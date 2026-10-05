import { z } from 'zod';

const coordinates = { latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) };
export const outletLocationSchema = z.object({ ...coordinates, expectedVersion: z.number().int().nonnegative(),
  label: z.string().trim().max(120).optional(), reason: z.string().trim().min(5).max(450) }).strict();
export const tripPositionSchema = z.object({ ...coordinates, accuracyMetres: z.number().finite().min(0).max(10000), eventAt: z.string().datetime() }).strict();
export type OutletLocationInput = z.infer<typeof outletLocationSchema>;
export type TripPositionInput = z.infer<typeof tripPositionSchema>;
export interface OutletLocation {
  outletId: string; latitude: number; longitude: number; label: string | null; version: number; recordedAt: string;
}
export interface TripPosition {
  tripId: string; latitude: number; longitude: number; accuracyMetres: number; eventAt: string; receivedAt: string;
}
export interface TripLocation {
  tripId: string; tripRef: string; status: string; serviceDate: string; stopCount: number;
  stops: { stopId: string; sequence: number; orderId: string; outletId: string; outletRef: string; brand: string; district: string; location: OutletLocation | null }[];
  position: TripPosition | null; positionStale: boolean; positionStaleAfterSeconds: number;
}
