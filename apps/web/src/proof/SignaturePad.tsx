import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ProofAttachmentInput } from '@waypoint/shared';
import { signatureAttachment } from './images';

export function SignaturePad({ disabled, saved, onSave, onClear, onDraft, onBusy }: {
  disabled: boolean; saved: boolean; onSave: (attachment: ProofAttachmentInput) => void; onClear: () => void;
  onDraft: (dirty: boolean) => void; onBusy: (busy: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), pointer = useRef<number | null>(null), previous = useRef<{ x: number; y: number } | null>(null);
  const distance = useRef(0), [hasInk, setHasInk] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState<string | null>(null);
  const clearCanvas = () => { const context = canvas.current?.getContext('2d'); if (context) { context.fillStyle = '#fff'; context.fillRect(0, 0, 1000, 360); } };
  useEffect(clearCanvas, []);
  const point = (event: PointerEvent<HTMLCanvasElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - bounds.left) * 1000 / bounds.width, y: (event.clientY - bounds.top) * 360 / bounds.height }; };
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || working || pointer.current !== null || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointer.current = event.pointerId; previous.current = point(event); setError(null);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || working || pointer.current !== event.pointerId || !previous.current) return;
    const next = point(event), context = event.currentTarget.getContext('2d');
    if (!context) return;
    context.beginPath(); context.lineWidth = 5; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#1d1d1f';
    context.moveTo(previous.current.x, previous.current.y); context.lineTo(next.x, next.y); context.stroke();
    distance.current += Math.hypot(next.x - previous.current.x, next.y - previous.current.y); previous.current = next;
    if (distance.current > 0) onDraft(true);
    if (distance.current > 12) setHasInk(true);
  };
  const end = (event: PointerEvent<HTMLCanvasElement>) => { if (pointer.current !== event.pointerId) return; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); pointer.current = null; previous.current = null; };
  const clear = () => { clearCanvas(); distance.current = 0; setHasInk(false); setError(null); onDraft(false); onClear(); };
  const save = async () => {
    if (!canvas.current || disabled || working) return;
    if (!hasInk) { setError('Draw a signature before choosing Use signature. A tap does not count as a signature.'); return; }
    setWorking(true); onBusy(true); setError(null);
    try { onSave(await signatureAttachment(canvas.current)); onDraft(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'This signature could not be prepared. Please try again.'); }
    finally { setWorking(false); onBusy(false); }
  };
  return <section className="proof-signature"><div className="proof-section-label"><strong>Recipient signature (optional)</strong><span>{saved ? 'Attached' : 'Draw below'}</span></div><p id="proof-signature-help" className="proof-helper">Use a finger, pen or mouse. Choose Use signature to attach the drawing.</p><canvas ref={canvas} width={1000} height={360} aria-label="Recipient signature drawing area" aria-describedby="proof-signature-help" className={disabled || working ? 'disabled' : ''} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { pointer.current = null; previous.current = null; }} /><div className="proof-actions"><button type="button" className="btn secondary" disabled={disabled || working} onClick={clear}>Clear signature</button><button type="button" className="btn primary" disabled={disabled || working} onClick={() => void save()}>{working ? 'Preparing signature…' : 'Use signature'}</button></div>{error && <p className="error-notice" role="alert">{error}</p>}</section>;
}
