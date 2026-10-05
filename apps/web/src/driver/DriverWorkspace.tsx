import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useDriverWorkspace } from '../offline/useDriverWorkspace';
import { dateLabel, driverLink, DriverChip, DriverState, type DriverAction } from './components';
import { TodayPage } from './Today';
import { RoutePage } from './Route';
import { ProofPage } from './Proof';
import { SyncPage } from './Sync';
import { DriverLocationSharing } from '../location/DriverLocationSharing';
import './driver.css';

export function DriverWorkspace({ page }: { page: string }) {
  const [params, setParams] = useSearchParams();
  const workspace = useDriverWorkspace(params.get('date') || undefined);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedTrip = params.get('trip');
  const trip = workspace.trips.find(item => item.id === selectedTrip) || (!selectedTrip ? workspace.trips[0] : undefined);
  const selectedStop = params.get('stop');
  const stop = trip?.stops.find(item => item.id === (selectedStop || trip.nextStopId)) || (!selectedStop ? trip?.stops[0] : undefined);
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    setParams(next);
  };
  useEffect(() => {
    if (!trip) return;
    const next = new URLSearchParams(params);
    if (!selectedTrip) next.set('trip', trip.id);
    if (!params.get('date')) next.set('date', trip.serviceDate);
    if (!selectedStop && stop && ['route', 'proof'].includes(page)) next.set('stop', stop.id);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [trip, selectedTrip, selectedStop, stop, page, params, setParams]);
  const execute = async (action: DriverAction, id: string, input: Record<string, unknown>) => {
    setBusy(true); setActionError(null);
    try { await workspace.mutate(action, id, input); } catch (error) { setActionError(error instanceof Error ? error.message : 'This action could not be saved.'); }
    finally { setBusy(false); }
  };
  const sync = async () => { setActionError(null); try { await workspace.syncNow(); } catch (error) { setActionError(error instanceof Error ? error.message : 'Synchronization is unavailable.'); } };
  const pendingStop = !!stop && workspace.operations.some(item => item.entityId === stop.id && item.syncStatus !== 'SYNCED');
  const hasConflict = workspace.operations.some(item => item.syncStatus === 'CONFLICT');
  const hasFailure = workspace.operations.some(item => item.syncStatus === 'FAILED');
  const connectionLabel = hasConflict ? 'Conflict · work retained' : hasFailure ? 'Sync failed · work retained' : !workspace.online ? 'Offline' : workspace.syncing ? 'Syncing' : workspace.pendingCount ? 'Pending sync' : workspace.source === 'CACHE' ? 'Cached route' : 'Connected';
  if (workspace.isPending) return <div className="driver-workspace"><DriverState title="Connecting your route…" message="Loading your assigned ready trips and saved route cache." /></div>;
  return <div className="driver-workspace"><section className={`driver-connection ${!workspace.online || workspace.source === 'CACHE' || workspace.pendingCount ? 'warning' : ''}`} aria-label="Connection and synchronization state"><div>{!workspace.online && <WifiOff size={20} />}<strong>{connectionLabel}</strong><span>{workspace.source === 'SERVER' ? 'Server data' : workspace.source === 'CACHE' ? 'Cached route data' : 'No route data'}{workspace.pendingCount ? ` · ${workspace.pendingCount} device-saved actions shown locally` : ''}</span></div><Link to={driverLink('sync', params)}>View Sync</Link></section>{(workspace.error || actionError) && <p className="error-notice" role="alert">{actionError || workspace.error}</p>}{trip && <DriverLocationSharing key={trip.id} trip={trip} online={workspace.online} />}{page === 'sync' ? <SyncPage operations={workspace.operations} online={workspace.online} syncing={workspace.syncing} syncNow={sync} cacheSavedAt={workspace.cacheSavedAt} shellReady={workspace.shellReady} /> : !trip ? <DriverState title={selectedTrip ? 'This trip is not available to your account' : 'No ready routes assigned'} message={selectedTrip ? 'Choose a currently assigned ready route. Changed or foreign trip identities cannot be opened.' : 'An assigned generated trip appears here after Loader completes loading and Dispatcher revisions are approved.'}><button className="btn primary" onClick={() => void workspace.refetch()}>Refresh assignments</button>{selectedTrip && <button className="btn secondary" onClick={() => update({ trip: undefined, stop: undefined })}>Choose assigned route</button>}</DriverState> : <><section className="driver-trip-context"><div><span className="eyebrow">ASSIGNED OPERATIONAL DAY</span><strong>{dateLabel(trip.serviceDate)}</strong><small>{trip.tripRef}</small></div><button className="icon-button" aria-label="Refresh assigned route" disabled={busy || workspace.syncing || !workspace.online} onClick={() => void workspace.refetch()}><RefreshCw size={18} /></button></section>{workspace.trips.length > 1 && <div className="driver-field"><label htmlFor="driver-selected-trip">Assigned trip</label><select id="driver-selected-trip" value={trip.id} onChange={event => update({ trip: event.target.value, stop: undefined })}>{workspace.trips.map(item => <option value={item.id} key={item.id}>{item.vehicle.vehicleRef} · Trip {item.tripNumber}</option>)}</select></div>}{workspace.cacheSavedAt && <div className="driver-cache-state"><DriverChip label="Route cached on this device" tone="green" /><span>{workspace.shellReady ? 'Offline reload ready' : 'Preparing offline shell'}</span></div>}{page === 'route' ? <RoutePage trip={trip} stop={stop} params={params} execute={execute} busy={busy || workspace.syncing} pendingStop={pendingStop} selectStop={id => update({ stop: id })} /> : page === 'proof' ? <ProofPage trip={trip} stop={stop} params={params} execute={execute} busy={busy || workspace.syncing} online={workspace.online} pendingStop={pendingStop} operations={workspace.operations} /> : <TodayPage trip={trip} params={params} execute={execute} busy={busy || workspace.syncing} online={workspace.online} />}</>}</div>;
}
