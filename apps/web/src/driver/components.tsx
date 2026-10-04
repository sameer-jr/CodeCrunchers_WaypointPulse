import type { ReactNode } from 'react';
import { Package, TriangleAlert } from 'lucide-react';
import type { DriverStop, DriverTripDetail } from '@waypoint/shared';
export { dateLabel, sentenceCase, timeLabel, clockLabel } from '../store/components';

export type DriverAction = 'START_TRIP' | 'ARRIVAL' | 'COMPLETE_DELIVERY' | 'FINISH_TRIP';
export type ExecuteDriverAction = (action: DriverAction, entityId: string, input: Record<string, unknown>) => Promise<void>;
export function stopVersions(trip: DriverTripDetail, stop: DriverStop) {
  return { expectedTripVersion: trip.version, expectedStopVersion: stop.version, expectedOrderVersion: stop.order.version };
}
export function DriverPanel({ kicker, title, children, action }: { kicker: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="driver-panel"><header className="driver-panel-head"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div>{action}</header>{children}</section>;
}
export function DriverChip({ label, tone = 'gray' }: { label: string; tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' }) {
  return <span className={`driver-chip ${tone}`}>{label}</span>;
}
export function DriverFacts({ facts }: { facts: [string, ReactNode][] }) {
  return <dl className="driver-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
export function DriverState({ title, message, error = false, children }: { title: string; message: string; error?: boolean; children?: ReactNode }) {
  return <section className="driver-state">{error ? <TriangleAlert size={28} /> : <Package size={28} />}<h2>{title}</h2><p role={error ? 'alert' : undefined}>{message}</p>{children}</section>;
}
export function driverLink(page: string, params: URLSearchParams, changes: Record<string, string | undefined> = {}) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
  return `/driver/${page}${next.size ? `?${next}` : ''}`;
}
