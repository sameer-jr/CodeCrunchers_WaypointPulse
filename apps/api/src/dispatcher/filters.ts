import type { Prisma } from '@prisma/client';
import { dateOnly } from '../domain/dates.js';

export function orderDateWhere(value: string, basis: 'OPERATIONAL' | 'REQUESTED' = 'OPERATIONAL'): Prisma.OrderWhereInput {
  const date = dateOnly(value);
  if (basis === 'REQUESTED') return { requestedDeliveryDate: date };
  return { OR: [{ stops: { some: { active: true, trip: { serviceDate: date } } } },
    { stops: { none: { active: true } }, OR: [{ eligibleDeliveryDate: date }, { eligibleDeliveryDate: null, requestedDeliveryDate: date }] }] };
}
export function exceptionDateWhere(value: string): Prisma.ExceptionWhereInput {
  const date = dateOnly(value);
  return { OR: [{ trip: { is: { serviceDate: date } } }, { loadRecord: { is: { tripStop: { trip: { serviceDate: date } } } } },
    { deliveryRecord: { is: { tripStop: { trip: { serviceDate: date } } } } }, { receipt: { is: { deliveryRecord: { tripStop: { trip: { serviceDate: date } } } } } },
    { tripId: null, loadRecordId: null, deliveryRecordId: null, receiptId: null, order: { is: orderDateWhere(value) } }] };
}
