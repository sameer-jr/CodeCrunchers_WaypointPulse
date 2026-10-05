import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Role } from '@waypoint/shared';
import { dateLabel } from './store/components';

export interface PublicJudgeGuide {
  executionDate: string;
  planningDate: string;
  historyDate: string;
  completedExample?: { orderId: string; tripId: string; stopId?: string };
}

export function JudgeReviewGuide({ role, guide }: { role: Role; guide: PublicJudgeGuide }) {
  const execution = `date=${encodeURIComponent(guide.executionDate)}`;
  const planning = `date=${encodeURIComponent(guide.planningDate)}`;
  const history = `date=${encodeURIComponent(guide.historyDate)}`;
  const completedOrder = guide.completedExample ? `&order=${encodeURIComponent(guide.completedExample.orderId)}` : '';
  const completedTrip = guide.completedExample ? `&trip=${encodeURIComponent(guide.completedExample.tripId)}` : '';
  const completedStop = guide.completedExample?.stopId ? `&stop=${encodeURIComponent(guide.completedExample.stopId)}` : '';
  const links: Record<Role, { label: string; description: string; to: string }[]> = {
    DISPATCHER: [
      { label: 'Try fresh planning', description: dateLabel(guide.planningDate), to: `/dispatcher/planning?${planning}` },
      { label: 'Review execution routes', description: dateLabel(guide.executionDate), to: `/dispatcher/routes?${execution}` },
      { label: 'View completed history', description: dateLabel(guide.historyDate), to: guide.completedExample ? `/dispatcher/orders?${history}${completedOrder}` : `/dispatcher/routes?${history}` }
    ],
    LOADER: [
      { label: 'Open loading workflow', description: `Review manifests and record actual loads · ${dateLabel(guide.executionDate)}`, to: `/loader/loads?${execution}` },
      { label: 'Review loading exceptions', description: dateLabel(guide.executionDate), to: `/loader/exceptions?${execution}` }
    ],
    DRIVER: [
      { label: 'Open assigned routes', description: `Start an eligible loaded trip · ${dateLabel(guide.executionDate)}`, to: `/driver/today?${execution}` },
      { label: 'View completed proof', description: dateLabel(guide.historyDate), to: `/driver/proof?${history}${completedTrip}${completedStop}` }
    ],
    STORE_MANAGER: [
      { label: 'Track current deliveries', description: dateLabel(guide.executionDate), to: `/store/tracking?${execution}` },
      { label: 'Review completed receipts', description: dateLabel(guide.historyDate), to: `/store/tracking?${history}&status=RECEIPT_CONFIRMED${completedOrder}` },
      { label: 'Create a delivery request', description: dateLabel(guide.planningDate), to: `/store/place-order?${planning}` }
    ]
  };
  return <section className="judge-review-guide" aria-labelledby="judge-review-title"><div><span className="eyebrow">COMPETITION DEMO</span><h2 id="judge-review-title">Competition review guide</h2><p>Explore the workflows with synthetic demo records. Saved changes are shared across the four role accounts.</p></div><div className="judge-review-links">{links[role].map(link => <Link key={link.to} to={link.to}><span><strong>{link.label}</strong><small>{link.description}</small></span><ArrowRight size={17} /></Link>)}</div></section>;
}
