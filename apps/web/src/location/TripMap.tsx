import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, RefreshCw } from 'lucide-react';
import type { TripLocation } from '@waypoint/shared';
import { useIdentity } from '../auth';
import { apiRequest } from '../api';
import { timeLabel } from '../store/components';
import { useMapConnection } from './connection';
import { LocationEditor } from './LocationEditor';
import { positionIsHistorical } from './position';
import './location.css';

const Canvas = lazy(() => import('./MapCanvas').then(module => ({ default: module.MapCanvas })));
export function TripMap({ tripId, editable = false }: { tripId: string; editable?: boolean }) {
  const identity = useIdentity(), online = useMapConnection();
  const [showMap, setShowMap] = useState(false);
  const query = useQuery({ queryKey: ['location', identity.data?.id, tripId], enabled: !!identity.data && online,
    queryFn: () => apiRequest<TripLocation>('/location/trips/' + encodeURIComponent(tripId)), retry: false,
    refetchInterval: online ? 15000 : false });
  const data = identity.data ? query.data : undefined;
  const located = data?.stops.filter(stop => !!stop.location).length || 0;
  const hasPoints = !!located || !!data?.position;
  const stale = data ? positionIsHistorical(data, online) : false;
  return <section className="location-panel" aria-label="Route map and vehicle location"><header><div><span className="eyebrow">ROUTE & LOCATION</span><h2>Delivery map</h2></div><MapPin size={24} /></header>
    {!online && <p className="location-note">Offline. Live positions and map tiles need a connection; delivery stops and saved proof remain available.</p>}
    {query.isPending && online ? <p role="status">Loading recorded locations…</p> : query.isError ? <div><p className="error-notice" role="alert">{query.error.message}</p><button className="btn secondary" onClick={() => void query.refetch()} disabled={!online}><RefreshCw size={16} />Retry locations</button></div> : data && <>
      <div className="location-status"><span className={'store-chip ' + (data.position && !stale ? 'green' : 'gray')}>{data.position ? stale ? 'Last recorded position' : 'Recent vehicle position' : 'No vehicle position'}</span><span>{located + '/' + data.stops.length + ' outlet locations recorded'}</span></div>
      {data.position && <p className="location-note">{'Driver reported ' + timeLabel(data.position.eventAt) + ' · accuracy ±' + Math.round(data.position.accuracyMetres) + ' m.'}{stale && ' This is a historical position, not a current location.'}</p>}
      {hasPoints ? <><button type="button" className="btn secondary" disabled={!online && !showMap} onClick={() => setShowMap(value => !value)}>{showMap ? 'Hide map' : 'Show route map'}</button>{showMap && online && <Suspense fallback={<p role="status">Opening map…</p>}><Canvas data={{ ...data, positionStale: stale }} /></Suspense>}<p className="location-note">Lines connect recorded delivery stops in sequence. Map tiles are provided by OpenStreetMap; driving directions are not calculated.</p></> : <p className="location-note">No coordinates have been recorded for this route. {editable ? 'Set outlet coordinates below to place its stops on the map.' : 'Dispatcher can record outlet coordinates. The stop list remains available.'}</p>}
      {!!data.stops.length && <ul className="location-stop-coordinates">{data.stops.map(stop => <li key={stop.stopId}><strong>{stop.sequence + ' · ' + stop.outletRef}</strong><span>{stop.location ? stop.location.latitude.toFixed(6) + ', ' + stop.location.longitude.toFixed(6) : 'Location not recorded'}</span></li>)}</ul>}
      {editable && online && <LocationEditor key={tripId} data={data} />}
    </>}
  </section>;
}
