import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router-dom';
import { ROLE_HOME, type Role } from '@waypoint/shared';
import { getIdentity } from './api';

export const AUTH_KEY = ['auth', 'me'] as const;
export function useIdentity() {
  return useQuery({ queryKey: AUTH_KEY, queryFn: getIdentity, staleTime: 0, retry: false, refetchInterval: 60000 });
}
export function SessionState({ message = 'Checking your session…', error, retry }: { message?: string; error?: string; retry?: () => void }) {
  return <main className="session-state"><img src="/assets/logo-mark.png" alt="" /><h1>{error ? 'Connection unavailable' : 'Waypoint Pulse'}</h1><p role={error ? 'alert' : 'status'}>{error || message}</p>{retry && <button className="btn primary" onClick={retry}>Try again</button>}</main>;
}
export function ProtectedRole({ role }: { role: Role }) {
  const identity = useIdentity();
  if (identity.isPending) return <SessionState />;
  if (identity.isError) return <SessionState error={identity.error.message} retry={() => void identity.refetch()} />;
  if (!identity.data) return <Navigate to="/login" replace />;
  if (identity.data.role !== role) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
export function LandingRedirect() {
  const identity = useIdentity();
  if (identity.isPending) return <SessionState />;
  if (identity.isError) return <SessionState error={identity.error.message} retry={() => void identity.refetch()} />;
  return <Navigate to={identity.data ? ROLE_HOME[identity.data.role] : '/login'} replace />;
}
