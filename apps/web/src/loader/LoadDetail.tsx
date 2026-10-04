import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Truck } from 'lucide-react';
import type { LoaderStop, LoaderTripDetail, RecordStopLoadInput } from '@waypoint/shared';
import { LOADER_KEYS, markTripReady, recordStopLoad, useLoaderTrip } from './api';
import { dateLabel, LoaderChip, LoaderFacts, LoaderPanel, LoaderState, sentenceCase, timeLabel } from './components';
import { LoadingProgress, LoadStateChip } from './Loads';
import { loadVersionInput, ShortfallDialog, type LoadSelection } from './ShortfallDialog';
import { loaderLink, useLoaderParams } from './url';

function StopCard({ stop, busy, record, shortfall }: { stop: LoaderStop; busy: boolean; record: () => void; shortfall: () => void }) {
  const outlet = stop.order.outlet;
  const revised = stop.load?.loadedUnits !== null && stop.load?.loadedUnits !== undefined && stop.load.loadedUnits < stop.order.orderedUnits;
  return <li className="loader-stop-card"><span className="loader-sequence" aria-label={`Stop ${stop.sequence}`}>{stop.sequence}</span><div className="loader-stop-content"><header className="loader-stop-heading"><h3>{stop.order.orderRef} · {outlet.outletRef}</h3><LoadStateChip state={stop.loadingState} /></header><p className="loader-stop-copy">Waypoint {sentenceCase(outlet.brand)} · {outlet.district}{stop.plannedArrival ? ` · Planned arrival ${timeLabel(stop.plannedArrival)}` : ''}</p><LoaderFacts facts={[
    ['Expected / ordered', `${stop.order.orderedUnits.toLocaleString()} units`], ['Actually loaded', stop.load?.loadedUnits === null || stop.load?.loadedUnits === undefined ? 'Not recorded' : `${stop.load.loadedUnits.toLocaleString()} units`], ['Ordered weight', `${stop.order.orderedWeightKg} kg`], ['Ordered volume', `${stop.order.orderedVolumeM3} m³`], ['Required temperature', sentenceCase(stop.order.temperatureRequirement)], ['Access / dock', `${sentenceCase(outlet.accessConstraint)} · ${sentenceCase(outlet.dockType)}`]
  ]} />{stop.load && <div className="loader-saved-record"><strong>Load record · Revision {stop.load.revision}</strong>{stop.load.recordedAt && <p>Recorded {timeLabel(stop.load.recordedAt)}</p>}{stop.load.recordedByUserId && <p>Recorded by {stop.load.recordedByUserId}</p>}</div>}{revised && <div className={`loader-note ${stop.load?.reviewStatus === 'APPROVED' ? 'success' : 'warning'}`}><LoaderChip label="Shortfall" tone="red" /><p>{stop.load?.reasonCode ? sentenceCase(stop.load.reasonCode) : 'Loading shortfall'}{stop.load?.note ? ` · ${stop.load.note}` : ''}</p><strong>{stop.load?.reviewStatus === 'APPROVED' ? 'Dispatcher approved this revision' : stop.load?.reviewStatus === 'REJECTED' ? 'Dispatcher requested correction' : 'Awaiting Dispatcher approval'}</strong>{stop.load?.reviewedAt && <p>Reviewed {timeLabel(stop.load.reviewedAt)}</p>}</div>}{stop.canRecord && <div className="loader-stop-actions"><button type="button" className="btn primary" disabled={busy} onClick={record}>{stop.load?.reviewStatus === 'REJECTED' ? 'Record corrected full load' : 'Mark Loaded'}<CheckCircle2 size={16} /></button><button type="button" className="btn secondary" disabled={busy || stop.order.orderedUnits <= 1} onClick={shortfall}>{stop.load?.reviewStatus === 'REJECTED' ? 'Revise shortfall' : 'Report Shortfall'}</button></div>}</div></li>;
}
function TripManifest({ trip, checking }: { trip: LoaderTripDetail; checking: boolean }) {
  const client = useQueryClient();
  const { params } = useLoaderParams();
  const [selection, setSelection] = useState<LoadSelection | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const refresh = async (saved: LoaderTripDetail) => {
    client.setQueryData(LOADER_KEYS.trip(saved.id), saved);
    await Promise.all(['loader', 'dispatcher', 'store'].map(key => client.invalidateQueries({ queryKey: [key] })));
  };
  const load = useMutation({ mutationFn: ({ stopId, input }: { stopId: string; input: RecordStopLoadInput }) => recordStopLoad(stopId, input), onSuccess: async saved => {
    setSelection(null); setSuccess('Load record saved. The manifest and readiness checks are updated.'); await refresh(saved);
  }, onError: () => { void client.invalidateQueries({ queryKey: LOADER_KEYS.trip(trip.id) }); } });
  const ready = useMutation({ mutationFn: () => markTripReady(trip.id, trip.version), onSuccess: async saved => {
    setSuccess('Ready for dispatch is recorded.'); await refresh(saved);
  }, onError: () => { void client.invalidateQueries({ queryKey: LOADER_KEYS.trip(trip.id) }); } });
  const busy = load.isPending || ready.isPending;
  const currentStop = selection && trip.stops.find(stop => stop.id === selection.stop.id);
  const unchanged = !!selection && !!currentStop && trip.version === selection.tripVersion && currentStop.order.version === selection.stop.order.version && currentStop.updatedAt === selection.stop.updatedAt && (currentStop.load?.revision ?? 0) === (selection.stop.load?.revision ?? 0) && currentStop.canRecord;
  const normal = (stop: LoaderStop) => {
    setSuccess(null); load.reset(); ready.reset();
    load.mutate({ stopId: stop.id, input: { ...loadVersionInput({ stop, tripVersion: trip.version }), loadedUnits: stop.order.orderedUnits } });
  };
  return <><div className="loader-detail-actions"><p>{trip.tripRef} · {dateLabel(trip.serviceDate)}</p><Link className="btn secondary" to={loaderLink('loads', params)}><ArrowLeft size={16} />Today's Loads</Link></div><section className="loader-dock-banner"><div><span className="eyebrow">RELEASED PLAN · {sentenceCase(trip.status)}</span><h2>{trip.vehicle.vehicleRef} · Trip {trip.tripNumber}</h2><p>{trip.vehicle.depot.name} · {trip.stopCount} stops · {trip.expectedUnits.toLocaleString()} expected units{trip.plannedDeparture ? ` · Planned departure ${timeLabel(trip.plannedDeparture)}` : ''}</p></div><Truck size={45} strokeWidth={1.4} /></section>{success && <p className="loader-note success" role="status">{success}</p>}{!selection && load.isError && <p className="error-notice" role="alert">{load.error.message}</p>}<div className="loader-detail-layout"><LoaderPanel kicker="STOP SEQUENCE · LOADING CHECKLIST" title={`${trip.stopCount} shipments in planned delivery order`} action={<LoadStateChip state={trip.loadingState} />}><ol className="loader-manifest">{trip.stops.map(stop => <StopCard key={stop.id} stop={stop} busy={busy || checking} record={() => normal(stop)} shortfall={() => { load.reset(); ready.reset(); setSuccess(null); setSelection({ stop, tripVersion: trip.version }); }} />)}</ol></LoaderPanel><aside><LoaderPanel kicker="VEHICLE & MANIFEST" title="Dispatch readiness"><div className="loader-panel-body"><LoaderFacts facts={[
    ['Vehicle', `${sentenceCase(trip.vehicle.type)} · ${sentenceCase(trip.vehicle.temperatureCapability)}`], ['Weight capacity', `${trip.vehicle.weightCapacityKg} kg`], ['Volume capacity', `${trip.vehicle.volumeCapacityM3} m³`], ['Expected load', `${trip.expectedUnits.toLocaleString()} units`], ['Recorded load', `${trip.loadedUnits.toLocaleString()} units`], ['Temperature requirements', trip.temperatureRequirements.map(sentenceCase).join(' · ')]
  ]} /><LoadingProgress trip={trip} /><div className={`loader-note ${trip.canMarkReady || trip.loadingState === 'READY_FOR_DISPATCH' ? 'success' : 'warning'}`}><strong>{trip.loadingState === 'READY_FOR_DISPATCH' ? 'Ready for dispatch' : trip.canMarkReady ? 'Loading complete' : 'Trip remains blocked'}</strong>{trip.loadingState === 'READY_FOR_DISPATCH' ? 'The ready state is saved. Departure has not been recorded.' : trip.canMarkReady ? 'Every required load is complete and all manifest revisions have been approved.' : <ul>{trip.readinessBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}</div>{ready.isError && <p className="error-notice" role="alert">{ready.error.message}</p>}<button className="btn primary" disabled={!trip.canMarkReady || busy || checking} onClick={() => { setSuccess(null); load.reset(); ready.mutate(); }}>{ready.isPending ? 'Recording readiness…' : trip.loadingState === 'READY_FOR_DISPATCH' ? 'Ready for Dispatch Recorded' : 'Mark Ready for Dispatch'}<CheckCircle2 size={17} /></button><p className="loader-note">Ordered, loaded, delivered and received quantities are separate records. Count goods before recording each load.</p></div></LoaderPanel></aside></div>{selection && <ShortfallDialog selection={selection} unchanged={unchanged} checking={checking} busy={load.isPending} error={load.error} close={() => { if (!load.isPending) { setSelection(null); load.reset(); } }} submit={input => { if (unchanged) load.mutate({ stopId: selection.stop.id, input }); }} />}</>;
}
export function LoadDetailPage({ tripId, selectedDate }: { tripId?: string; selectedDate: string }) {
  const { params } = useLoaderParams();
  const query = useLoaderTrip(tripId);
  if (!tripId) return <LoaderState title="Select a released load" message="Open a vehicle from Today's Loads to inspect its stop sequence and loading checklist."><Link className="btn primary" to={loaderLink('loads', params)}>View Today's Loads</Link></LoaderState>;
  if (query.isPending) return <LoaderState title="Loading manifest…" message="Connecting to your released trip and loading records." />;
  if (query.isError) return <LoaderState error title="Unable to open this load" message={query.error.message}><button className="btn primary" onClick={() => void query.refetch()}>Try again</button><Link className="btn secondary" to={loaderLink('loads', params)}>Choose another load</Link></LoaderState>;
  if (query.data.serviceDate !== selectedDate) return <LoaderState title="This trip belongs to another operational day" message="Choose a trip from Today's Loads for the selected date."><Link className="btn primary" to={loaderLink('loads', params)}>View selected day</Link></LoaderState>;
  return <TripManifest key={query.data.id} trip={query.data} checking={query.isFetching} />;
}
