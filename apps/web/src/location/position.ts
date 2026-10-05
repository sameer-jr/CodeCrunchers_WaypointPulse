import type { TripLocation } from '@waypoint/shared';

export function positionIsHistorical(data: TripLocation, online: boolean, now = Date.now()) {
  return !!data.position && (data.positionStale || !online || data.status !== 'IN_TRANSIT' || now - Date.parse(data.position.eventAt) > data.positionStaleAfterSeconds * 1000);
}
