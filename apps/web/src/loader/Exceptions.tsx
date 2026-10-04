import { Link } from 'react-router-dom';
import type { LoaderLoadList } from '@waypoint/shared';
import { useLoaderTrip } from './api';
import { LoaderFacts, LoaderPanel, LoaderState, sentenceCase, timeLabel } from './components';
import { LoadStateChip } from './Loads';
import { loaderLink, useLoaderParams } from './url';

function TripIssues({ id }: { id: string }) {
  const query = useLoaderTrip(id);
  const { params } = useLoaderParams();
  if (query.isPending) return <LoaderState title="Loading issue records…" message="Checking the recorded manifest revisions." />;
  if (query.isError) return <LoaderState error title="Unable to load exceptions" message={query.error.message}><button className="btn secondary" onClick={() => void query.refetch()}>Try again</button></LoaderState>;
  const trip = query.data;
  const stops = trip.stops.filter(stop => stop.load && (stop.load.reviewStatus !== 'NOT_REQUIRED' || stop.exceptions.length));
  return <LoaderPanel kicker={`${trip.vehicle.vehicleRef} · TRIP ${trip.tripNumber}`} title="Recorded loading issues" action={<LoadStateChip state={trip.loadingState} />}><div className="loader-shortfall-list">{stops.map(stop => <article className="loader-shortfall-row" key={stop.id}><strong>{stop.order.orderRef} · {stop.order.outlet.outletRef}</strong><LoadStateChip state={stop.loadingState} /><LoaderFacts facts={[[ 'Originally ordered', `${stop.order.orderedUnits} units` ], ['Actually loaded', stop.load?.loadedUnits === null ? 'Not recorded' : `${stop.load?.loadedUnits} units`], ['Revision review', sentenceCase(stop.load?.reviewStatus || 'PENDING')], ['Reason', stop.load?.reasonCode ? sentenceCase(stop.load.reasonCode) : 'Not recorded']]} />{stop.load?.note && <p>{stop.load.note}</p>}{stop.exceptions.map(issue => <p key={issue.id}><strong>{sentenceCase(issue.status)} · {sentenceCase(issue.type)}</strong>{issue.message} · {timeLabel(issue.createdAt)}</p>)}</article>)}<Link className="btn secondary" to={loaderLink('load-detail', params, trip.id)}>Open loading checklist</Link></div></LoaderPanel>;
}
export function LoaderExceptionsPage({ data }: { data: LoaderLoadList }) {
  const trips = data.trips.filter(trip => trip.shortfallStops > 0 || ['AWAITING_APPROVAL', 'APPROVED_REVISION', 'CORRECTION_REQUIRED'].includes(trip.loadingState));
  return <><p className="loader-note warning">Shortfalls keep a trip blocked until Dispatcher reviews the manifest. Rejected revisions require a corrected load record.</p>{trips.length ? trips.map(trip => <TripIssues key={trip.id} id={trip.id} />) : <LoaderState title="No loading shortfalls for this day" message="Loading shortfalls and revision decisions will appear here when a released load is recorded with fewer units than ordered." />}</>;
}
