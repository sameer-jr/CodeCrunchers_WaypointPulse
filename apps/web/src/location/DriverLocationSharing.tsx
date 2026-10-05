import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LocateFixed, MapPinOff } from 'lucide-react';
import type { DriverTripDetail, TripPositionInput } from '@waypoint/shared';
import { apiRequest } from '../api';
import { useIdentity } from '../auth';
import { captureDriverSession, driverSessionIsCurrent } from '../offline/session';
import { timeLabel } from '../store/components';
import './location.css';

export function DriverLocationSharing({ trip, online }: { trip: DriverTripDetail; online: boolean }) {
  const identity = useIdentity(), client = useQueryClient();
  const userId = identity.data?.role === 'DRIVER' ? identity.data.id : undefined;
  const [sharing, setSharing] = useState(false), [visible, setVisible] = useState(!document.hidden);
  const [error, setError] = useState<string | null>(null), [sentAt, setSentAt] = useState<string | null>(null);
  useEffect(() => { const update = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  const available = trip.status === 'IN_TRANSIT' && !!userId;
  useEffect(() => {
    if (!sharing || !available || !online || !visible || !userId) return;
    if (!navigator.geolocation || !window.isSecureContext) { setError('Location sharing requires a supported browser on HTTPS or localhost.'); setSharing(false); return; }
    const generation = captureDriverSession();
    let active = true, lastAttempt = 0, sending = false;
    const watch = navigator.geolocation.watchPosition(position => {
      if (!active || sending || !driverSessionIsCurrent(generation, userId) || document.hidden || !navigator.onLine || Date.now() - lastAttempt < 10000) return;
      const input: TripPositionInput = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMetres: position.coords.accuracy, eventAt: new Date(position.timestamp).toISOString() };
      lastAttempt = Date.now(); sending = true;
      void apiRequest('/location/trips/' + encodeURIComponent(trip.id) + '/position', { method: 'POST', body: JSON.stringify(input) })
        .then(() => { if (active && driverSessionIsCurrent(generation, userId)) { setError(null); setSentAt(input.eventAt); void client.invalidateQueries({ queryKey: ['location'] }); } })
        .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Location could not be sent. Delivery recording remains available.'); })
        .finally(() => { sending = false; });
    }, failure => {
      if (!active) return;
      setError(failure.code === failure.PERMISSION_DENIED ? 'Location permission was denied. Allow it in browser settings to share your position.' : 'GPS is unavailable. Location sharing will retry; delivery recording remains available.');
      if (failure.code === failure.PERMISSION_DENIED) setSharing(false);
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    return () => { active = false; navigator.geolocation.clearWatch(watch); };
  }, [sharing, available, online, visible, userId, trip.id, client]);
  if (!available) return null;
  const paused = sharing && (!online || !visible);
  return <section className="location-sharing" aria-label="Driver location sharing"><div><strong>{sharing ? paused ? 'Location sharing paused' : 'Location sharing on' : 'Share vehicle location'}</strong><p>{sharing ? paused ? 'Updates resume when you reconnect and return to the app.' : sentAt ? 'Last sent ' + timeLabel(sentAt) : 'Waiting for a GPS reading…' : 'Optional. Dispatcher and your delivery Store can see your reported position during this trip.'}</p></div>
    <button type="button" className={'btn ' + (sharing ? 'secondary' : 'primary')} disabled={!online && !sharing} onClick={() => { setError(null); setSharing(value => !value); }}>{sharing ? <MapPinOff size={17} /> : <LocateFixed size={17} />}{sharing ? 'Stop sharing' : 'Share location'}</button>
    <p className="location-note">Updates run while this app is visible. Locking the phone, leaving the workspace or reloading stops or pauses updates. Delivery works without location permission.</p>{error && <p className="error-notice" role="alert">{error}</p>}
  </section>;
}
