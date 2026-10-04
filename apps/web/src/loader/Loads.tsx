import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Snowflake, Truck } from 'lucide-react';
import type { LoaderLoadList, LoaderLoadState, LoaderTripSummary } from '@waypoint/shared';
import { dateLabel, LoaderChip, LoaderFacts, LoaderState, sentenceCase } from './components';
import { loaderLink, useLoaderParams } from './url';

export const LOAD_STATE_LABELS: Record<LoaderLoadState, string> = {
  NOT_STARTED: 'Not started', LOADING: 'Loading', COMPLETE: 'Complete', AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED_REVISION: 'Approved revision', CORRECTION_REQUIRED: 'Correction required', READY_FOR_DISPATCH: 'Ready for dispatch'
};
export function LoadStateChip({ state }: { state: LoaderLoadState }) {
  return <LoaderChip label={LOAD_STATE_LABELS[state]} tone={state === 'AWAITING_APPROVAL' || state === 'CORRECTION_REQUIRED' ? 'amber' : ['COMPLETE', 'APPROVED_REVISION', 'READY_FOR_DISPATCH'].includes(state) ? 'green' : state === 'LOADING' ? 'blue' : 'gray'} />;
}
export function LoadingProgress({ trip }: { trip: LoaderTripSummary }) {
  return <div className="loader-progress"><div><span>Loading checklist</span><strong>{trip.completedStops} / {trip.stopCount} complete</strong></div><progress max={Math.max(1, trip.stopCount)} value={trip.completedStops} aria-label={`${trip.completedStops} of ${trip.stopCount} stop loads complete`} /></div>;
}
function DockCard({ trip }: { trip: LoaderTripSummary }) {
  const { params } = useLoaderParams();
  return <article className="loader-dock-card"><header className="loader-card-vehicle"><span>{trip.vehicle.temperatureCapability === 'REEFER' ? <Snowflake size={26} /> : <Truck size={26} />}</span><div><strong>{trip.vehicle.vehicleRef} · Trip {trip.tripNumber}</strong><small>{sentenceCase(trip.vehicle.type)} · {sentenceCase(trip.vehicle.temperatureCapability)} capability</small></div></header><div className="loader-card-body"><div className="loader-card-state"><LoadStateChip state={trip.loadingState} /><span>{trip.stopCount} stops</span></div><LoaderFacts facts={[
    ['Originally ordered', `${trip.orderedUnits.toLocaleString()} units`], ['Expected load', `${trip.expectedUnits.toLocaleString()} units`], ['Ordered weight', `${trip.orderedWeightKg} kg`], ['Ordered volume', `${trip.orderedVolumeM3} m³`], ['Recorded load', `${trip.loadedUnits.toLocaleString()} units`], ['Operational date', dateLabel(trip.serviceDate)]
  ]} /><p className="loader-note">Required: {trip.temperatureRequirements.map(sentenceCase).join(' · ')}</p><LoadingProgress trip={trip} /><p className={`loader-note ${trip.canMarkReady || trip.loadingState === 'READY_FOR_DISPATCH' ? 'success' : trip.shortfallStops ? 'warning' : ''}`}><strong>Departure readiness</strong>{trip.loadingState === 'READY_FOR_DISPATCH' ? 'Ready for dispatch is recorded.' : trip.canMarkReady ? 'All required loads are recorded. Mark this trip ready in Load Detail.' : trip.readinessBlockers.join(' · ') || 'Complete the loading checklist.'}</p><Link className="btn primary" to={loaderLink('load-detail', params, trip.id)}>Open Load<ArrowRight size={17} /></Link></div></article>;
}
export function LoadsPage({ data }: { data: LoaderLoadList }) {
  const [search, setSearch] = useState('');
  const trips = data.trips.filter(trip => `${trip.tripRef} ${trip.vehicle.vehicleRef}`.toLowerCase().includes(search.toLowerCase().trim()));
  const counts = [['Released loads', data.trips.length], ['Expected units', data.trips.reduce((sum, trip) => sum + trip.expectedUnits, 0)], ['Awaiting approval', data.trips.filter(trip => trip.loadingState === 'AWAITING_APPROVAL').length], ['Ready for dispatch', data.trips.filter(trip => trip.loadingState === 'READY_FOR_DISPATCH').length]];
  return <><section className="loader-dock-banner"><div><span className="eyebrow">RELEASED MANIFESTS · LOADING DOCK</span><h2>Every load. One shared manifest.</h2><p>Check the actual stop sequence, record counted units and keep Dispatcher informed when a load falls short.</p></div><ClipboardList size={45} strokeWidth={1.3} /></section><section className="loader-metrics" aria-label="Released load totals">{counts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong></div>)}</section><div className="loader-toolbar"><div className="loader-field"><label htmlFor="loader-search">Find vehicle or trip</label><input id="loader-search" type="search" value={search} maxLength={80} onChange={event => setSearch(event.target.value)} placeholder="Vehicle or trip reference" /></div><LoaderChip label={`${trips.length} released loads`} tone="blue" /></div>{trips.length ? <div className="loader-grid">{trips.map(trip => <DockCard key={trip.id} trip={trip} />)}</div> : <LoaderState title={data.trips.length ? 'No loads match this search' : 'No released loads for this day'} message={data.trips.length ? 'Try a different vehicle or trip reference.' : 'Dispatcher must generate, validate and release a plan for your assigned depot before its trips appear here.'} />}</>;
}
