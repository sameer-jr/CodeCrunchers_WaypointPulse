import type { DriverTripDetail } from '@waypoint/shared';

export function selectAssignedTrip(trips: DriverTripDetail[], selectedId: string | null) {
  if (selectedId) return trips.find(trip => trip.id === selectedId);
  return trips.find(trip => trip.status === 'IN_TRANSIT')
    || trips.find(trip => trip.status === 'READY_FOR_DISPATCH')
    || trips[0];
}
