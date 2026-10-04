import { FRESH_DEADLINE_MINUTE, MAX_DAILY_TRIPS, type GeneratedPlan, type PlannedTrip, type PlanningInput, type PlanningOrder, type PlanValidation, type ValidationIssue } from './model.js';
import { allowanceFor, decimal, DEPOT_TURNAROUND_MINUTES, recordedSeconds, scheduleTrip, seconds, sumDecimals, travelFor } from './timing.js';

function sameTime(a: number, b: number) { return recordedSeconds(a) === recordedSeconds(b); }
function validateCoverage(input: PlanningInput, plan: GeneratedPlan, issues: ValidationIssue[]) {
  const add = (code: ValidationIssue['code'], message: string, orderId: string) => issues.push({ code, message, orderId, tripKey: null });
  for (const order of input.orders) {
    const decisions = plan.decisions.filter(row => row.orderId === order.id), stops = plan.trips.flatMap(trip => trip.stops).filter(stop => stop.orderId === order.id);
    if (decisions.length !== 1) add('COVERAGE', 'Every eligible order requires exactly one decision.', order.id);
    if (decisions.some(row => row.orderVersion !== order.version)) add('STALE_ORDER', 'The order version changed since generation.', order.id);
    if (stops.length > 1) add('DUPLICATE_ORDER', 'An order cannot appear at more than one served stop.', order.id);
    const decision = decisions[0];
    if (decision?.decision === 'ASSIGNED' && (stops.length !== 1 || !plan.trips.some(trip => trip.key === decision.tripKey && trip.stops.some(stop => stop.orderId === order.id)))) add('ASSIGNMENT', 'A served decision requires its exact trip and stop.', order.id);
    if (decision?.decision === 'DEFERRED' && (stops.length || decision.tripKey != null || !decision.reasonCode || !decision.reason.trim())) add('ASSIGNMENT', 'A deferred decision requires a reason and no trip assignment.', order.id);
    if (order.outlet.depotId !== input.depotId) add('DEPOT', 'A required order belongs to another depot.', order.id);
    if (order.eligibleDate > input.serviceDate || order.requestedDate > input.serviceDate || order.nextEligibleDate != null && order.nextEligibleDate > input.serviceDate
      || !['CONFIRMED', 'CLOSED_FOR_PLANNING', 'DEFERRED', 'PLANNED'].includes(order.status)) add('COVERAGE', 'The run contains an order that is not planning-ready on this service day.', order.id);
  }
  for (const decision of plan.decisions) if (!input.orders.some(order => order.id === decision.orderId)) add('COVERAGE', 'A decision refers to an order outside the required demand snapshot.', decision.orderId);
}
function validateStops(input: PlanningInput, trip: PlannedTrip, orders: PlanningOrder[], issues: ValidationIssue[]) {
  const add = (code: ValidationIssue['code'], message: string, orderId: string) => issues.push({ code, message, orderId, tripKey: trip.key });
  const vehicle = input.vehicles.find(row => row.id === trip.vehicleId)!;
  trip.stops.forEach((stop, index) => {
    const order = orders.find(row => row.id === stop.orderId);
    if (!order) { add('COVERAGE', 'A stop refers to an order outside the run snapshot.', stop.orderId); return; }
    if (stop.sequence !== index + 1) add('SEQUENCE', 'Stop sequence must be contiguous and match persisted order.', order.id);
    if (order.outlet.depotId !== vehicle.depotId) add('DEPOT', 'The order and vehicle depots differ.', order.id);
    if (order.temperature !== 'AMBIENT' && vehicle.temperature !== 'REEFER') add('TEMPERATURE', 'Chilled and frozen orders require a reefer.', order.id);
    if (order.outlet.access === 'VAN_ONLY' && vehicle.type !== 'VAN') add('ACCESS', 'A truck cannot serve a van-only outlet.', order.id);
    const start = recordedSeconds(stop.serviceStartMinute), complete = recordedSeconds(stop.serviceCompleteMinute), arrival = recordedSeconds(stop.arrivalMinute);
    if (start < seconds(order.outlet.windowOpen) || complete > seconds(order.outlet.windowClose)) add('DELIVERY_WINDOW', 'Receiving and complete service must fit the outlet window.', order.id);
    const mall = order.outlet.access === 'MALL_DOCK' || order.outlet.dockType === 'MALL_BAY' || order.outlet.mallOpen != null || order.outlet.mallClose != null;
    if (mall && (order.outlet.mallOpen == null || order.outlet.mallClose == null || start < seconds(order.outlet.mallOpen) || complete > seconds(order.outlet.mallClose))) add('MALL_WINDOW', 'Receiving and service must fit a recorded mall window.', order.id);
    if (order.outlet.brand === 'FRESH' && start >= seconds(FRESH_DEADLINE_MINUTE)) add('FRESH_DEADLINE', 'Fresh receiving must start strictly before 08:00.', order.id);
    if (!travelFor(input, order) || !allowanceFor(input, order) || decimal(allowanceFor(input, order)!.minutes).lte(0)) add('REFERENCE_DATA', 'Required depot/district travel or service reference is missing.', order.id);
    if (arrival > start || complete < start || recordedSeconds(stop.waitingMinutes) !== start - arrival || recordedSeconds(stop.serviceMinutes) !== complete - start) add('TIMING', 'Arrival, wait and service facts are inconsistent.', order.id);
  });
}
function validateTrip(input: PlanningInput, plan: GeneratedPlan, trip: PlannedTrip, issues: ValidationIssue[]) {
  const add = (code: ValidationIssue['code'], message: string) => issues.push({ code, message, orderId: null, tripKey: trip.key });
  const vehicle = input.vehicles.find(row => row.id === trip.vehicleId);
  if (!vehicle) { add('VEHICLE_AVAILABLE', 'The assigned vehicle is absent from the scoped master snapshot.'); return; }
  if (!vehicle.active || vehicle.availability !== 'AVAILABLE') add('VEHICLE_AVAILABLE', 'Explicit active day-specific vehicle availability is required.');
  if (vehicle.depotId !== input.depotId) add('DEPOT', 'The assigned vehicle belongs to another depot.');
  const orders = trip.stops.map(stop => input.orders.find(order => order.id === stop.orderId)).filter((order): order is PlanningOrder => !!order);
  const weight = sumDecimals(orders.map(order => order.weightKg)), volume = sumDecimals(orders.map(order => order.volumeM3));
  if (weight.gt(vehicle.weightCapacityKg) || !weight.eq(trip.weightKg)) add('WEIGHT_CAPACITY', 'Persisted total weight must match the orders and fit the vehicle.');
  if (volume.gt(vehicle.volumeCapacityM3) || !volume.eq(trip.volumeM3)) add('VOLUME_CAPACITY', 'Persisted total volume must match the orders and fit the vehicle.');
  if (trip.tripNumber < 1 || trip.tripNumber > MAX_DAILY_TRIPS || !Number.isInteger(trip.tripNumber)) add('TRIP_LIMIT', 'Only trip numbers 1 and 2 are permitted.');
  if (!trip.stops.length) add('ASSIGNMENT', 'A generated trip must contain a served stop.');
  const others = [...input.existingTrips.filter(row => row.status !== 'CANCELLED'), ...plan.trips.filter(row => row !== trip).map(row => ({ id: row.key, status: 'DRAFT', ...row }))];
  const expected = scheduleTrip({ ...input, existingTrips: others }, vehicle, trip.tripNumber, orders);
  if (!sameTime(expected.departureMinute, trip.departureMinute) || !sameTime(expected.returnMinute, trip.returnMinute) || !decimal(expected.distanceKm).eq(trip.distanceKm)
    || !decimal(expected.fuelLitres).eq(trip.fuelLitres)) add('TIMING', 'Trip times, reference distance or rounded fuel estimate differ from independent recalculation.');
  for (const stop of trip.stops) {
    const recomputed = expected.stops.find(row => row.orderId === stop.orderId);
    if (recomputed && (recomputed.sequence !== stop.sequence || !sameTime(recomputed.arrivalMinute, stop.arrivalMinute) || !sameTime(recomputed.serviceStartMinute, stop.serviceStartMinute)
      || !sameTime(recomputed.serviceCompleteMinute, stop.serviceCompleteMinute))) add('TIMING', 'Stop sequence and times differ from independent reference recalculation.');
  }
  if (vehicle.availableFromMinute == null || vehicle.availableUntilMinute == null || trip.departureMinute < vehicle.availableFromMinute || trip.returnMinute > vehicle.availableUntilMinute) add('TIME_FEASIBILITY', 'Trip timing exceeds or lacks the explicit vehicle availability interval.');
  validateStops(input, trip, orders, issues);
}
function validateVehicleTotals(input: PlanningInput, plan: GeneratedPlan, issues: ValidationIssue[]) {
  for (const vehicle of input.vehicles) {
    const trips = plan.trips.filter(trip => trip.vehicleId === vehicle.id), existing = input.existingTrips.filter(trip => trip.vehicleId === vehicle.id && trip.status !== 'CANCELLED');
    if (!trips.length) continue;
    const add = (code: ValidationIssue['code'], message: string) => issues.push({ code, message, orderId: null, tripKey: trips[0].key });
    if (trips.length + existing.length > MAX_DAILY_TRIPS || new Set([...trips, ...existing].map(trip => trip.tripNumber)).size !== trips.length + existing.length) add('TRIP_LIMIT', 'Existing and generated trips exceed two slots or duplicate a slot.');
    const totalFuel = sumDecimals(trips.map(trip => trip.fuelLitres));
    if (!vehicle.fuelKnown || vehicle.remainingFuelLitres == null) add('FUEL_UNKNOWN', 'Unknown weekly remaining fuel cannot validate.');
    else if (totalFuel.gt(vehicle.remainingFuelLitres)) add('FUEL_QUOTA', 'Complete generated fuel reservations exceed remaining weekly quota.');
    const all = [...trips, ...existing].sort((a, b) => a.tripNumber - b.tripNumber);
    for (let index = 1; index < all.length; index++) {
      const prior = all[index - 1], next = all[index];
      if (prior.returnMinute == null || next.departureMinute == null || next.departureMinute < prior.returnMinute + DEPOT_TURNAROUND_MINUTES) add('TIME_FEASIBILITY', 'Sequential vehicle trips require known return times and depot turnaround.');
    }
  }
}
export function validatePlan(input: PlanningInput, plan: GeneratedPlan): PlanValidation {
  const issues: ValidationIssue[] = [];
  if (!input.operatingDay) issues.push({ code: 'OPERATING_DAY', message: 'The service date is not a persisted operating day.', orderId: null, tripKey: null });
  if (new Set(plan.trips.map(trip => trip.key)).size !== plan.trips.length) issues.push({ code: 'ASSIGNMENT', message: 'Trip keys must be unique.', orderId: null, tripKey: null });
  validateCoverage(input, plan, issues);
  plan.trips.forEach(trip => validateTrip(input, plan, trip, issues));
  validateVehicleTotals(input, plan, issues);
  return { valid: issues.length === 0, issues };
}
