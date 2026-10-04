import { useSearchParams } from 'react-router-dom';

export function loaderLink(page: string, params: URLSearchParams, trip?: string) {
  const next = new URLSearchParams(params);
  if (trip) next.set('trip', trip);
  return `/loader/${page}${next.size ? `?${next}` : ''}`;
}
export function useLoaderParams() {
  const [params, setParams] = useSearchParams();
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setParams(next);
  };
  return { params, update };
}
