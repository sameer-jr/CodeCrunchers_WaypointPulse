import { describe, expect, it } from 'vitest';
import type { TripLocation } from '@waypoint/shared';
import { positionIsHistorical } from './position';

const time = Date.parse('2026-10-05T05:00:00Z');
const current: TripLocation = { tripId: 'trip', tripRef: 'SYNTHETIC', serviceDate: '2040-03-05', status: 'IN_TRANSIT', stops: [], stopCount: 0,
  position: { tripId: 'trip', latitude: 6.9, longitude: 79.8, accuracyMetres: 12, eventAt: new Date(time).toISOString(), receivedAt: new Date(time).toISOString() },
  positionStale: false, positionStaleAfterSeconds: 120 };
describe('reported vehicle location labels', () => {
  it('retains the server stale decision even when the observer clock is behind', () => {
    expect(positionIsHistorical({ ...current, positionStale: true }, true, time - 3600000)).toBe(true);
  });
  it('never describes an offline or completed-trip position as current', () => {
    expect(positionIsHistorical(current, false, time)).toBe(true);
    expect(positionIsHistorical({ ...current, status: 'COMPLETED' }, true, time)).toBe(true);
  });
  it('ages a recorded position while preserving the absence of a reading', () => {
    expect(positionIsHistorical(current, true, time)).toBe(false);
    expect(positionIsHistorical(current, true, time + 121000)).toBe(true);
    expect(positionIsHistorical({ ...current, position: null }, true, time)).toBe(false);
  });
});
