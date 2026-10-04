import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3 } from 'lucide-react';
import type { DispatcherContext } from '@waypoint/shared';
import { usePlanning } from './api';
import { EmptyState, ErrorState, Facts, LoadingState, Panel } from './components';
import { dispatcherLink, useDispatcherParams } from './url';

export function FuturePage({ context }: { context: DispatcherContext }) {
  const { params } = useDispatcherParams();
  const data = usePlanning(context);
  if (data.isPending) return <LoadingState message="Loading reference context…" />;
  if (data.isError) return <ErrorState error={data.error} retry={() => void data.refetch()} />;
  return <div className="dispatch-stack"><div className="dispatch-page-actions"><p className="dispatch-helper">Future predictions remain separate from persisted operational records.</p><Link className="btn secondary" to={dispatcherLink('pulse', params)}>Back to Pulse<ArrowRight size={16} /></Link></div><div className="dispatch-two-column"><Panel kicker="CURRENT REFERENCE CONTEXT" title="What the records already show"><div className="dispatch-panel-body"><Facts facts={[
    ['Eligible confirmed chilled requests', data.data.calendarEligibility === 'UNKNOWN' ? 'Calendar eligibility unknown' : data.data.totals.chilled.toLocaleString()], ['Eligible confirmed frozen requests', data.data.calendarEligibility === 'UNKNOWN' ? 'Calendar eligibility unknown' : data.data.totals.frozen.toLocaleString()], ['Reefer master vehicles', data.data.fleet.reefer.toLocaleString()], ['Reefer master volume capacity', `${data.data.fleet.reeferVolumeCapacityM3} m³`]
  ]} /><p className="dispatch-note neutral">These are calendar-eligible confirmed demand and vehicle master facts for the selected day. Operational availability is unknown.</p></div></Panel><Panel kicker="FUTURE CAPACITY" title="Prediction outputs are not connected" action={<BarChart3 size={22} />}><EmptyState title="No prediction outputs available" message="Future demand, service-time and lateness predictions are not connected in this build. This view does not generate forecasts." /></Panel></div></div>;
}
