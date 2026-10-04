import { Prisma } from '@prisma/client';
import { FRESH_DEADLINE_MINUTE, type PlannedTrip, type PlanningInput, type PlanningOrder, type PlanningVehicle } from './model.js';

export const DEPOT_TURNAROUND_MINUTES = 15;
export const decimal = (value: string | number) => new Prisma.Decimal(value);
export const sumDecimals = (values: string[]) => values.reduce((total, value) => total.add(value), decimal(0));
export const seconds = (minutes: string | number) => decimal(minutes).mul(60).ceil().toNumber();
export const recordedSeconds = (minutes: number) => Math.round(minutes * 60);
export const travelFor = (input: PlanningInput, order: PlanningOrder) => input.travel.find(row => row.depotId === order.outlet.depotId && row.district === order.outlet.district);
export const allowanceFor = (input: PlanningInput, order: PlanningOrder) => input.allowances.find(row => row.brand === order.outlet.brand && row.dockType === order.outlet.dockType);
export function effectiveClose(order: PlanningOrder) {
  return Math.min(order.outlet.windowClose, order.outlet.mallClose ?? 1440, order.outlet.brand === 'FRESH' ? FRESH_DEADLINE_MINUTE : 1440);
}
export function receivingOpen(order: PlanningOrder) {
  return Math.max(order.outlet.windowOpen, order.outlet.mallOpen ?? 0);
}
export function routeOrders(orders: PlanningOrder[]) {
  return [...orders].sort((a, b) => effectiveClose(a) - effectiveClose(b) || receivingOpen(a) - receivingOpen(b) || a.orderRef.localeCompare(b.orderRef));
}
function firstDeparture(input: PlanningInput, vehicle: PlanningVehicle, tripNumber: number) {
  const prior = input.existingTrips.filter(row => row.vehicleId === vehicle.id && row.status !== 'CANCELLED' && row.tripNumber < tripNumber);
  return Math.max(seconds(vehicle.availableFromMinute ?? 0), ...prior.map(row => seconds(row.returnMinute ?? 1440) + seconds(DEPOT_TURNAROUND_MINUTES)));
}
function travelLeg(input: PlanningInput, order: PlanningOrder, previous: PlanningOrder | undefined) {
  const target = travelFor(input, order), origin = previous ? travelFor(input, previous) : undefined;
  if (!previous) return { km: target?.depotKm ?? '0', duration: seconds(target?.depotMinutes ?? 0) };
  if (previous.outlet.district === order.outlet.district) return { km: target?.interStopKm ?? '0', duration: seconds(target?.interStopMinutes ?? 0) };
  return { km: decimal(origin?.depotKm ?? 0).add(target?.depotKm ?? 0).toString(), duration: seconds(origin?.depotMinutes ?? 0) + seconds(target?.depotMinutes ?? 0) };
}
export function scheduleTrip(input: PlanningInput, vehicle: PlanningVehicle, tripNumber: number, orders: PlanningOrder[]): PlannedTrip {
  const sorted = routeOrders(orders), departure = firstDeparture(input, vehicle, tripNumber);
  let clock = departure, distance = decimal(0);
  const stops = sorted.map((order, index) => {
    const leg = travelLeg(input, order, sorted[index - 1]), service = seconds(allowanceFor(input, order)?.minutes ?? 0);
    distance = distance.add(leg.km);
    const arrival = clock + leg.duration, start = Math.max(arrival, seconds(receivingOpen(order)));
    clock = start + service;
    return { orderId: order.id, sequence: index + 1, arrivalMinute: arrival / 60, serviceStartMinute: start / 60,
      serviceCompleteMinute: clock / 60, waitingMinutes: (start - arrival) / 60, serviceMinutes: service / 60 };
  });
  const last = sorted.at(-1), returnLeg = last ? travelFor(input, last) : undefined;
  distance = distance.add(returnLeg?.depotKm ?? 0);
  clock += seconds(returnLeg?.depotMinutes ?? 0);
  const fuel = decimal(vehicle.kmPerLitre).gt(0) ? distance.div(vehicle.kmPerLitre).toDecimalPlaces(3, Prisma.Decimal.ROUND_CEIL) : decimal(0);
  return { key: `${vehicle.id}:${tripNumber}`, vehicleId: vehicle.id, tripNumber, departureMinute: departure / 60, returnMinute: clock / 60,
    distanceKm: distance.toString(), fuelLitres: fuel.toString(), weightKg: sumDecimals(sorted.map(row => row.weightKg)).toString(),
    volumeM3: sumDecimals(sorted.map(row => row.volumeM3)).toString(), stops };
}
