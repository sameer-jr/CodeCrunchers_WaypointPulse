import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoaderLoadList, LoaderTripDetail, RecordStopLoadInput, ReviewLoadingShortfallInput } from '@waypoint/shared';
import { apiRequest, ApiFailure } from '../api';
import { AUTH_KEY } from '../auth';

export const LOADER_KEYS = { all: ['loader'] as const, trip: (id: string) => ['loader', 'trip', id] as const };
export function useLoaderLoads(date?: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['loader', 'loads', date], queryFn: () => apiRequest<LoaderLoadList>(`/loader/loads${date ? `?date=${encodeURIComponent(date)}` : ''}`), retry: false, refetchInterval: 10000 });
  useEffect(() => { if (query.error instanceof ApiFailure && query.error.status === 401) void client.invalidateQueries({ queryKey: AUTH_KEY }); }, [query.error, client]);
  return query;
}
export function useLoaderTrip(id?: string) {
  return useQuery({ queryKey: ['loader', 'trip', id], queryFn: () => apiRequest<LoaderTripDetail>(`/loader/trips/${encodeURIComponent(id!)}`), enabled: !!id, retry: false, refetchInterval: 10000 });
}
export function recordStopLoad(id: string, input: RecordStopLoadInput) {
  return apiRequest<LoaderTripDetail>(`/loader/stops/${encodeURIComponent(id)}/load`, { method: 'POST', body: JSON.stringify(input) });
}
export function markTripReady(id: string, expectedTripVersion: number) {
  return apiRequest<LoaderTripDetail>(`/loader/trips/${encodeURIComponent(id)}/ready`, { method: 'POST', body: JSON.stringify({ expectedTripVersion }) });
}
export function reviewShortfall(id: string, input: ReviewLoadingShortfallInput) {
  return apiRequest<LoaderTripDetail>(`/dispatcher/exceptions/${encodeURIComponent(id)}/review-load`, { method: 'POST', body: JSON.stringify(input) });
}
