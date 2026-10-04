import { useSearchParams } from 'react-router-dom';

export function dispatcherLink(page: string, params: URLSearchParams, changes: Record<string, string | undefined> = {}) {
  const next = new URLSearchParams(params);
  const targetFilters = page === 'orders' && changes.order ? ['dateBasis', 'orderStatus', 'brand', 'depotId', 'district', 'temperature', 'deferred', 'orderSearch', 'orderPage']
    : page === 'routes' && changes.trip ? ['tripStatus', 'tripSearch', 'tripPage', 'depotId']
      : page === 'exceptions' && changes.exception ? ['exceptionStatus', 'exceptionType', 'exceptionSearch', 'exceptionPage', 'depotId'] : [];
  for (const key of targetFilters) next.delete(key);
  for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
  return `/dispatcher/${page}${next.size ? `?${next}` : ''}`;
}
export function useDispatcherParams() {
  const [params, setParams] = useSearchParams();
  const update = (changes: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    if (resetPage && !('page' in changes)) next.delete('page');
    setParams(next);
  };
  return { params, update };
}
