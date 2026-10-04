import { ShieldCheck } from 'lucide-react';
import { ApiFailure } from '../api';
import { useStoreContext } from './api';
import { ErrorState, LoadingState } from './components';
import { StoreHomePage } from './Home';
import { PlaceOrderPage } from './PlaceOrder';
import { ReceiptPage } from './Receipt';
import { TrackingPage } from './Tracking';
import './store.css';

export function StoreWorkspace({ page }: { page: string }) {
  const context = useStoreContext();
  if (context.isPending) return <div className="store-workspace"><LoadingState /></div>;
  if (context.isError) return <div className="store-workspace">{context.error instanceof ApiFailure && context.error.status === 403 ? <section className="store-state"><span className="store-state-icon"><ShieldCheck size={29} /></span><h2>Your outlet is not assigned yet</h2><p>An outlet assignment is required to view orders or create a delivery request. Contact your administrator to assign your Store account.</p><button className="btn secondary" onClick={() => void context.refetch()}>Check assignment again</button></section> : <ErrorState error={context.error} retry={() => void context.refetch()} />}</div>;
  return <div className="store-workspace">{page === 'place-order' ? <PlaceOrderPage context={context.data} /> : page === 'tracking' ? <TrackingPage /> : page === 'receipt' ? <ReceiptPage /> : <StoreHomePage />}</div>;
}
