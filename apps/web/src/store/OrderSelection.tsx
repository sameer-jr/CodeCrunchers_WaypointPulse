import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ORDER_STATUSES, type StoreOrderDetail, type StoreOrderStatus } from '@waypoint/shared';
import { useStoreOrder, useStoreOrders } from './api';
import { dateLabel, EmptyState, ErrorState, LoadingState, Panel, STATUS_LABELS } from './components';

export function OrderSelection({ receipt = false, children }: { receipt?: boolean; children: (order: StoreOrderDetail) => ReactNode }) {
  const [params, setParams] = useSearchParams();
  const status = ORDER_STATUSES.find(value => value === params.get('status'));
  const date = params.get('date') || undefined;
  const list = useStoreOrders({ status, date });
  const requestedId = params.get('order');
  const initialOrder = receipt ? list.data?.orders.find(order => ['DELIVERED', 'PARTIALLY_DELIVERED', 'AWAITING_RECEIPT'].includes(order.status) && !order.receiptStatus) || list.data?.orders[0] : list.data?.orders[0];
  const selectedId = requestedId || initialOrder?.id;
  const detail = useStoreOrder(selectedId);
  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    if (name !== 'order') next.delete('order');
    setParams(next);
  };
  if (list.isPending) return <LoadingState message="Loading your orders…" />;
  if (list.isError) return <ErrorState error={list.error} retry={() => void list.refetch()} />;
  return <div className="store-stack"><Panel kicker="YOUR OUTLET ORDERS" title={receipt ? 'Select a delivery' : 'Select an order'}><div className="store-panel-body"><div className="store-selection-grid"><div className="field"><label htmlFor="store-order-select">{receipt ? 'Order to receive' : 'Order to track'}</label><select id="store-order-select" value={selectedId || ''} onChange={event => update('order', event.target.value)}><option value="">Choose an order</option>{requestedId && !list.data.orders.some(order => order.id === requestedId) && <option value={requestedId}>Selected order</option>}{list.data.orders.map(order => <option key={order.id} value={order.id}>{order.orderRef} · {STATUS_LABELS[order.status]} · {dateLabel(order.eligibleDeliveryDate)}</option>)}</select></div>{!receipt && <><div className="field"><label htmlFor="store-order-status">Status</label><select id="store-order-status" value={status || ''} onChange={event => update('status', event.target.value)}><option value="">All statuses</option>{ORDER_STATUSES.map(value => <option key={value} value={value as StoreOrderStatus}>{value === 'CONFIRMED' ? 'Confirmed · awaiting planning' : value === 'CLOSED_FOR_PLANNING' ? 'Closed for planning' : STATUS_LABELS[value]}</option>)}</select></div><div className="field"><label htmlFor="store-order-filter-date">Requested delivery date</label><input id="store-order-filter-date" type="date" value={date || ''} onChange={event => update('date', event.target.value)} /></div></>}</div><div className="store-selection-footer"><p className="store-helper">{list.data.total.toLocaleString()} {list.data.total === 1 ? 'order' : 'orders'}{status || date ? ' matching these filters' : ' in your outlet'}</p>{(status || date) && <button className="store-text-link" onClick={() => setParams(requestedId ? { order: requestedId } : {})}>Clear filters</button>}</div></div></Panel>{!selectedId ? <Panel title={receipt ? 'No delivery selected' : 'No orders to track'}><EmptyState title={list.data.total === 0 ? (status || date ? 'No matching orders' : 'No orders yet') : 'Choose an order'} message={receipt ? 'Recorded deliveries can be confirmed here after arrival. Place an order to begin the delivery lifecycle.' : 'Your saved requests will appear here with their recorded lifecycle and planned arrival when available.'}><Link className="btn primary" to="/store/place-order">Place Order</Link></EmptyState></Panel> : detail.isPending ? <LoadingState message="Loading this order…" /> : detail.isError ? <ErrorState error={detail.error} retry={() => void detail.refetch()} /> : children(detail.data)}</div>;
}
