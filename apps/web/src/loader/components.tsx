import type { ReactNode } from 'react';
import { Package, TriangleAlert } from 'lucide-react';
export { dateLabel, sentenceCase, timeLabel } from '../store/components';

export function LoaderPanel({ kicker, title, children, action }: { kicker: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="loader-panel"><header className="loader-panel-head"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div>{action}</header>{children}</section>;
}
export function LoaderState({ title, message, error = false, children }: { title: string; message: string; error?: boolean; children?: ReactNode }) {
  return <section className="loader-state">{error ? <TriangleAlert size={28} /> : <Package size={28} />}<h2>{title}</h2><p role={error ? 'alert' : undefined}>{message}</p>{children}</section>;
}
export function LoaderChip({ label, tone = 'gray' }: { label: string; tone?: 'gray' | 'green' | 'amber' | 'blue' | 'red' }) {
  return <span className={`loader-chip ${tone}`}>{label}</span>;
}
export function LoaderFacts({ facts }: { facts: [string, ReactNode][] }) {
  return <dl className="loader-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
