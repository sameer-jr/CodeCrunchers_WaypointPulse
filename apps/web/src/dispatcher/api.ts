import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DispatcherContext, DispatcherExceptionDetail, DispatcherExceptionList, DispatcherOrderDetail, DispatcherOrderList, DispatcherPlanningContext, DispatcherPulse, DispatcherTripDetail, DispatcherTripList } from '@waypoint/shared';
import { apiRequest, ApiFailure } from '../api';
import { AUTH_KEY } from '../auth';

function queryString(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') params.set(key, String(value));
  return params.size ? `?${params}` : '';
}
export function useDispatcherContext(date?: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['dispatcher', 'context', date], queryFn: () => apiRequest<DispatcherContext>(`/dispatcher/context${queryString({ date })}`), retry: false, staleTime: 30000, refetchInterval: 30000 });
  useEffect(() => { if (query.error instanceof ApiFailure && query.error.status === 401) void client.invalidateQueries({ queryKey: AUTH_KEY }); }, [query.error, client]);
  return query;
}
function useDispatcherRead<T>(context: DispatcherContext, view: string, values: Record<string, string | number | boolean | undefined> = {}) {
  const scope = context.depots.map(depot => depot.id).sort().join(',');
  return useQuery({ queryKey: ['dispatcher', scope, view, context.selectedDate, values], queryFn: () => apiRequest<T>(`/dispatcher/${view}${queryString({ date: context.selectedDate, ...values })}`), retry: false, refetchInterval: 30000 });
}
function useDispatcherDetail<T>(context: DispatcherContext, view: string, id?: string) {
  const scope = context.depots.map(depot => depot.id).sort().join(',');
  return useQuery({ queryKey: ['dispatcher', scope, view, id], queryFn: () => apiRequest<T>(`/dispatcher/${view}/${encodeURIComponent(id!)}`), enabled: !!id, retry: false, refetchInterval: 30000 });
}
export function usePulse(context: DispatcherContext) { return useDispatcherRead<DispatcherPulse>(context, 'pulse'); }
export function usePlanning(context: DispatcherContext) { return useDispatcherRead<DispatcherPlanningContext>(context, 'planning-context'); }
export function useOrders(context: DispatcherContext, params: URLSearchParams) {
  return useDispatcherRead<DispatcherOrderList>(context, 'orders', {
    dateBasis: params.get('dateBasis') || 'OPERATIONAL', status: params.get('orderStatus') || undefined, brand: params.get('brand') || undefined,
    depotId: params.get('depotId') || undefined, district: params.get('district') || undefined, temperatureRequirement: params.get('temperature') || undefined,
    previouslyDeferred: params.get('deferred') || undefined, search: params.get('orderSearch') || undefined,
    page: params.get('orderPage') || '1', limit: params.get('orderLimit') || '25'
  });
}
export function useOrder(context: DispatcherContext, id?: string) { return useDispatcherDetail<DispatcherOrderDetail>(context, 'orders', id); }
export function useTrips(context: DispatcherContext, params: URLSearchParams) {
  return useDispatcherRead<DispatcherTripList>(context, 'trips', { depotId: params.get('depotId') || undefined, status: params.get('tripStatus') || undefined, search: params.get('tripSearch') || undefined, page: params.get('tripPage') || '1', limit: params.get('tripLimit') || '25' });
}
export function useTrip(context: DispatcherContext, id?: string) { return useDispatcherDetail<DispatcherTripDetail>(context, 'trips', id); }
export function useExceptions(context: DispatcherContext, params: URLSearchParams) {
  return useDispatcherRead<DispatcherExceptionList>(context, 'exceptions', { depotId: params.get('depotId') || undefined, status: params.get('exceptionStatus') || undefined, type: params.get('exceptionType') || undefined, search: params.get('exceptionSearch') || undefined, page: params.get('exceptionPage') || '1', limit: params.get('exceptionLimit') || '25' });
}
export function useException(context: DispatcherContext, id?: string) { return useDispatcherDetail<DispatcherExceptionDetail>(context, 'exceptions', id); }
