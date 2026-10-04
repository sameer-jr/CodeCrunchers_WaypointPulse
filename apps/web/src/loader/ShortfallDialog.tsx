import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LOADING_SHORTFALL_REASONS, recordStopLoadSchema, type LoaderStop, type LoadingShortfallReason, type RecordStopLoadInput } from '@waypoint/shared';
import { LoaderFacts, sentenceCase } from './components';

export type LoadSelection = { stop: LoaderStop; tripVersion: number };
export function loadVersionInput(selection: LoadSelection) {
  return { expectedTripVersion: selection.tripVersion, expectedOrderVersion: selection.stop.order.version, expectedStopUpdatedAt: selection.stop.updatedAt, expectedLoadRevision: selection.stop.load?.revision ?? 0 };
}
export function ShortfallDialog({ selection, unchanged, checking, busy, error, close, submit }: {
  selection: LoadSelection; unchanged: boolean; checking: boolean; busy: boolean; error: Error | null; close: () => void; submit: (input: RecordStopLoadInput) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<LoadingShortfallReason | ''>('');
  const [note, setNote] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const expected = selection.stop.order.orderedUnits;
  useEffect(() => { dialog.current?.showModal(); }, []);
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const units = Number(quantity);
    if (!quantity || !Number.isInteger(units) || units < 1 || units >= expected) { setValidation(`Enter a whole actual quantity between 1 and ${expected - 1}.`); return; }
    if (!reason) { setValidation('Choose a shortfall reason.'); return; }
    const input = recordStopLoadSchema.safeParse({ ...loadVersionInput(selection), loadedUnits: units, reasonCode: reason, ...(note.trim() ? { note: note.trim() } : {}) });
    if (!input.success) { setValidation(input.error.issues[0]?.message || 'Check the shortfall details.'); return; }
    setValidation(null); submit(input.data);
  };
  return <dialog ref={dialog} className="loader-dialog" aria-labelledby="loader-shortfall-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}><div className="loader-dialog-head"><div><span className="eyebrow">LOADING EXCEPTION</span><h2 id="loader-shortfall-title">Report Loading Shortfall</h2><p>{selection.stop.order.orderRef} · {selection.stop.order.outlet.outletRef}</p></div><button className="icon-button" type="button" aria-label="Close shortfall dialog" disabled={busy} onClick={close}><X size={20} /></button></div><form onSubmit={save} noValidate><LoaderFacts facts={[[ 'Expected / originally ordered', `${expected.toLocaleString()} units` ], ['Delivery stop', String(selection.stop.sequence)]]} /><div className="loader-field"><label htmlFor="loader-shortfall-quantity">Actual loaded units</label><input id="loader-shortfall-quantity" autoFocus type="number" inputMode="numeric" step="1" min="1" max={expected - 1} value={quantity} onChange={event => setQuantity(event.target.value)} disabled={busy} aria-describedby="loader-shortfall-help" /></div><div className="loader-field"><label htmlFor="loader-shortfall-reason">Shortfall reason (required)</label><select id="loader-shortfall-reason" value={reason} onChange={event => setReason(event.target.value as LoadingShortfallReason | '')} disabled={busy}><option value="">Select a reason</option>{LOADING_SHORTFALL_REASONS.map(value => <option key={value} value={value}>{sentenceCase(value)}</option>)}</select></div><div className="loader-field"><label htmlFor="loader-shortfall-note">Note {reason === 'OTHER' ? '(required for Other)' : '(optional)'}</label><textarea id="loader-shortfall-note" rows={3} maxLength={450} value={note} onChange={event => setNote(event.target.value)} disabled={busy} placeholder="Add useful details for Dispatcher review." /></div><p id="loader-shortfall-help" className="loader-note warning">The original order quantity is retained. Dispatcher must review the revised load before this trip can be ready for dispatch.</p>{!unchanged && <p className="error-notice" role="alert">This load changed while the dialog was open. Close it and review the current manifest.</p>}{(validation || error) && <p className="error-notice" role="alert">{validation || error?.message}</p>}<div className="loader-dialog-actions"><button type="button" className="btn secondary" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="btn primary" disabled={busy || checking || !unchanged}>{busy ? 'Recording…' : 'Report Shortfall'}</button></div></form></dialog>;
}
