import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TemperatureCapability, TemperatureRequirement } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { evaluateCandidate } from './constraints.js';
import { generatePlan } from './engine.js';
import type { ConstraintCode, GeneratedPlan, PlanningInput, PlanningOrder, PlanningVehicle } from './model.js';
import { scheduleTrip } from './timing.js';
import { validatePlan } from './validator.js';
import { handAuthoredPlan, planningInput, planningOrder, planningVehicle } from './testing/synthetic.js';

function candidate(input: PlanningInput, tripNumber = 1) {
  return evaluateCandidate(input, [], input.orders[0], input.vehicles[0], tripNumber);
}
function check(input: PlanningInput, code: ConstraintCode, passed: boolean, tripNumber = 1) {
  expect(candidate(input, tripNumber).checks).toEqual(expect.arrayContaining([expect.objectContaining({ code, passed, severity: 'BLOCKING' })]));
}
function orderWithOutlet(outlet: Partial<PlanningOrder['outlet']>, overrides: Partial<PlanningOrder> = {}) {
  return planningOrder({ ...overrides, outlet: { ...planningOrder().outlet, ...outlet } });
}

describe('Independent planning constraint boundaries', () => {
  it.each([
    ['AMBIENT', 'AMBIENT', true], ['AMBIENT', 'REEFER', true], ['CHILLED', 'AMBIENT', false],
    ['CHILLED', 'REEFER', true], ['FROZEN', 'AMBIENT', false], ['FROZEN', 'REEFER', true]
  ] as [TemperatureRequirement, TemperatureCapability, boolean][])('checks %s demand against %s capability', (temperature, capability, passed) => {
    check(planningInput({ orders: [planningOrder({ temperature })], vehicles: [planningVehicle({ temperature: capability })] }), 'TEMPERATURE', passed);
  });
  it.each([['TRUCK', false], ['VAN', true]] as const)('checks van-only access against %s', (type, passed) => {
    check(planningInput({ orders: [orderWithOutlet({ access: 'VAN_ONLY' })], vehicles: [planningVehicle({ type })] }), 'ACCESS', passed);
  });
  it('rejects the wrong serving depot', () => {
    check(planningInput({ vehicles: [planningVehicle({ depotId: 'synthetic-foreign-depot' })] }), 'DEPOT', false);
  });
  it.each([['1000', true], ['1000.001', false]] as const)('checks exact weight boundary %s', (weightKg, passed) => {
    check(planningInput({ orders: [planningOrder({ weightKg })] }), 'WEIGHT_CAPACITY', passed);
  });
  it.each([['10', true], ['10.001', false]] as const)('checks exact volume boundary %s independently', (volumeM3, passed) => {
    check(planningInput({ orders: [planningOrder({ volumeM3 })] }), 'VOLUME_CAPACITY', passed);
  });
  it.each(['UNKNOWN', 'UNAVAILABLE'] as const)('rejects %s availability instead of inferring it from unused master records', availability => {
    check(planningInput({ vehicles: [planningVehicle({ availability })] }), 'VEHICLE_AVAILABLE', false);
  });
  it('rejects an inactive master even when a date-specific record says available', () => {
    check(planningInput({ vehicles: [planningVehicle({ active: false })] }), 'VEHICLE_AVAILABLE', false);
  });
  it.each([[1, true], [2, true], [3, false]] as const)('checks daily trip slot %s', (tripNumber, passed) => {
    check(planningInput(), 'TRIP_LIMIT', passed, tripNumber);
  });
  it('counts two existing persisted trips and rejects a third', () => {
    const input = planningInput({ existingTrips: [1, 2].map(tripNumber => ({ id: `existing-${tripNumber}`, vehicleId: planningVehicle().id,
      tripNumber, departureMinute: 300, returnMinute: 400, status: 'RELEASED' })) });
    check(input, 'TRIP_LIMIT', false, 3);
  });
  it.each([['4', true], ['3.999', false]] as const)('checks exact round-trip fuel requirement against %s litres', (remainingFuelLitres, passed) => {
    check(planningInput({ vehicles: [planningVehicle({ remainingFuelLitres })] }), 'FUEL_QUOTA', passed);
  });
  it('rejects unknown fuel without replacing it with zero historical usage', () => {
    check(planningInput({ vehicles: [planningVehicle({ fuelKnown: false, remainingFuelLitres: null })] }), 'FUEL_UNKNOWN', false);
  });
  it('rejects a nonoperating service day', () => { check(planningInput({ operatingDay: false }), 'OPERATING_DAY', false); });
  it.each([[330, true], [329, false]] as const)('checks service completion against delivery close %s', (windowClose, passed) => {
    check(planningInput({ orders: [orderWithOutlet({ windowClose })] }), 'DELIVERY_WINDOW', passed);
  });
  it('records deterministic early waiting and complete return travel', () => {
    const input = planningInput({ orders: [orderWithOutlet({ brand: 'TECH', windowOpen: 360, windowClose: 720 })] });
    const trip = scheduleTrip(input, input.vehicles[0], 1, input.orders);
    expect(trip).toMatchObject({ departureMinute: 300, returnMinute: 390, distanceKm: '40', fuelLitres: '4' });
    expect(trip.stops[0]).toMatchObject({ arrivalMinute: 320, serviceStartMinute: 360, serviceCompleteMinute: 370,
      waitingMinutes: 40, serviceMinutes: 10 });
  });
  it.each([[340, true], [339, false]] as const)('enforces mall completion close %s', (mallClose, passed) => {
    check(planningInput({ orders: [orderWithOutlet({ brand: 'STYLE', dockType: 'MALL_BAY', access: 'MALL_DOCK',
      windowOpen: 300, windowClose: 720, mallOpen: 330, mallClose })] }), 'MALL_WINDOW', passed);
  });
  it('checks the Fresh receiving-start deadline separately from a wider stored window', () => {
    check(planningInput({ orders: [orderWithOutlet({ windowClose: 600 })],
      vehicles: [planningVehicle({ availableFromMinute: 470 })] }), 'FRESH_DEADLINE', false);
  });
  it('requires enough available time for the return leg', () => {
    check(planningInput({ vehicles: [planningVehicle({ availableUntilMinute: 349 })] }), 'TIME_FEASIBILITY', false);
  });
  it('starts trip two after recorded return plus the documented 15 minute turnaround', () => {
    const input = planningInput({ existingTrips: [{ id: 'existing-one', vehicleId: planningVehicle().id, tripNumber: 1,
      departureMinute: 300, returnMinute: 400, status: 'RELEASED' }] });
    const trip = scheduleTrip(input, input.vehicles[0], 2, input.orders);
    expect(trip).toMatchObject({ departureMinute: 415, returnMinute: 465 });
    expect(trip.stops[0]).toMatchObject({ arrivalMinute: 435, serviceCompleteMinute: 445 });
  });
  it('fails closed when required depot/district travel or service references are missing', () => {
    check(planningInput({ travel: [] }), 'REFERENCE_DATA', false);
    check(planningInput({ allowances: [] }), 'REFERENCE_DATA', false);
  });
  it('recomputes all stops, capacities and inter-stop travel when appending an order', () => {
    const second = planningOrder({ id: 'synthetic-order-2', orderRef: 'SYN-PLAN-ORDER-2' });
    const input = planningInput({ orders: [planningOrder(), second] });
    const firstTrip = scheduleTrip(input, input.vehicles[0], 1, [input.orders[0]]);
    const result = evaluateCandidate(input, [firstTrip], second, input.vehicles[0], 1);
    expect(result.trip).toMatchObject({ weightKg: '200', volumeM3: '2', distanceKm: '42', fuelLitres: '4.2', returnMinute: 365 });
    expect(result.trip.stops.map(stop => [stop.sequence, stop.arrivalMinute, stop.serviceCompleteMinute])).toEqual([[1, 320, 330], [2, 335, 345]]);
  });
  it('uses both depot keys and conservative depot travel between different districts', () => {
    const second = orderWithOutlet({ district: 'SYNTHETIC Beta', brand: 'TECH', windowClose: 1080 },
      { id: 'synthetic-order-2', orderRef: 'SYN-PLAN-ORDER-2' });
    const input = planningInput({ orders: [planningOrder(), second], travel: [...planningInput().travel,
      { depotId: 'synthetic-depot', district: 'SYNTHETIC Beta', depotKm: '30', depotMinutes: '30', interStopKm: '3', interStopMinutes: '7' },
      { depotId: 'synthetic-foreign-depot', district: 'SYNTHETIC Beta', depotKm: '1', depotMinutes: '1', interStopKm: '1', interStopMinutes: '1' }] });
    const trip = scheduleTrip(input, input.vehicles[0], 1, input.orders);
    expect(trip).toMatchObject({ distanceKm: '100', fuelLitres: '10', returnMinute: 420 });
    expect(trip.stops[1]).toMatchObject({ arrivalMinute: 380, serviceCompleteMinute: 390 });
  });
});

describe('Deterministic allocation decisions and explainability', () => {
  it('covers excess demand exactly once and keeps deferred orders out of trip stops', () => {
    const input = planningInput({ orders: Array.from({ length: 5 }, (_, index) => planningOrder({ id: `demand-${index}`,
      orderRef: `SYN-DEMAND-${index}`, weightKg: '600' })) });
    const plan = generatePlan(input);
    expect(plan.decisions).toHaveLength(5);
    expect(new Set(plan.decisions.map(decision => decision.orderId)).size).toBe(5);
    expect(plan.decisions.filter(decision => decision.decision === 'ASSIGNED')).toHaveLength(2);
    const deferred = plan.decisions.filter(decision => decision.decision === 'DEFERRED');
    expect(deferred).toHaveLength(3);
    expect(deferred.every(decision => decision.tripKey === null && !!decision.reasonCode && !!decision.reason)).toBe(true);
    expect(plan.trips.flatMap(trip => trip.stops.map(stop => stop.orderId)).sort()).toEqual(plan.decisions.filter(decision => decision.decision === 'ASSIGNED').map(decision => decision.orderId).sort());
    expect(validatePlan(input, plan)).toEqual({ valid: true, issues: [] });
  });
  it('gives a previously deferred feasible order priority for the only remaining capacity', () => {
    const old = planningOrder({ id: 'previously-deferred', orderRef: 'SYN-OLD', status: 'DEFERRED', deferralCount: 2 });
    const newer = planningOrder({ id: 'newer-order', orderRef: 'SYN-NEW', createdAt: '2040-03-05T00:00:00.000Z' });
    const input = planningInput({ orders: [newer, old], vehicles: [planningVehicle({ weightCapacityKg: '100' })],
      existingTrips: [{ id: 'slot-one-used', vehicleId: planningVehicle().id, tripNumber: 1, departureMinute: 300, returnMinute: 350, status: 'RELEASED' }] });
    const plan = generatePlan(input);
    expect(plan.decisions.find(decision => decision.orderId === old.id)?.decision).toBe('ASSIGNED');
    expect(plan.decisions.find(decision => decision.orderId === newer.id)?.decision).toBe('DEFERRED');
  });
  it('never overrides temperature/access feasibility to improve deferral priority', () => {
    const order = orderWithOutlet({ access: 'VAN_ONLY' }, { temperature: 'CHILLED', deferralCount: 7, status: 'DEFERRED' });
    const plan = generatePlan(planningInput({ orders: [order] }));
    expect(plan.trips).toEqual([]); expect(plan.decisions[0].decision).toBe('DEFERRED');
    const evidence = [...plan.decisions[0].checks, ...plan.decisions[0].alternatives.flatMap(alternative => alternative.checks)];
    expect(evidence).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TEMPERATURE', passed: false }), expect.objectContaining({ code: 'ACCESS', passed: false })]));
  });
  it('prefers ambient normal capacity while preserving scarce reefer capability', () => {
    const ambient = planningVehicle(), reefer = planningVehicle({ id: 'synthetic-reefer', vehicleRef: 'SYN-REEFER', temperature: 'REEFER' });
    const cold = planningOrder({ id: 'cold-order', orderRef: 'SYN-COLD', temperature: 'CHILLED' });
    const plan = generatePlan(planningInput({ orders: [planningOrder(), cold], vehicles: [reefer, ambient] }));
    const assignedVehicle = (id: string) => plan.trips.find(trip => trip.key === plan.decisions.find(decision => decision.orderId === id)?.tripKey)?.vehicleId;
    expect(assignedVehicle(cold.id)).toBe(reefer.id); expect(assignedVehicle(planningOrder().id)).toBe(ambient.id);
  });
  it('is deterministic for identical facts and reversed collection insertion order', () => {
    const input = planningInput({ orders: [planningOrder(), planningOrder({ id: 'another', orderRef: 'SYN-ANOTHER', weightKg: '980' })],
      vehicles: [planningVehicle(), planningVehicle({ id: 'another-vehicle', vehicleRef: 'SYN-ANOTHER-VEHICLE', temperature: 'REEFER' })] });
    const before = structuredClone(input), first = generatePlan(input), again = generatePlan(structuredClone(input));
    const reversed = generatePlan({ ...structuredClone(input), orders: [...input.orders].reverse(), vehicles: [...input.vehicles].reverse(),
      travel: [...input.travel].reverse(), allowances: [...input.allowances].reverse() });
    expect(again).toEqual(first); expect(reversed).toEqual(first); expect(input).toEqual(before);
  });
  it('produces structured passed checks and actual failed alternatives for inspection', () => {
    const input = planningInput({ orders: [planningOrder({ temperature: 'CHILLED' })],
      vehicles: [planningVehicle(), planningVehicle({ id: 'reefer', vehicleRef: 'SYN-REEFER', temperature: 'REEFER' })] });
    const decision = generatePlan(input).decisions[0];
    expect(decision.decision).toBe('ASSIGNED'); expect(decision.checks.length).toBeGreaterThan(0);
    expect(decision.checks.every(item => item.passed && !!item.code && !!item.reason && typeof item.actual === 'string' && typeof item.required === 'string')).toBe(true);
    expect(decision.alternatives.some(alternative => alternative.vehicleId === planningVehicle().id && alternative.checks.some(item => item.code === 'TEMPERATURE' && !item.passed))).toBe(true);
  });
  it('plans independently synthetic 120-outlet/60-vehicle demand within a measured generous bound', () => {
    const orders = Array.from({ length: 120 }, (_, index) => orderWithOutlet({ id: `performance-outlet-${index}`,
      outletRef: `SYN-PERFORMANCE-OUTLET-${String(index).padStart(3, '0')}`, district: `SYNTHETIC District ${index % 4}`,
      access: index % 7 === 0 ? 'VAN_ONLY' : 'NORMAL' }, { id: `performance-order-${index}`, orderRef: `SYN-PERFORMANCE-${String(index).padStart(3, '0')}`,
      weightKg: '100', volumeM3: '1', temperature: index % 5 === 0 ? 'CHILLED' : 'AMBIENT' }));
    const vehicles: PlanningVehicle[] = Array.from({ length: 60 }, (_, index) => planningVehicle({ id: `performance-vehicle-${index}`,
      vehicleRef: `SYN-PERFORMANCE-VEHICLE-${String(index).padStart(2, '0')}`, type: index % 6 === 0 ? 'VAN' : 'TRUCK',
      temperature: index % 4 === 0 ? 'REEFER' : 'AMBIENT' }));
    const travel = Array.from({ length: 4 }, (_, index) => ({ ...planningInput().travel[0], district: `SYNTHETIC District ${index}`, depotKm: String(20 + index * 5), depotMinutes: String(20 + index * 5) }));
    const input = planningInput({ orders, vehicles, travel }), started = performance.now(), plan = generatePlan(input), elapsed = performance.now() - started;
    const validationStarted = performance.now(), validation = validatePlan(input, plan), validationElapsed = performance.now() - validationStarted;
    expect(new Set(orders.map(order => order.outlet.id)).size).toBe(120);
    expect(plan.decisions).toHaveLength(120); expect(validation).toEqual({ valid: true, issues: [] });
    expect(elapsed, `Synthetic 120-outlet/60-vehicle generation took ${elapsed.toFixed(1)}ms`).toBeLessThan(10000);
    writeFileSync(resolve('.local/m5-benchmark.json'), JSON.stringify({ outlets: 120, orders: 120, vehicles: 60, districts: 4,
      generationMs: elapsed, independentValidationMs: validationElapsed, trips: plan.trips.length,
      served: plan.decisions.filter(row => row.decision === 'ASSIGNED').length, deferred: plan.decisions.filter(row => row.decision === 'DEFERRED').length }, null, 2));
    console.info(`SYNTHETIC planning benchmark: 120 outlets / 120 orders / 60 vehicles / 4 districts / generation ${elapsed.toFixed(1)}ms / independent validation ${validationElapsed.toFixed(1)}ms / ${plan.trips.length} trips / ${plan.decisions.filter(row => row.decision === 'ASSIGNED').length} served`);
  }, 20000);
});

describe('Independent final validator on hand-authored plans', () => {
  it('accepts a manually calculated valid plan without calling the allocator', () => {
    expect(validatePlan(planningInput(), handAuthoredPlan())).toEqual({ valid: true, issues: [] });
  });
  it.each([
    ['DEPOT', (input: PlanningInput) => { input.vehicles[0].depotId = 'foreign'; }],
    ['TEMPERATURE', (input: PlanningInput) => { input.orders[0].temperature = 'CHILLED'; }],
    ['ACCESS', (input: PlanningInput) => { input.orders[0].outlet.access = 'VAN_ONLY'; }],
    ['WEIGHT_CAPACITY', (input: PlanningInput) => { input.vehicles[0].weightCapacityKg = '99.999'; }],
    ['VOLUME_CAPACITY', (input: PlanningInput) => { input.vehicles[0].volumeCapacityM3 = '0.999'; }],
    ['DELIVERY_WINDOW', (input: PlanningInput) => { input.orders[0].outlet.windowClose = 329; }],
    ['FUEL_QUOTA', (input: PlanningInput) => { input.vehicles[0].remainingFuelLitres = '3.999'; }],
    ['FUEL_UNKNOWN', (input: PlanningInput) => { input.vehicles[0].fuelKnown = false; input.vehicles[0].remainingFuelLitres = null; }],
    ['VEHICLE_AVAILABLE', (input: PlanningInput) => { input.vehicles[0].availability = 'UNAVAILABLE'; }],
    ['OPERATING_DAY', (input: PlanningInput) => { input.operatingDay = false; }],
    ['STALE_ORDER', (input: PlanningInput) => { input.orders[0].version = 3; }]
  ] as const)('independently catches %s after source facts change', (code, mutate) => {
    const input = planningInput(); mutate(input);
    const result = validatePlan(input, handAuthoredPlan());
    expect(result.valid).toBe(false); expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });
  it('catches duplicate assignment independently of SQL unique constraints', () => {
    const plan = handAuthoredPlan();
    plan.trips[0].stops.push({ ...plan.trips[0].stops[0], sequence: 2 }); plan.decisions.push(structuredClone(plan.decisions[0]));
    expect(validatePlan(planningInput(), plan).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DUPLICATE_ORDER' })]));
  });
  it('catches an invalid stop sequence', () => {
    const plan = handAuthoredPlan(); plan.trips[0].stops[0].sequence = 2;
    expect(validatePlan(planningInput(), plan).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SEQUENCE' })]));
  });
  it('catches uncovered required demand', () => {
    const plan = handAuthoredPlan(); plan.decisions = [];
    expect(validatePlan(planningInput(), plan).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'COVERAGE' })]));
  });
  it('catches an illegal third trip independently of the database range check', () => {
    const plan = handAuthoredPlan(); plan.trips[0].tripNumber = 3;
    expect(validatePlan(planningInput(), plan).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TRIP_LIMIT' })]));
  });
  it('recomputes timing instead of trusting the generated timestamp fields', () => {
    const plan = handAuthoredPlan(); plan.trips[0].stops[0].arrivalMinute = 319;
    expect(validatePlan(planningInput(), plan).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TIMING' })]));
  });
  it('rejects understated fuel estimates instead of trusting check metadata', () => {
    const plan = handAuthoredPlan(); plan.trips[0].fuelLitres = '0.001';
    expect(validatePlan(planningInput(), plan).valid).toBe(false);
  });
  it('checks aggregate fuel across two individually feasible trips', () => {
    const input = planningInput({ orders: [planningOrder(), planningOrder({ id: 'synthetic-order-2', orderRef: 'SYN-PLAN-ORDER-2' })],
      vehicles: [planningVehicle({ remainingFuelLitres: '7.999' })] });
    const plan: GeneratedPlan = handAuthoredPlan(), secondTrip = structuredClone(plan.trips[0]);
    secondTrip.key = 'synthetic-vehicle-1:2'; secondTrip.tripNumber = 2; secondTrip.departureMinute = 365; secondTrip.returnMinute = 415;
    secondTrip.stops[0] = { ...secondTrip.stops[0], orderId: 'synthetic-order-2', arrivalMinute: 385, serviceStartMinute: 385, serviceCompleteMinute: 395 };
    plan.trips.push(secondTrip); plan.decisions.push({ ...structuredClone(plan.decisions[0]), orderId: 'synthetic-order-2', orderRef: 'SYN-PLAN-ORDER-2', tripKey: secondTrip.key });
    expect(validatePlan(input, plan).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'FUEL_QUOTA' })]));
  });
});
