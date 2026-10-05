import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { outletLocationSchema, type TripLocation } from '@waypoint/shared';
import { apiRequest } from '../api';

type MapStop = TripLocation['stops'][number];
function LocationForm({ stop }: { stop: MapStop }) {
  const client = useQueryClient();
  const [latitude, setLatitude] = useState(stop.location ? String(stop.location.latitude) : '');
  const [longitude, setLongitude] = useState(stop.location ? String(stop.location.longitude) : '');
  const [label, setLabel] = useState(stop.location?.label || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({ mutationFn: async () => {
    if (!latitude.trim() || !longitude.trim()) throw new Error('Enter both latitude and longitude.');
    const parsed = outletLocationSchema.safeParse({ latitude: Number(latitude), longitude: Number(longitude), label, reason, expectedVersion: stop.location?.version || 0 });
    if (!parsed.success) throw new Error('Use valid coordinates and explain their source in at least five characters.');
    return apiRequest('/location/outlets/' + encodeURIComponent(stop.outletId), { method: 'PUT', body: JSON.stringify(parsed.data) });
  }, onSuccess: async () => { setError(null); await client.invalidateQueries({ queryKey: ['location'] }); } });
  return <form className="location-editor" onSubmit={event => { event.preventDefault(); setError(null); save.mutate(undefined, { onError: failure => setError(failure.message) }); }}>
    <p className="location-note">Record the receiving location from a confirmed address or GPS reading. Location changes retain the source note and Dispatcher identity.</p>
    <div className="location-coordinate-fields"><div><label htmlFor="outlet-latitude">Latitude</label><input id="outlet-latitude" type="number" step="any" min="-90" max="90" value={latitude} onChange={event => setLatitude(event.target.value)} required disabled={save.isPending} /></div>
    <div><label htmlFor="outlet-longitude">Longitude</label><input id="outlet-longitude" type="number" step="any" min="-180" max="180" value={longitude} onChange={event => setLongitude(event.target.value)} required disabled={save.isPending} /></div></div>
    <div><label htmlFor="outlet-location-label">Receiving location label (optional)</label><input id="outlet-location-label" value={label} maxLength={120} onChange={event => setLabel(event.target.value)} disabled={save.isPending} placeholder="Receiving dock or entrance" /></div>
    <div><label htmlFor="outlet-location-source">Coordinate source / reason</label><textarea id="outlet-location-source" value={reason} maxLength={450} minLength={5} onChange={event => setReason(event.target.value)} required disabled={save.isPending} placeholder="How these coordinates were confirmed" rows={2} /></div>
    <button className="btn primary" disabled={save.isPending}>{save.isPending ? 'Saving location…' : 'Save outlet location'}</button>{error && <p className="error-notice" role="alert">{error}</p>}
  </form>;
}
export function LocationEditor({ data }: { data: TripLocation }) {
  const stops = data.stops.filter((stop, index, all) => all.findIndex(item => item.outletId === stop.outletId) === index);
  const [selected, setSelected] = useState(stops[0]?.outletId || '');
  const stop = stops.find(item => item.outletId === selected) || stops[0];
  if (!stop) return null;
  return <details className="location-setup"><summary>Set outlet coordinates</summary><div><label htmlFor="location-outlet">Outlet</label><select id="location-outlet" value={stop.outletId} onChange={event => setSelected(event.target.value)}>{stops.map(item => <option key={item.outletId} value={item.outletId}>{item.outletRef + (item.location ? ' · recorded' : ' · not recorded')}</option>)}</select></div>
    <LocationForm key={stop.outletId + ':' + (stop.location?.version || 0)} stop={stop} />
  </details>;
}
