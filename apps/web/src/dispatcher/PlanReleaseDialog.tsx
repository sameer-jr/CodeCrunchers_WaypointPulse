import { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import { dateLabel, Facts } from './components';

export type ReleaseSelection = { id: string; version: number; depotName: string; serviceDate: string; served: number; trips: number };

export function PlanReleaseDialog({ selection, current, checking, busy, error, close, confirm }: {
  selection: ReleaseSelection | null;
  current: { id: string; version: number; canRelease: boolean } | null;
  checking: boolean;
  busy: boolean;
  error: Error | null;
  close: () => void;
  confirm: (selection: ReleaseSelection) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selection && !dialog.current?.open) dialog.current?.showModal();
    if (!selection && dialog.current?.open) dialog.current.close();
  }, [selection]);
  const unchanged = !!selection && current?.id === selection.id && current.version === selection.version && current.canRelease;
  return <dialog ref={dialog} className="dispatch-release-dialog" aria-labelledby="dispatch-release-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    {selection && <div className="dispatch-release-content"><span className="dispatch-release-icon"><ShieldCheck size={27} /></span><span className="eyebrow">CONFIRM PLAN RELEASE</span><h2 id="dispatch-release-title">Release this validated plan?</h2><p>The served orders and trips will move to loading. Review the depot, day and validated version before continuing.</p><Facts facts={[
      ['Depot', selection.depotName], ['Operational date', dateLabel(selection.serviceDate)], ['Served orders', selection.served.toLocaleString()], ['Trips', selection.trips.toLocaleString()], ['Validated version', String(selection.version)]
    ]} />{checking && !busy ? <p className="dispatch-helper" role="status">Checking the current saved version…</p> : !unchanged && <p className="dispatch-note warning" role="alert">This plan changed or is no longer eligible for release. Close this dialog and review its current validation.</p>}{error && <p className="dispatch-note warning" role="alert">{error.message}</p>}<div className="dispatch-release-actions"><button type="button" className="btn secondary" disabled={busy} onClick={close}>Cancel</button><button type="button" className="btn primary" disabled={busy || checking || !unchanged} onClick={() => confirm(selection)}>{busy ? 'Releasing…' : 'Confirm Release'}</button></div></div>}
  </dialog>;
}
