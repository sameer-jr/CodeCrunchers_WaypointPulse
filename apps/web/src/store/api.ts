import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { StoreContext, StoreHome, StoreOrderDetail, StoreOrderInput, StoreOrderList, StoreOrderStatus, StoreReceiptInput } from '@waypoint/shared';
import { ApiFailure, apiRequest } from '../api';
import { AUTH_KEY } from '../auth';

export const STORE_KEYS = {
  context: ['store', 'context'] as const,
  home: ['store', 'home'] as const,
  orders: ['store', 'orders'] as const,
  order: (id: string) => ['store', 'order', id] as const
};
export function useStoreContext() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: STORE_KEYS.context, queryFn: () => apiRequest<StoreContext>('/store/context'), retry: false, staleTime: 30000, refetchInterval: 30000 });
  useEffect(() => {
    if (query.error instanceof ApiFailure && query.error.status === 401) void queryClient.invalidateQueries({ queryKey: AUTH_KEY });
  }, [query.error, queryClient]);
  return query;
}
export function useStoreHome() {
  return useQuery({ queryKey: STORE_KEYS.home, queryFn: () => apiRequest<StoreHome>('/store/home'), refetchInterval: 30000 });
}
export function useStoreOrders(filters: { status?: StoreOrderStatus; date?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.date) params.set('date', filters.date);
  return useQuery({ queryKey: [...STORE_KEYS.orders, filters], queryFn: () => apiRequest<StoreOrderList>(`/store/orders${params.size ? `?${params}` : ''}`), refetchInterval: 30000 });
}
export function useStoreOrder(id: string | undefined) {
  return useQuery({ queryKey: STORE_KEYS.order(id || ''), queryFn: () => apiRequest<StoreOrderDetail>(`/store/orders/${encodeURIComponent(id!)}`), enabled: !!id, retry: false, refetchInterval: 15000 });
}
export const createStoreOrder = (input: StoreOrderInput) => apiRequest<StoreOrderDetail>('/store/orders', { method: 'POST', body: JSON.stringify(input) });
export const receiveStoreOrder = (id: string, input: StoreReceiptInput) => apiRequest<StoreOrderDetail>(`/store/orders/${encodeURIComponent(id)}/receipt`, { method: 'POST', body: JSON.stringify(input) });

