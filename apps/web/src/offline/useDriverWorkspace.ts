import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverAction, DriverRouteList, DriverSyncResponse } from '@waypoint/shared';
import { apiRequest } from '../api';
import { useIdentity } from '../auth';
import { createLocalOperation, projectRoutes, syncOperations } from './engine';
import type { LocalDriverOperation } from './model';
import { readDriverOperations, readDriverRoutes, saveDriverOperation, saveDriverRoutes, type CachedDriverRoutes } from './storage';
import { ensureOfflineShell } from './shell';
import { captureDriverSession, driverSessionIsCurrent } from './session';

const activeSyncs = new Map<string, Promise<void>>();
function useConnection() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}
export function useDriverWorkspace(date?: string) {
  const identity = useIdentity(), userId = identity.data?.role === 'DRIVER' ? identity.data.id : undefined;
  const online = useConnection(), queryClient = useQueryClient();
  const [cached, setCached] = useState<CachedDriverRoutes | null>(null), [operations, setOperations] = useState<LocalDriverOperation[]>([]);
  const [localLoaded, setLocalLoaded] = useState(false), [storageError, setStorageError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false), [shellReady, setShellReady] = useState(false);
  const query = useQuery({ queryKey: ['driver', 'routes', userId, date ?? 'today'], enabled: !!userId && online,
    queryFn: async () => {
      const generation = captureDriverSession();
      const routes = await apiRequest<DriverRouteList>(`/driver/routes${date ? `?date=${encodeURIComponent(date)}` : ''}`);
      if (!driverSessionIsCurrent(generation, userId)) throw new Error('The session changed. This route response was discarded.');
      return { routes, generation };
    },
    retry: false, refetchInterval: online ? 15000 : false });
  const reloadLocal = useCallback(async () => {
    if (!userId) return;
    const [route, items] = await Promise.all([readDriverRoutes(userId, date), readDriverOperations(userId)]);
    setCached(route); setOperations(items); setLocalLoaded(true);
  }, [date, userId]);
  useEffect(() => {
    setCached(null); setOperations([]); setLocalLoaded(false); setStorageError(null);
    void reloadLocal().catch(error => { setLocalLoaded(true); setStorageError(error instanceof Error ? error.message : 'Device storage is unavailable.'); });
    void ensureOfflineShell().then(setShellReady);
  }, [reloadLocal]);
  useEffect(() => {
    if (!query.data || !userId) return;
    const snapshot = query.data;
    const cache = async () => {
      const previous = await readDriverRoutes(userId, snapshot.routes.selectedDate), queued = await readDriverOperations(userId);
      const pending = new Set(queued.filter(item => item.syncStatus !== 'SYNCED').map(item => item.tripId));
      const missing = previous?.routes.trips.filter(trip => pending.has(trip.id) && !snapshot.routes.trips.some(current => current.id === trip.id)) ?? [];
      const saved = await saveDriverRoutes(userId, { ...snapshot.routes, trips: [...snapshot.routes.trips, ...missing] }, snapshot.generation);
      if (saved && driverSessionIsCurrent(snapshot.generation, userId)) { setCached(saved); setLocalLoaded(true); }
    };
    void cache().catch(error => setStorageError(error instanceof Error ? error.message : 'The route could not be cached.'));
  }, [query.data, userId]);
  const syncNow = useCallback(async () => {
    const generation = captureDriverSession();
    if (!userId || !navigator.onLine || !driverSessionIsCurrent(generation, userId)) return;
    const existing = activeSyncs.get(userId);
    if (existing) {
      setSyncing(true);
      try { await existing; await reloadLocal(); } finally { setSyncing(false); }
      return;
    }
    const work = async () => {
      setSyncing(true);
      setStorageError(null);
      try {
        const items = await readDriverOperations(userId);
        await syncOperations(items, async operation => {
          if (!driverSessionIsCurrent(generation, userId)) throw new Error('The session changed. Local work was retained.');
          const response = await apiRequest<DriverSyncResponse>('/driver/sync', { method: 'POST', body: JSON.stringify({ operations: [operation] }) });
          const result = response.results.find(item => item.operationId === operation.operationId);
          if (!result) throw new Error('The server did not acknowledge this operation. Local work was retained.');
          return result;
        }, async operation => {
          await saveDriverOperation(operation);
          if (operation.syncStatus === 'SYNCED' && operation.serverTrip) {
            const saved = await readDriverRoutes(userId, operation.serverTrip.serviceDate);
            if (saved) await saveDriverRoutes(userId, { ...saved.routes, trips: saved.routes.trips.map(trip => trip.id === operation.tripId ? operation.serverTrip! : trip) }, generation);
          }
          await reloadLocal();
        });
        await queryClient.invalidateQueries({ queryKey: ['driver'] });
        await queryClient.invalidateQueries({ queryKey: ['dispatcher'] });
        await queryClient.invalidateQueries({ queryKey: ['store'] });
      } catch (error) { setStorageError(error instanceof Error ? error.message : 'Synchronization is unavailable.'); }
      finally { setSyncing(false); await reloadLocal(); }
    };
    const promise = work(); activeSyncs.set(userId, promise);
    try { await promise; } finally { activeSyncs.delete(userId); }
  }, [queryClient, reloadLocal, userId]);
  useEffect(() => {
    if (!online || !userId || !localLoaded) return;
    void syncNow();
    const timer = window.setInterval(() => void syncNow(), 30000);
    return () => window.clearInterval(timer);
  }, [online, userId, localLoaded, syncNow]);
  const activeDriver = !!userId && driverSessionIsCurrent(captureDriverSession(), userId);
  const scopedOperations = useMemo(() => activeDriver ? operations.filter(operation => operation.userId === userId) : [], [activeDriver, operations, userId]);
  const serverRoutes = activeDriver && query.data && driverSessionIsCurrent(query.data.generation, userId) ? query.data.routes : null;
  const cachedRoutes = activeDriver && cached && cached.userId === userId ? cached.routes : null;
  const source = online && serverRoutes && !query.isError ? 'SERVER' as const : cachedRoutes ? 'CACHE' as const : 'NONE' as const;
  const base = source === 'SERVER' ? serverRoutes : cachedRoutes;
  const display = useMemo(() => {
    if (!base) return null;
    const pendingIds = new Set(scopedOperations.filter(item => item.syncStatus !== 'SYNCED').map(item => item.tripId));
    const retained = cachedRoutes?.trips.filter(trip => pendingIds.has(trip.id) && !base.trips.some(current => current.id === trip.id)) ?? [];
    return projectRoutes({ ...base, trips: [...base.trips, ...retained] }, scopedOperations);
  }, [base, cachedRoutes, scopedOperations]);
  const mutate = useCallback(async (action: DriverAction, entityId: string, input: unknown) => {
    if (!userId || !display || !driverSessionIsCurrent(captureDriverSession(), userId)) throw new Error('Open and cache your assigned route before recording work.');
    const trip = display.trips.find(item => item.id === entityId || item.stops.some(stop => stop.id === entityId));
    if (!trip) throw new Error('This trip is not in your assigned route cache.');
    if (scopedOperations.some(item => item.tripId === trip.id && item.syncStatus === 'CONFLICT')) throw new Error('This route has a synchronization conflict. Retain the local record and ask Dispatcher to review it.');
    const operation = createLocalOperation(userId, trip, action, entityId, input);
    if (scopedOperations.some(item => item.tripId === trip.id && item.syncStatus !== 'SYNCED')) delete operation.baseTrip;
    await saveDriverOperation(operation); await reloadLocal();
    if (navigator.onLine) await syncNow();
  }, [display, scopedOperations, reloadLocal, syncNow, userId]);
  return { trips: display?.trips ?? [], selectedDate: display?.selectedDate ?? date ?? '', availableDates: display?.availableDates ?? [],
    serverRoutes, cachedRoutes, source, cacheSavedAt: cachedRoutes && cached ? cached.savedAt : null, shellReady, operations: scopedOperations, online, syncing,
    pendingCount: scopedOperations.filter(item => item.syncStatus !== 'SYNCED').length, isPending: !localLoaded && query.isPending,
    error: storageError ?? (!base && query.error ? query.error.message : null), refetch: query.refetch, mutate, syncNow };
}
