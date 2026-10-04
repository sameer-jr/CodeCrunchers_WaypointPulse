import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { DispatcherContext } from '@waypoint/shared';
import { ApiFailure } from '../api';
import { useDispatcherContext } from './api';
import { dateLabel, ErrorState, LoadingState } from './components';
import { useDispatcherParams } from './url';
import { PulsePage } from './Pulse';
import { OrdersPage } from './Orders';
import { PlanningPage } from './Planning';
import { RoutesPage } from './Routes';
import { ExceptionsPage } from './Exceptions';
import { FuturePage } from './Future';
import './dispatcher.css';

function OperationalContext({ context }: { context: DispatcherContext }) {
  const { update } = useDispatcherParams();
  return <section className="dispatch-context" aria-label="Operational date and depot scope"><div><span className="eyebrow">OPERATIONAL DAY</span><strong>{dateLabel(context.selectedDate)}</strong><p>{context.depots.map(depot => depot.name).join(' · ')} · Sri Lanka time</p></div><div className="dispatch-context-controls"><div className="dispatch-field"><label htmlFor="dispatch-date">Selected operational date</label><input id="dispatch-date" type="date" value={context.selectedDate} list="dispatch-available-dates" onChange={event => update({ date: event.target.value || undefined, orderPage: undefined, tripPage: undefined, exceptionPage: undefined, order: undefined, trip: undefined, exception: undefined, plan: undefined, planOrder: undefined, planPage: undefined }, false)} /><datalist id="dispatch-available-dates">{context.availableDates.map(date => <option key={date} value={date} />)}</datalist></div><span className={`store-chip ${context.calendar?.source === 'SYNTHETIC' ? 'amber' : context.calendar ? 'green' : 'gray'}`}>{context.calendar ? `${context.calendar.source === 'SYNTHETIC' ? 'SYNTHETIC · ' : ''}${context.calendar.operatingDay ? 'Operating day' : 'Non-operating day'}` : 'No calendar record'}</span></div></section>;
}
export function DispatcherWorkspace({ page }: { page: string }) {
  const [params, setParams] = useSearchParams();
  const requestedDate = params.get('date') || undefined;
  const context = useDispatcherContext(requestedDate);
  useEffect(() => {
    if (!requestedDate && context.data) { const next = new URLSearchParams(params); next.set('date', context.data.selectedDate); setParams(next, { replace: true }); }
  }, [requestedDate, context.data, params, setParams]);
  if (context.isPending) return <div className="dispatcher-workspace"><LoadingState message="Connecting your Dispatcher workspace…" /></div>;
  if (context.isError) return <div className="dispatcher-workspace">{context.error instanceof ApiFailure && context.error.status === 403 ? <section className="dispatch-state"><ShieldCheck size={29} /><h2>Your depot scope is not assigned yet</h2><p>A depot assignment is required to review orders, trips and issues. Contact your administrator to assign your Dispatcher account.</p><button className="btn secondary" onClick={() => void context.refetch()}>Check assignment again</button></section> : <ErrorState error={context.error} retry={() => void context.refetch()}><button className="btn secondary" onClick={() => { const next = new URLSearchParams(params); next.delete('date'); setParams(next); }}>Use default operational date</button></ErrorState>}</div>;
  return <div className="dispatcher-workspace"><OperationalContext context={context.data} />{page === 'orders' ? <OrdersPage context={context.data} /> : page === 'planning' ? <PlanningPage context={context.data} /> : page === 'routes' ? <RoutesPage context={context.data} /> : page === 'exceptions' ? <ExceptionsPage context={context.data} /> : page === 'capacity' ? <FuturePage context={context.data} /> : <PulsePage context={context.data} />}</div>;
}
