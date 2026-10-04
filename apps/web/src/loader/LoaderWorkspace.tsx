import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLoaderLoads } from './api';
import { dateLabel, LoaderChip, LoaderState } from './components';
import { LoadsPage } from './Loads';
import { LoadDetailPage } from './LoadDetail';
import { LoaderExceptionsPage } from './Exceptions';
import { useLoaderParams } from './url';
import './loader.css';

export function LoaderWorkspace({ page }: { page: string }) {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const { update } = useLoaderParams();
  const requestedDate = params.get('date') || undefined;
  const loads = useLoaderLoads(requestedDate);
  useEffect(() => {
    if (!loads.data) return;
    const next = new URLSearchParams(params);
    if (!requestedDate) next.set('date', loads.data.selectedDate);
    if (page === 'load-detail' && !params.get('trip') && loads.data.trips[0]) next.set('trip', loads.data.trips[0].id);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [requestedDate, loads.data, page, params, setParams]);
  if (loads.isPending) return <div className="loader-workspace"><LoaderState title="Connecting your loading dock…" message="Looking for released manifests in your assigned depots." /></div>;
  if (loads.isError) return <div className="loader-workspace"><LoaderState error title="Loader workspace unavailable" message={loads.error.message}><button className="btn primary" onClick={() => void loads.refetch()}>Try again</button><button className="btn secondary" onClick={() => update({ date: undefined, trip: undefined })}>Use default operational day</button></LoaderState></div>;
  const data = loads.data;
  const tripId = params.get('trip') || data.trips[0]?.id;
  return <div className="loader-workspace"><section className="loader-context" aria-label="Loader operational date and depot scope"><div><span className="eyebrow">YOUR ASSIGNED LOADING DEPOT</span><strong>{dateLabel(data.selectedDate)}</strong><p>{data.depots.map(depot => depot.name).join(' · ')} · Sri Lanka time</p></div><div className="loader-context-controls"><div className="loader-field"><label htmlFor="loader-date">Operational date</label><input id="loader-date" type="date" value={data.selectedDate} list="loader-dates" onChange={event => update({ date: event.target.value || undefined, trip: undefined })} /><datalist id="loader-dates">{data.availableDates.map(date => <option key={date} value={date} />)}</datalist></div><button className="icon-button" type="button" aria-label="Refresh released loads" disabled={loads.isFetching} onClick={() => void client.invalidateQueries({ queryKey: ['loader'] })}><RefreshCw size={19} /></button></div></section>{data.trips.some(trip => trip.vehicle.source === 'SYNTHETIC') && <LoaderChip label="SYNTHETIC · independent judge records" tone="amber" />}{page === 'load-detail' ? <LoadDetailPage tripId={tripId} selectedDate={data.selectedDate} /> : page === 'exceptions' ? <LoaderExceptionsPage data={data} /> : <LoadsPage data={data} />}</div>;
}
