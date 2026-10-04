import { FRESH_DEADLINE_MINUTE, MAX_DAILY_TRIPS, type CandidateEvaluation, type ConstraintCheck, type ConstraintCode, type PlannedTrip,
  type PlanningInput, type PlanningOrder, type PlanningVehicle } from './model.js';
import { allowanceFor, decimal, DEPOT_TURNAROUND_MINUTES, recordedSeconds, scheduleTrip, seconds, sumDecimals, travelFor } from './timing.js';

const capability = { AMBIENT: ['AMBIENT', 'REEFER'], CHILLED: ['REEFER'], FROZEN: ['REEFER'] } as const;
export const temperatureCompatible = (order: PlanningOrder, vehicle: PlanningVehicle) => (capability[order.temperature] as readonly string[]).includes(vehicle.temperature);
export const accessCompatible = (order: PlanningOrder, vehicle: PlanningVehicle) => order.outlet.access !== 'VAN_ONLY' || vehicle.type === 'VAN';
export function check(code: ConstraintCode, passed: boolean, reason: string, actual: string | number, required: string | number): ConstraintCheck {
  return { code, passed, severity: 'BLOCKING', reason, actual: String(actual), required: String(required) };
}
export function hasReferences(input: PlanningInput, order: PlanningOrder) {
  const travel = travelFor(input, order), allowance = allowanceFor(input, order);
  const mall = order.outlet.access === 'MALL_DOCK' || order.outlet.dockType === 'MALL_BAY';
  return !!travel && !!allowance && decimal(allowance.minutes).gt(0) && (!mall || order.outlet.mallOpen != null && order.outlet.mallClose != null);
}
function stopChecks(input: PlanningInput, trip: PlannedTrip, orders: PlanningOrder[]) {
  return trip.stops.flatMap(stop => {
    const order = orders.find(row => row.id === stop.orderId)!;
    const open = seconds(order.outlet.windowOpen), close = seconds(order.outlet.windowClose);
    const start = recordedSeconds(stop.serviceStartMinute), complete = recordedSeconds(stop.serviceCompleteMinute);
    const checks = [check('REFERENCE_DATA', hasReferences(input, order), 'Depot/district travel and brand/dock service references must exist.', hasReferences(input, order) ? 'Recorded' : 'Missing', 'Recorded references'),
      check('DELIVERY_WINDOW', start >= open && complete <= close, `${order.orderRef}: receiving and service must fit the outlet window.`, `${stop.serviceStartMinute}–${stop.serviceCompleteMinute}`, `${order.outlet.windowOpen}–${order.outlet.windowClose}`)];
    if (order.outlet.mallOpen != null || order.outlet.mallClose != null || order.outlet.access === 'MALL_DOCK' || order.outlet.dockType === 'MALL_BAY') {
      const valid = order.outlet.mallOpen != null && order.outlet.mallClose != null && start >= seconds(order.outlet.mallOpen) && complete <= seconds(order.outlet.mallClose);
      checks.push(check('MALL_WINDOW', valid, `${order.orderRef}: mall receiving and service must fit the recorded mall window.`, `${stop.serviceStartMinute}–${stop.serviceCompleteMinute}`, `${order.outlet.mallOpen ?? 'Unknown'}–${order.outlet.mallClose ?? 'Unknown'}`));
    }
    if (order.outlet.brand === 'FRESH') checks.push(check('FRESH_DEADLINE', start < seconds(FRESH_DEADLINE_MINUTE), `${order.orderRef}: Fresh receiving must start before 08:00.`, stop.serviceStartMinute, '<480 minutes'));
    return checks;
  });
}
function tripTimingPossible(input: PlanningInput, trip: PlannedTrip, vehicle: PlanningVehicle) {
  if (vehicle.availableFromMinute == null || vehicle.availableUntilMinute == null) return false;
  if (trip.departureMinute < vehicle.availableFromMinute || trip.returnMinute > vehicle.availableUntilMinute) return false;
  return input.existingTrips.filter(row => row.vehicleId === vehicle.id && row.status !== 'CANCELLED').every(row => {
    if (row.departureMinute == null || row.returnMinute == null) return false;
    return row.tripNumber < trip.tripNumber ? trip.departureMinute >= row.returnMinute + DEPOT_TURNAROUND_MINUTES
      : trip.returnMinute + DEPOT_TURNAROUND_MINUTES <= row.departureMinute;
  });
}
export function evaluateCandidate(input: PlanningInput, trips: PlannedTrip[], order: PlanningOrder, vehicle: PlanningVehicle, tripNumber: number): CandidateEvaluation {
  const existing = trips.find(row => row.vehicleId === vehicle.id && row.tripNumber === tripNumber), other = trips.filter(row => row !== existing);
  const orders = [...(existing?.stops.map(stop => input.orders.find(row => row.id === stop.orderId)!) ?? []), order];
  const scheduling = { ...input, existingTrips: [...input.existingTrips, ...other.map(row => ({ id: row.key, vehicleId: row.vehicleId, tripNumber: row.tripNumber,
    departureMinute: row.departureMinute, returnMinute: row.returnMinute, status: 'DRAFT' }))] };
  const trip = scheduleTrip(scheduling, vehicle, tripNumber, orders);
  const occupied = scheduling.existingTrips.filter(row => row.vehicleId === vehicle.id && row.status !== 'CANCELLED');
  const fuel = sumDecimals([...other.filter(row => row.vehicleId === vehicle.id).map(row => row.fuelLitres), trip.fuelLitres]);
  const known = vehicle.fuelKnown && vehicle.remainingFuelLitres != null;
  const checks = [check('OPERATING_DAY', input.operatingDay, 'The selected service date requires a persisted operating calendar.', input.serviceDate, 'Operating day'),
    check('DEPOT', vehicle.depotId === input.depotId && orders.every(row => row.outlet.depotId === input.depotId), 'Vehicle, orders and planning depot must match.', vehicle.depotId, input.depotId),
    check('VEHICLE_AVAILABLE', vehicle.active && vehicle.availability === 'AVAILABLE', 'An active vehicle requires explicit availability for this service date.', `${vehicle.active ? 'Active' : 'Inactive'} / ${vehicle.availability}`, 'Active / AVAILABLE'),
    check('TEMPERATURE', orders.every(row => temperatureCompatible(row, vehicle)), 'Ambient can use ambient or reefer; chilled and frozen require reefer.', vehicle.temperature, orders.map(row => row.temperature).join(', ')),
    check('ACCESS', orders.every(row => accessCompatible(row, vehicle)), 'Van-only outlets require a van.', vehicle.type, orders.some(row => row.outlet.access === 'VAN_ONLY') ? 'VAN' : 'TRUCK or VAN'),
    check('WEIGHT_CAPACITY', decimal(trip.weightKg).lte(vehicle.weightCapacityKg), 'Total ordered weight must fit the vehicle.', trip.weightKg, vehicle.weightCapacityKg),
    check('VOLUME_CAPACITY', decimal(trip.volumeM3).lte(vehicle.volumeCapacityM3), 'Total ordered volume must fit the vehicle.', trip.volumeM3, vehicle.volumeCapacityM3),
    check('TRIP_LIMIT', tripNumber >= 1 && tripNumber <= MAX_DAILY_TRIPS && occupied.length + 1 <= MAX_DAILY_TRIPS && !occupied.some(row => row.tripNumber === tripNumber), 'Existing and generated trips share the two-trip daily limit.', occupied.length + 1, MAX_DAILY_TRIPS),
    check('TIME_FEASIBILITY', tripTimingPossible(scheduling, trip, vehicle), 'Departure, return and turnaround must fit availability and other trips.', `${trip.departureMinute}–${trip.returnMinute}`, `${vehicle.availableFromMinute ?? 'Unknown'}–${vehicle.availableUntilMinute ?? 'Unknown'}`),
    check('FUEL_UNKNOWN', known, 'Weekly fuel requires an explicit opening balance; unknown is blocking.', known ? 'KNOWN' : 'UNKNOWN', 'KNOWN'),
    check('FUEL_QUOTA', known && fuel.lte(vehicle.remainingFuelLitres!), 'All new trip fuel must fit the remaining weekly quota after existing usage/reservations.', fuel.toString(), vehicle.remainingFuelLitres ?? 'Unknown'),
    ...stopChecks(input, trip, orders)];
  return { trip, checks, incrementalFuelLitres: decimal(trip.fuelLitres).sub(existing?.fuelLitres ?? 0).toString(),
    capabilityWaste: Number(vehicle.temperature === 'REEFER' && order.temperature === 'AMBIENT') + Number(vehicle.type === 'VAN' && order.outlet.access !== 'VAN_ONLY') };
}
