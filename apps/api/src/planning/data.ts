import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { DispatcherDepot, DispatcherOrderSummary, PlanningVehicleContext } from '@waypoint/shared';
import { dateOnly, weekStart } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { orderScopeWhere, tripScopeWhere } from '../dispatcher/scope.js';
import { orderDto, orderInclude } from '../dispatcher/dto.js';
import type { PlanningInput, PlanningOrder } from './model.js';
import { syntheticReferencesPermitted } from '../domain/synthetic-mode.js';

export type PlanningServiceOptions = { allowSyntheticReferences?: boolean; now?: () => Date };
export function checkPlanningOptions(options: PlanningServiceOptions) {
  if (options.allowSyntheticReferences && !syntheticReferencesPermitted()) throw new DomainError('INVALID_DOMAIN', 'Synthetic planning references require an explicitly enabled public judge demo in production.');
}
export function instantForMinute(serviceDate: string, minute: number) { return new Date(new Date(`${serviceDate}T00:00:00+05:30`).getTime() + Math.round(minute * 60000)); }
export function minuteForInstant(serviceDate: string, instant: Date | null) { return instant ? (instant.getTime() - instantForMinute(serviceDate, 0).getTime()) / 60000 : null; }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export function snapshotHash(value: unknown) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
export type PlanningSnapshot = { input: PlanningInput; facts: unknown; display: { depot: DispatcherDepot; orders: DispatcherOrderSummary[] } };

function planningOrderInclude(depotId: string, date: Date, ownRunId?: string) {
  const where: Prisma.DeferralRecordWhereInput = { AND: [
    ...(ownRunId ? [{ OR: [{ planningRunId: null }, { planningRunId: { not: ownRunId } }] }] : []),
    { OR: [{ planningRunId: null }, { planningRun: { OR: [{ strategyVersion: null }, { status: { not: 'SUPERSEDED' } },
      { serviceDate: { not: date } }, { depotId: { not: depotId } }] } }] }
  ] };
  return { ...orderInclude, _count: { select: { deferrals: { where } } }, deferrals: { where,
    orderBy: [{ deferredAt: 'desc' }, { id: 'desc' }], take: 1 } } satisfies Prisma.OrderInclude;
}
export async function getEligibleOrdersForPlanning(tx: Prisma.TransactionClient, depotId: string, serviceDate: string, options: PlanningServiceOptions = {}, ownRunId?: string, capturedIds: string[] = []) {
  const date = dateOnly(serviceDate);
  const rows = await tx.order.findMany({ where: { AND: [orderScopeWhere([depotId]), { OR: [
    { id: { in: capturedIds } }, { status: { in: ['CONFIRMED', 'CLOSED_FOR_PLANNING', 'DEFERRED'] },
      OR: [{ eligibleDeliveryDate: { lte: date } }, { eligibleDeliveryDate: null, requestedDeliveryDate: { lte: date } }],
      requestedDeliveryDate: { lte: date }, stops: { none: { active: true, ...(ownRunId ? { trip: { OR: [{ planningRunId: null }, { planningRunId: { not: ownRunId } }] } } : {}) } } }
  ] }] }, include: planningOrderInclude(depotId, date, ownRunId), orderBy: { id: 'asc' } });
  return rows.filter(row => capturedIds.includes(row.id) || ((row.outlet.source === 'OFFICIAL' || options.allowSyntheticReferences)
    && (row.status !== 'DEFERRED' || !row.deferrals[0]?.nextEligibleDate || row.deferrals[0].nextEligibleDate <= date)));
}

export async function gatherPlanningData(tx: Prisma.TransactionClient, depotId: string, serviceDate: string, options: PlanningServiceOptions = {}, ownRunId?: string, capturedIds: string[] = []) {
  checkPlanningOptions(options);
  const date = dateOnly(serviceDate), sources = options.allowSyntheticReferences ? ['OFFICIAL', 'SYNTHETIC'] as const : ['OFFICIAL'] as const;
  const [calendar, orders, vehicles, travel, allowances, existingTrips] = await Promise.all([
    tx.calendarDay.findUnique({ where: { date } }), getEligibleOrdersForPlanning(tx, depotId, serviceDate, options, ownRunId, capturedIds),
    tx.vehicle.findMany({ where: { depotId }, include: { availability: { where: { serviceDate: date } }, fuelLedgers: { where: { weekStart: weekStart(serviceDate) }, include: { usage: { where: { status: 'ACTIVE', ...(ownRunId ? { OR: [{ tripId: null }, { trip: { OR: [{ planningRunId: null }, { planningRunId: { not: ownRunId } }] } }, { kind: 'CONSUMED' }] } : {}) }, orderBy: { id: 'asc' } } } } }, orderBy: { id: 'asc' } }),
    tx.districtTravel.findMany({ where: { depotId, source: { in: [...sources] } }, orderBy: { id: 'asc' } }),
    tx.serviceAllowance.findMany({ where: { source: { in: [...sources] } }, orderBy: { id: 'asc' } }),
    tx.trip.findMany({ where: { AND: [tripScopeWhere([depotId]), { serviceDate: date, status: { not: 'CANCELLED' }, ...(ownRunId ? { OR: [{ planningRunId: null }, { planningRunId: { not: ownRunId } }] } : {}) }] }, orderBy: { id: 'asc' } })
  ]);
  const vehicleContexts: PlanningVehicleContext[] = [];
  const input: PlanningInput = { serviceDate, depotId, operatingDay: !!calendar?.operatingDay && (calendar.source === 'OFFICIAL' || options.allowSyntheticReferences === true),
    orders: orders.map((row): PlanningOrder => ({ id: row.id, orderRef: row.orderRef, version: row.version, status: row.status,
      requestedDate: row.requestedDeliveryDate.toISOString().slice(0, 10), eligibleDate: (row.eligibleDeliveryDate ?? row.requestedDeliveryDate).toISOString().slice(0, 10), createdAt: row.createdAt.toISOString(),
      temperature: row.temperatureRequirement, units: row.orderedUnits, weightKg: row.orderedWeightKg.toString(), volumeM3: row.orderedVolumeM3.toString(),
      deferralCount: row._count.deferrals, nextEligibleDate: row.deferrals[0]?.nextEligibleDate?.toISOString().slice(0, 10) ?? null,
      outlet: { id: row.outlet.id, outletRef: row.outlet.outletRef, depotId: row.outlet.depotId, district: row.outlet.district, brand: row.outlet.brand,
        dockType: row.outlet.dockType, access: row.outlet.accessConstraint, windowOpen: row.outlet.deliveryWindowOpen, windowClose: row.outlet.deliveryWindowClose,
        mallOpen: row.outlet.mallWindowOpen, mallClose: row.outlet.mallWindowClose } })),
    vehicles: vehicles.map(row => {
      const availability = row.availability[0], ledger = row.fuelLedgers[0];
      const known = ledger?.openingConsumedLitres != null && (options.allowSyntheticReferences || ledger.openingSource === 'OFFICIAL' && row.source === 'OFFICIAL' && ledger.usage.every(usage => usage.source === 'OFFICIAL'));
      const remaining = known ? row.weeklyFuelQuotaLitres.sub(ledger.openingConsumedLitres!).sub(ledger.usage.reduce((sum, usage) => sum.add(usage.litres), new Prisma.Decimal(0))).toString() : null;
      const available = availability && (availability.source === 'OFFICIAL' || options.allowSyntheticReferences) ? availability.status : 'UNKNOWN';
      vehicleContexts.push({ id: row.id, vehicleRef: row.vehicleRef, active: row.active, availability: available, availableFromMinute: availability?.availableFromMinute ?? null,
        availableUntilMinute: availability?.availableUntilMinute ?? null, availabilitySource: availability?.source ?? null, fuelKnown: !!known, remainingFuelLitres: remaining });
      return { id: row.id, vehicleRef: row.vehicleRef, depotId: row.depotId, active: row.active && (row.source === 'OFFICIAL' || options.allowSyntheticReferences === true), type: row.type,
        temperature: row.temperatureCapability, weightCapacityKg: row.weightCapacityKg.toString(), volumeCapacityM3: row.volumeCapacityM3.toString(), kmPerLitre: row.kmPerLitre.toString(),
        availability: available, availableFromMinute: availability?.availableFromMinute ?? null, availableUntilMinute: availability?.availableUntilMinute ?? null, fuelKnown: !!known, remainingFuelLitres: remaining };
    }), travel: travel.map(row => ({ depotId: row.depotId, district: row.district, depotKm: row.depotDistanceKm.toString(), depotMinutes: row.depotMinutes.toString(), interStopKm: row.interStopKm.toString(), interStopMinutes: row.interStopMinutes.toString() })),
    allowances: allowances.map(row => ({ brand: row.brand, dockType: row.dockType, minutes: row.serviceMinutes.toString() })),
    existingTrips: existingTrips.map(row => ({ id: row.id, vehicleId: row.vehicleId, tripNumber: row.tripNumber, status: row.status, departureMinute: minuteForInstant(serviceDate, row.plannedDeparture), returnMinute: minuteForInstant(serviceDate, row.plannedReturn) })) };
  const depot = await tx.depot.findUniqueOrThrow({ where: { id: depotId }, select: { id: true, name: true } });
  const facts = { calendar, vehicles, travel, allowances, existingTrips, outlets: orders.map(row => row.outlet) };
  const display = { depot, orders: orders.map(orderDto) };
  return { snapshot: JSON.parse(JSON.stringify({ input, facts, display })) as PlanningSnapshot, input, vehicleContexts, orders, vehicles };
}

export function compareSnapshot(captured: PlanningSnapshot, fresh: PlanningSnapshot) {
  const initial = new Map(captured.input.orders.map(row => [row.id, row]));
  const comparable = { ...fresh, input: { ...fresh.input, orders: fresh.input.orders.map(row => {
    const original = initial.get(row.id);
    return original ? { ...row, version: original.version, status: original.status } : row;
  }) } };
  return snapshotHash({ input: captured.input, facts: captured.facts }) === snapshotHash({ input: comparable.input, facts: comparable.facts });
}
