import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Clock3, FileCheck2, Package, TriangleAlert } from 'lucide-react';
import type { StoreOrderDetail, StoreOrderStatus, StoreOrderSummary, StoreOutlet } from '@waypoint/shared';

export const STATUS_LABELS: Record<StoreOrderStatus, string> = {
  DRAFT: 'Draft', CONFIRMED: 'Awaiting planning', CLOSED_FOR_PLANNING: 'Awaiting planning', PLANNED: 'Planned', DEFERRED: 'Deferred',
  RELEASED_TO_LOADING: 'Ready for loading', LOADING: 'Loading', LOADING_EXCEPTION: 'Loading issue', READY_FOR_DISPATCH: 'Ready for dispatch',
  IN_TRANSIT: 'In transit', ARRIVED: 'Arrived', DELIVERED: 'Delivered', PARTIALLY_DELIVERED: 'Partial delivery', DELIVERY_FAILED: 'Delivery issue',
  AWAITING_RECEIPT: 'Awaiting receipt', RECEIPT_CONFIRMED: 'Receipt confirmed', RECEIPT_ISSUE: 'Receipt issue'
};
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-LK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}
export function timeLabel(value: string) {
  return new Intl.DateTimeFormat('en-LK', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Colombo' }).format(new Date(value));
}
export function clockLabel(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
export function sentenceCase(value: string) { const text = value.toLowerCase().replaceAll('_', ' '); return text[0].toUpperCase() + text.slice(1); }
export function orderLink(order: Pick<StoreOrderSummary, 'id'>, page = 'tracking') { return `/store/${page}?order=${encodeURIComponent(order.id)}`; }
export function StatusChip({ status }: { status: StoreOrderStatus }) {
  const tone = ['RECEIPT_ISSUE', 'LOADING_EXCEPTION', 'DELIVERY_FAILED'].includes(status) ? 'red' : ['DEFERRED', 'PARTIALLY_DELIVERED', 'AWAITING_RECEIPT'].includes(status) ? 'amber' : ['DELIVERED', 'RECEIPT_CONFIRMED', 'READY_FOR_DISPATCH'].includes(status) ? 'green' : 'blue';
  return <span className={`store-chip ${tone}`}>{STATUS_LABELS[status]}</span>;
}
export function Panel({ kicker, title, action, children, className = '' }: { kicker?: string; title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`store-panel ${className}`}><div className="store-panel-head"><div>{kicker && <span className="eyebrow">{kicker}</span>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}
export function LoadingState({ message = 'Loading your outlet…' }: { message?: string }) {
  return <section className="store-state" role="status"><div className="loading-dot" /><h2>{message}</h2><p>Connecting to your saved orders and deliveries.</p></section>;
}
export function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  return <section className="store-state"><span className="store-state-icon"><TriangleAlert size={28} /></span><h2>Unable to load this view</h2><p role="alert">{error.message}</p><button className="btn primary" onClick={retry}>Try again</button></section>;
}
export function EmptyState({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return <div className="store-empty"><Package size={30} strokeWidth={1.5} /><h3>{title}</h3><p>{message}</p>{children}</div>;
}
export function OutletIdentity({ outlet, context }: { outlet: StoreOutlet; context?: string }) {
  return <div className="store-outlet-bar"><div><span className="eyebrow">YOUR ASSIGNED OUTLET</span><strong>{outlet.outletRef} <span>· Waypoint {sentenceCase(outlet.brand)}</span></strong><p>{outlet.district} · {outlet.depotName}{context ? ` · ${context}` : ''}</p></div>{outlet.source === 'SYNTHETIC' && <span className="store-chip amber">SYNTHETIC</span>}</div>;
}
export function OrderRow({ order, page = 'tracking' }: { order: StoreOrderSummary; page?: string }) {
  return <Link className="store-order-row" to={orderLink(order, page)}><span className="store-order-icon"><Package size={19} /></span><span className="store-order-copy"><strong>{order.orderRef}</strong><small>{dateLabel(order.eligibleDeliveryDate)} · {order.orderedUnits.toLocaleString()} units · {sentenceCase(order.temperatureRequirement)}</small></span><StatusChip status={order.status} /><ChevronRight size={17} /></Link>;
}
const EVENT_LABELS: Record<string, string> = { ORDER_CREATED: 'Order created', ORDER_CONFIRMED: 'Order confirmed', RECEIPT_CONFIRMED: 'Receipt confirmed', RECEIPT_ISSUE_REPORTED: 'Receipt issue reported' };
const TIMELINE_LABELS: Partial<Record<StoreOrderStatus, string>> = { CONFIRMED: 'Order confirmed', CLOSED_FOR_PLANNING: 'Closed for planning', RELEASED_TO_LOADING: 'Released to loading', READY_FOR_DISPATCH: 'Ready for dispatch' };
export function OrderTimeline({ order }: { order: StoreOrderDetail }) {
  return <div className="store-timeline"><ol>{order.timeline.map(event => <li className="recorded" key={event.id}><span className="store-timeline-node"><Check size={13} /></span><div><strong>{EVENT_LABELS[event.eventType] || (event.status ? TIMELINE_LABELS[event.status] || STATUS_LABELS[event.status] : sentenceCase(event.eventType))}</strong><p><time dateTime={event.timestamp}>{timeLabel(event.timestamp)}</time></p></div></li>)}{['CONFIRMED', 'CLOSED_FOR_PLANNING'].includes(order.status) && !order.trip && <li className="pending"><span className="store-timeline-node"><Clock3 size={14} /></span><div><strong>Awaiting planning</strong><p>A trip and planned arrival have not been assigned.</p></div></li>}</ol>{order.timeline.length === 0 && <p className="store-helper">No lifecycle events have been recorded yet.</p>}<p className="store-timeline-note">Recorded events · Sri Lanka time</p></div>;
}
export function Quantities({ order }: { order: StoreOrderSummary }) {
  return <div className="store-quantities">{[['Originally ordered', order.orderedUnits], ['Actually loaded', order.loadedUnits], ['Driver delivered', order.deliveredUnits], ['Store received', order.receivedUnits]].map(([label, quantity]) => <div key={String(label)}><span>{label}</span><strong>{typeof quantity === 'number' ? quantity.toLocaleString() : 'Not recorded'}</strong>{typeof quantity === 'number' && <small>units</small>}</div>)}</div>;
}
export function DeliveryEvidence({ order }: { order: StoreOrderDetail }) {
  const proof = order.delivery?.proof;
  return <Panel kicker="DELIVERY EVIDENCE" title="Proof of delivery" action={<span className={`store-chip ${proof ? 'green' : 'gray'}`}>{proof ? 'Metadata available' : 'Not recorded'}</span>}><div className="store-panel-body">{proof ? <><div className="store-proof-icon"><FileCheck2 size={29} /></div><dl className="store-facts"><div><dt>Recipient</dt><dd>{proof.recipientName || 'Not recorded'}</dd></div><div><dt>Recipient role</dt><dd>{proof.recipientRole || 'Not recorded'}</dd></div><div><dt>Photo metadata</dt><dd>{proof.hasPhoto ? 'Recorded' : 'Not recorded'}</dd></div><div><dt>Signature metadata</dt><dd>{proof.hasSignature ? 'Recorded' : 'Not recorded'}</dd></div></dl><p className="store-note neutral">Image and signature content is unavailable. Only saved evidence metadata is shown.</p></> : <EmptyState title="No proof metadata available" message={order.delivery ? 'The delivery is recorded, but no supporting proof metadata was saved.' : 'Delivery evidence will appear when a driver records it.'} />}{order.delivery?.driverNote && <div className="store-driver-note"><span className="eyebrow">DRIVER NOTE</span><p>{order.delivery.driverNote}</p></div>}</div></Panel>;
}
