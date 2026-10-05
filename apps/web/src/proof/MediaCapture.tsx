import { useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import type { ProofAttachmentInput } from '@waypoint/shared';
import { attachmentDataUrl, compressProofImage } from './images';
import { SignaturePad } from './SignaturePad';
import './proof.css';

export function useProofCapture() {
  const [photos, setPhotos] = useState<ProofAttachmentInput[]>([]), [signature, setSignature] = useState<ProofAttachmentInput | null>(null);
  const [processing, setProcessing] = useState(false), [signatureBusy, setSignatureBusy] = useState(false), [signatureDraft, setSignatureDraft] = useState(false);
  return { photos, setPhotos, signature, setSignature, processing, setProcessing, signatureBusy, setSignatureBusy, signatureDraft, setSignatureDraft,
    attachments: [...photos, ...(signature ? [signature] : [])], busy: processing || signatureBusy };
}
export function MediaCapture({ capture, disabled }: { capture: ReturnType<typeof useProofCapture>; disabled: boolean }) {
  const camera = useRef<HTMLInputElement>(null), upload = useRef<HTMLInputElement>(null), preparing = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = disabled || capture.busy;
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || blocked || preparing.current) return;
    if (capture.photos.length + files.length > 3) { setError(`Attach up to three photos. You can add ${3 - capture.photos.length} more.`); return; }
    preparing.current = true; capture.setProcessing(true); setError(null);
    try {
      const prepared: ProofAttachmentInput[] = [];
      for (const file of Array.from(files)) prepared.push(await compressProofImage(file));
      capture.setPhotos(previous => [...previous, ...prepared]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The photos could not be prepared. Try again.'); }
    finally { preparing.current = false; capture.setProcessing(false); }
  };
  return <div className="proof-capture"><section><div className="proof-section-label"><strong>Delivery photos (optional)</strong><span>{capture.photos.length} / 3 attached</span></div><p className="proof-helper">JPEG or PNG. Photos are resized before saving, up to 1 MiB each.</p><input ref={camera} className="proof-file-input" type="file" accept="image/jpeg,image/png" capture="environment" disabled={blocked || capture.photos.length === 3} onChange={event => { void addPhotos(event.target.files); event.target.value = ''; }} aria-label="Take a delivery photo" /><input ref={upload} className="proof-file-input" type="file" accept="image/jpeg,image/png" multiple disabled={blocked || capture.photos.length === 3} onChange={event => { void addPhotos(event.target.files); event.target.value = ''; }} aria-label="Upload delivery photos" /><div className="proof-actions"><button type="button" className="btn secondary" disabled={blocked || capture.photos.length === 3} onClick={() => camera.current?.click()}><Camera size={18} />Take photo</button><button type="button" className="btn secondary" disabled={blocked || capture.photos.length === 3} onClick={() => upload.current?.click()}><Upload size={18} />Upload photos</button></div>{capture.processing && <p className="proof-helper" role="status">Preparing photos… keep this page open.</p>}{capture.photos.length > 0 && <div className="proof-thumbnails">{capture.photos.map((photo, index) => <figure key={index}><img src={attachmentDataUrl(photo)} alt={`Delivery photo ${index + 1} ready to attach`} /><figcaption>Photo {index + 1}<button type="button" className="proof-remove" disabled={blocked} aria-label={`Remove photo ${index + 1}`} onClick={() => capture.setPhotos(previous => previous.filter((_, item) => item !== index))}><X size={17} /></button></figcaption></figure>)}</div>}{error && <p className="error-notice" role="alert">{error}</p>}</section><SignaturePad disabled={blocked} saved={!!capture.signature} onSave={capture.setSignature} onClear={() => capture.setSignature(null)} onDraft={capture.setSignatureDraft} onBusy={capture.setSignatureBusy} />{capture.signature && <figure className="proof-signature-preview"><img src={attachmentDataUrl(capture.signature)} alt="Recipient signature ready to attach" /><figcaption>Signature attached · saved with delivery</figcaption></figure>}<p className="proof-helper">Attachments are saved with Complete Delivery, including offline. They become shared proof after the server confirms synchronization.</p></div>;
}
