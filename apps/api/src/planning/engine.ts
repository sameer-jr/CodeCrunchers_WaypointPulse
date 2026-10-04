import { DomainError } from '../domain/errors.js';
import { accessCompatible, evaluateCandidate, temperatureCompatible } from './constraints.js';
import { MAX_DAILY_TRIPS, STRATEGY_VERSION, type CandidateEvaluation, type GeneratedPlan, type PlanningDecision, type PlanningInput, type PlanningOrder, type PlanningVehicle } from './model.js';
import { decimal, effectiveClose, receivingOpen } from './timing.js';

function priority(input: PlanningInput, order: PlanningOrder) {
  return { previousDeferrals: order.deferralCount, compatibleVehicles: input.vehicles.filter(vehicle => vehicle.active && vehicle.availability === 'AVAILABLE'
    && vehicle.depotId === order.outlet.depotId && temperatureCompatible(order, vehicle) && accessCompatible(order, vehicle)).length,
  windowMinutes: effectiveClose(order) - receivingOpen(order), eligibleDate: order.eligibleDate, createdAt: order.createdAt };
}
function prioritize(input: PlanningInput) {
  return [...input.orders].sort((a, b) => {
    const first = priority(input, a), second = priority(input, b);
    return second.previousDeferrals - first.previousDeferrals || first.compatibleVehicles - second.compatibleVehicles || first.windowMinutes - second.windowMinutes
      || first.eligibleDate.localeCompare(second.eligibleDate) || first.createdAt.localeCompare(second.createdAt) || a.orderRef.localeCompare(b.orderRef);
  });
}
type Candidate = CandidateEvaluation & { vehicle: PlanningVehicle; isNewTrip: boolean };
function compareCandidates(a: Candidate, b: Candidate) {
  const remainingWeight = (candidate: Candidate) => decimal(candidate.vehicle.weightCapacityKg).sub(candidate.trip.weightKg).div(candidate.vehicle.weightCapacityKg);
  const remainingVolume = (candidate: Candidate) => decimal(candidate.vehicle.volumeCapacityM3).sub(candidate.trip.volumeM3).div(candidate.vehicle.volumeCapacityM3);
  return a.capabilityWaste - b.capabilityWaste || Number(a.isNewTrip) - Number(b.isNewTrip) || decimal(a.incrementalFuelLitres).cmp(b.incrementalFuelLitres)
    || remainingWeight(a).cmp(remainingWeight(b)) || remainingVolume(a).cmp(remainingVolume(b)) || a.trip.returnMinute - b.trip.returnMinute
    || a.vehicle.vehicleRef.localeCompare(b.vehicle.vehicleRef) || a.trip.tripNumber - b.trip.tripNumber;
}
function deferralCode(candidates: Candidate[]) {
  const codes = new Set(candidates.flatMap(candidate => candidate.checks.filter(row => !row.passed).map(row => row.code)));
  if (codes.size !== 1) return 'NO_FEASIBLE_ASSIGNMENT';
  const code = [...codes][0];
  return ({ WEIGHT_CAPACITY: 'CAPACITY', VOLUME_CAPACITY: 'CAPACITY', TEMPERATURE: 'TEMPERATURE', ACCESS: 'ACCESS', DELIVERY_WINDOW: 'DELIVERY_WINDOW',
    MALL_WINDOW: 'DELIVERY_WINDOW', FRESH_DEADLINE: 'DELIVERY_WINDOW', FUEL_UNKNOWN: 'FUEL_UNKNOWN', FUEL_QUOTA: 'FUEL_QUOTA' } as Record<string, string>)[code] ?? 'NO_FEASIBLE_ASSIGNMENT';
}
function rejectionSummary(candidates: Candidate[]) {
  const reasons = [...new Set(candidates.flatMap(candidate => candidate.checks.filter(row => !row.passed).map(row => row.code)))].sort();
  return reasons.length ? `No feasible vehicle/trip. Blocking checks observed: ${reasons.join(', ')}.` : 'No vehicle master candidates exist in the planning depot.';
}
export function generatePlan(input: PlanningInput): GeneratedPlan {
  if (!input.operatingDay) throw new DomainError('MISSING_RELATED_DATA', 'Generation requires a persisted operating calendar day.');
  const plan: GeneratedPlan = { strategyVersion: STRATEGY_VERSION, trips: [], decisions: [] };
  const vehicles = [...input.vehicles].sort((a, b) => a.vehicleRef.localeCompare(b.vehicleRef));
  for (const order of prioritize(input)) {
    const candidates = vehicles.flatMap(vehicle => Array.from({ length: MAX_DAILY_TRIPS }, (_, index): Candidate => ({
      ...evaluateCandidate(input, plan.trips, order, vehicle, index + 1), vehicle,
      isNewTrip: !plan.trips.some(trip => trip.vehicleId === vehicle.id && trip.tripNumber === index + 1) })));
    const feasible = candidates.filter(candidate => candidate.checks.every(row => row.passed)).sort(compareCandidates), selected = feasible[0];
    const rejected = candidates.filter(candidate => candidate.checks.some(row => !row.passed));
    const alternatives = rejected.sort((a, b) => a.checks.filter(row => !row.passed).length - b.checks.filter(row => !row.passed).length
      || a.vehicle.vehicleRef.localeCompare(b.vehicle.vehicleRef) || a.trip.tripNumber - b.trip.tripNumber).slice(0, 3)
      .map(candidate => ({ vehicleId: candidate.vehicle.id, vehicleRef: candidate.vehicle.vehicleRef, tripNumber: candidate.trip.tripNumber, checks: candidate.checks.filter(row => !row.passed) }));
    const decision: PlanningDecision = { orderId: order.id, orderRef: order.orderRef, orderVersion: order.version, decision: selected ? 'ASSIGNED' : 'DEFERRED',
      tripKey: selected?.trip.key ?? null, reasonCode: selected ? null : deferralCode(rejected), reason: selected ? 'Assigned by the documented deterministic depot heuristic.' : rejectionSummary(rejected),
      checks: selected?.checks ?? [...new Map(rejected.flatMap(candidate => candidate.checks.filter(row => !row.passed)).map(row => [row.code, row])).values()], alternatives, priority: priority(input, order) };
    plan.decisions.push(decision);
    if (selected) plan.trips = [...plan.trips.filter(trip => trip.key !== selected.trip.key), selected.trip];
  }
  plan.trips.sort((a, b) => vehicles.find(row => row.id === a.vehicleId)!.vehicleRef.localeCompare(vehicles.find(row => row.id === b.vehicleId)!.vehicleRef) || a.tripNumber - b.tripNumber);
  for (const decision of plan.decisions.filter(row => row.decision === 'ASSIGNED')) {
    const trip = plan.trips.find(row => row.key === decision.tripKey)!, order = input.orders.find(row => row.id === decision.orderId)!, vehicle = vehicles.find(row => row.id === trip.vehicleId)!;
    const withoutOrder = { ...trip, stops: trip.stops.filter(stop => stop.orderId !== order.id) };
    decision.checks = evaluateCandidate(input, plan.trips.map(row => row.key === trip.key ? withoutOrder : row), order, vehicle, trip.tripNumber).checks;
  }
  return plan;
}
