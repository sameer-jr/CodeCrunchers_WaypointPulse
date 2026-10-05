import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ProofAttachment, ProofAttachmentInput } from '@waypoint/shared';
import { useIdentity } from '../auth';
import { attachmentDataUrl, PHOTO_BYTES, SIGNATURE_BYTES } from './images';
import { authorizedProofUrl } from './urls';
import './proof.css';
function StoredImage({ attachment, open }: { attachment: ProofAttachment; open: (source: string, label: string) => void }) {
  const identity = useIdentity(), userId = identity.data?.id;
  const [attempt, setAttempt] = useState(0), [state, setState] = useState<{ owner?: string; source?: string; error?: string }>({});
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController(); let objectUrl: string | undefined;
    setState({ owner: userId });
    const read = async () => {
      const response = await fetch(authorizedProofUrl(attachment.url, window.location.origin), { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to view this proof.' : response.status === 403 || response.status === 404 ? 'This proof is unavailable to your account.' : 'This proof image could not be loaded.');
      const blob = await response.blob();
      if (!['image/jpeg', 'image/png'].includes(blob.type) || blob.type !== attachment.contentType || !blob.size ||
        blob.size !== attachment.byteLength || blob.size > (attachment.kind === 'PHOTO' ? PHOTO_BYTES : SIGNATURE_BYTES)) throw new Error('The proof image response is invalid.');
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setState({ owner: userId, source: objectUrl });
    };
    void read().catch(error => { if (!controller.signal.aborted) setState({ owner: userId, error: navigator.onLine ? error instanceof Error ? error.message : 'This proof image could not be loaded.' : 'Reconnect to view this stored proof image.' }); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.url, attachment.kind, attachment.contentType, userId, attempt]);
  const label = attachment.kind === 'PHOTO' ? 'Delivery photo' : 'Recipient signature';
  return <figure className={`proof-media-card ${attachment.kind === 'SIGNATURE' ? 'signature' : ''}`}>{state.owner === userId && state.source ? <button className="proof-image-button" type="button" onClick={() => open(state.source!, label)} aria-label={`View ${label.toLowerCase()}`}><img src={state.source} alt={label} /></button> : <div className="proof-image-state"><span role={state.error ? 'alert' : 'status'}>{state.owner === userId && state.error ? state.error : 'Loading authorized proof…'}</span>{state.owner === userId && state.error && <button type="button" className="btn secondary" onClick={() => setAttempt(value => value + 1)}>Retry image</button>}</div>}<figcaption><strong>{label}</strong><span>Server record · {Math.ceil(attachment.byteLength / 1024)} KiB</span></figcaption></figure>;
}
export function ProofGallery({ attachments = [], local = [], pending = false, hasUnavailableMedia = false }: {
  attachments?: ProofAttachment[]; local?: ProofAttachmentInput[]; pending?: boolean; hasUnavailableMedia?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null), identity = useIdentity();
  const [preview, setPreview] = useState<{ source: string; label: string; owner?: string } | null>(null);
  const userId = identity.data?.id;
  const activePreview = preview?.owner === userId ? preview : null;
  useEffect(() => { setPreview(null); }, [userId, pending]);
  useEffect(() => { if (activePreview && dialog.current && !dialog.current.open) dialog.current.showModal(); else if (!activePreview) dialog.current?.close(); }, [activePreview]);
  const open = (source: string, label: string) => setPreview({ source, label, owner: userId });
  const hasLocal = pending && local.length > 0;
  return <section className="proof-gallery" aria-label="Delivery photos and signature">{hasLocal || attachments.length ? <><p className="proof-helper">{hasLocal ? 'Saved on this device · Pending sync. These attachments are not shared until synchronization succeeds.' : 'Saved delivery attachments. Select an image to view it.'}</p><div className="proof-gallery-grid">{hasLocal ? local.map((attachment, index) => { const label = attachment.kind === 'PHOTO' ? `Delivery photo ${index + 1}` : 'Recipient signature'; const source = attachmentDataUrl(attachment); return <figure key={index} className={`proof-media-card ${attachment.kind === 'SIGNATURE' ? 'signature' : ''}`}><button type="button" className="proof-image-button" onClick={() => open(source, label)} aria-label={`View local ${label.toLowerCase()}`}><img src={source} alt={`${label} saved on this device`} /></button><figcaption><strong>{label}</strong><span>Local attachment · Pending sync</span></figcaption></figure>; }) : attachments.map(attachment => <StoredImage key={attachment.id} attachment={attachment} open={open} />)}</div></> : <p className="proof-helper">{hasUnavailableMedia ? 'Image content is unavailable for this older proof record.' : 'No photos or signature were attached to this delivery.'}</p>}<dialog ref={dialog} className="proof-preview-dialog" onClose={() => setPreview(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}><header><h3>{activePreview?.label || 'Delivery attachment'}</h3><button type="button" className="proof-remove" aria-label="Close proof preview" onClick={() => dialog.current?.close()}><X size={20} /></button></header>{activePreview && <img src={activePreview.source} alt={activePreview.label} />}<p>{hasLocal ? 'Saved on this device · Pending sync' : 'Authorized delivery proof'}</p></dialog></section>;
}
