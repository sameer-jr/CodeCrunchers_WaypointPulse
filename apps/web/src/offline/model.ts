import type { DriverOperation, DriverTripDetail } from '@waypoint/shared';

export const LOCAL_SYNC_STATUSES = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'CONFLICT'] as const;
export type LocalSyncStatus = typeof LOCAL_SYNC_STATUSES[number];
export interface LocalDriverOperation extends DriverOperation {
  userId: string;
  tripId: string;
  syncStatus: LocalSyncStatus;
  attempts: number;
  reason?: string;
  serverVersion?: number;
  syncedAt?: string;
  serverTrip?: DriverTripDetail;
  baseTrip?: DriverTripDetail;
}
