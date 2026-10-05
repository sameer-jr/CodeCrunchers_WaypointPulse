import { Prisma, type OutletLocation as LocationRecord, type TripPosition as PositionRecord, type PrismaClient } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { outletLocationSchema, tripPositionSchema, type OutletLocation, type TripLocation, type TripPosition } from '@waypoint/shared';
import { appendAudit, type DomainActor } from '../domain/audit.js';
import { DomainError } from '../domain/errors.js';
import { assertOutletScope, requireRole, resolveActor } from '../domain/scope.js';
import { resolveDispatcherScope, tripScopeWhere } from '../dispatcher/scope.js';
import { scopedDriverTrip } from '../driver/scope.js';
import { resolveStoreScope } from '../store/scope.js';

export type LocationServiceOptions = { now?: () => Date };
export const POSITION_STALE_AFTER_SECONDS = 120;
function parse<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_DOMAIN', 'Check the coordinates, accuracy, timestamp and location version.');
  return parsed.data;
}
function id(value: string) { return parse(z.string().uuid(), value); }
function decimal(value: number, places = 7) { return new Prisma.Decimal(value.toFixed(places)); }
function locationDto(row: LocationRecord): OutletLocation {
  return { outletId: row.outletId, latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber(), label: row.label,
    version: row.version, recordedAt: row.recordedAt.toISOString() };
}
function positionDto(row: PositionRecord): TripPosition {
  return { tripId: row.tripId, latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber(), accuracyMetres: row.accuracyMetres.toNumber(),
    eventAt: row.eventAt.toISOString(), receivedAt: row.receivedAt.toISOString() };
}
async function transaction<T>(db: PrismaClient, userId: string, work: (tx: Prisma.TransactionClient, actor: DomainActor) => Promise<T>, mutation = false): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => work(tx, await resolveActor(tx, userId)), {
        isolationLevel: mutation ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034' && attempt < 2) continue;
        if (['P2002', 'P2034'].includes(error.code)) throw new DomainError('DOMAIN_CONFLICT', 'This location changed concurrently. Refresh before trying again.');
      }
      throw error;
    }
  }
}
export async function readTripLocation(db: PrismaClient, userId: string, tripId: string, options: LocationServiceOptions = {}): Promise<TripLocation> {
  id(tripId);
  return transaction(db, userId, async (tx, actor) => {
    requireRole(actor, ['DISPATCHER', 'DRIVER', 'STORE_MANAGER']);
    let where: Prisma.TripWhereInput = { id: tripId }, outletId: string | undefined;
    if (actor.role === 'DRIVER') await scopedDriverTrip(tx, actor, tripId);
    else if (actor.role === 'DISPATCHER') {
      const scope = await resolveDispatcherScope(tx, actor.id);
      where = { id: tripId, ...tripScopeWhere(scope.depotIds) };
    } else {
      const scope = await resolveStoreScope(tx, actor.id);
      outletId = scope.outlet.id;
      where = { id: tripId, vehicle: { depotId: scope.outlet.depotId }, status: { in: ['READY_FOR_DISPATCH', 'IN_TRANSIT', 'COMPLETED'] },
        planningRun: { is: { status: 'RELEASED', releasedAt: { not: null }, supersededAt: null, strategyVersion: { not: null } } },
        stops: { some: { active: true, status: { not: 'CANCELLED' }, order: { outletId } } } };
    }
    const trip = await tx.trip.findFirst({ where, include: { position: true, stops: {
      where: { active: true, status: { not: 'CANCELLED' }, ...(outletId ? { order: { outletId } } : {}) }, orderBy: { sequence: 'asc' },
      include: { order: { include: { outlet: { include: { location: true } } } } }
    } } });
    if (!trip) throw new DomainError('DOMAIN_FORBIDDEN', 'This trip is outside your location tracking scope.');
    const position = trip.position?.driverUserId === trip.driverUserId ? positionDto(trip.position) : null;
    const now = options.now?.() ?? new Date();
    return { tripId: trip.id, tripRef: trip.tripRef, status: trip.status, serviceDate: trip.serviceDate.toISOString().slice(0, 10), stopCount: trip.stops.length,
      stops: trip.stops.map(stop => {
        const outlet = stop.order.outlet;
        return { stopId: stop.id, sequence: stop.sequence, orderId: stop.orderId, outletId: outlet.id, outletRef: outlet.outletRef,
          brand: outlet.brand, district: outlet.district, location: outlet.location ? locationDto(outlet.location) : null };
      }), position, positionStale: !!position && now.getTime() - new Date(position.eventAt).getTime() > POSITION_STALE_AFTER_SECONDS * 1000,
      positionStaleAfterSeconds: POSITION_STALE_AFTER_SECONDS };
  });
}
export async function recordOutletLocation(db: PrismaClient, userId: string, outletId: string, input: unknown, options: LocationServiceOptions = {}): Promise<OutletLocation> {
  id(outletId);
  const request = parse(outletLocationSchema, input);
  return transaction(db, userId, async (tx, actor) => {
    requireRole(actor, ['DISPATCHER']);
    await assertOutletScope(tx, actor, outletId);
    const previous = await tx.outletLocation.findUnique({ where: { outletId } });
    if ((previous?.version ?? 0) !== request.expectedVersion) throw new DomainError('DOMAIN_CONFLICT', 'The outlet location changed. Refresh before saving.');
    const data = { latitude: decimal(request.latitude), longitude: decimal(request.longitude), label: request.label || null,
      recordedByUserId: actor.id, recordedAt: options.now?.() ?? new Date() };
    if (previous) {
      const changed = await tx.outletLocation.updateMany({ where: { outletId, version: request.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (changed.count !== 1) throw new DomainError('DOMAIN_CONFLICT', 'The outlet location changed. Refresh before saving.');
    } else await tx.outletLocation.create({ data: { outletId, ...data } });
    const saved = await tx.outletLocation.findUniqueOrThrow({ where: { outletId } });
    await appendAudit(tx, { actor, eventType: 'OUTLET_LOCATION_RECORDED', entityType: 'OUTLET', entityId: outletId,
      metadata: { version: saved.version, location: { latitude: saved.latitude.toNumber(), longitude: saved.longitude.toNumber(), label: saved.label,
        previousLatitude: previous?.latitude.toNumber() ?? null, previousLongitude: previous?.longitude.toNumber() ?? null,
        previousLabel: previous?.label ?? null, reason: request.reason } } });
    return locationDto(saved);
  }, true);
}
export async function recordTripPosition(db: PrismaClient, userId: string, tripId: string, input: unknown, options: LocationServiceOptions = {}): Promise<TripPosition> {
  id(tripId);
  const request = parse(tripPositionSchema, input);
  return transaction(db, userId, async (tx, actor) => {
    requireRole(actor, ['DRIVER']);
    await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id" = ${tripId}::uuid FOR SHARE`;
    const trip = await scopedDriverTrip(tx, actor, tripId);
    if (trip.status !== 'IN_TRANSIT' || !trip.actualDeparture || trip.completedAt) throw new DomainError('DOMAIN_CONFLICT', 'Location sharing requires your active in-transit trip.');
    const now = options.now?.() ?? new Date(), eventAt = new Date(request.eventAt), age = now.getTime() - eventAt.getTime();
    if (age > POSITION_STALE_AFTER_SECONDS * 1000 || age < -30000 || eventAt < trip.actualDeparture) {
      throw new DomainError('DOMAIN_CONFLICT', 'This location reading is too old, ahead of server time, or predates departure. Obtain a fresh reading.');
    }
    const previous = await tx.tripPosition.findUnique({ where: { tripId } });
    if (previous && eventAt <= previous.eventAt) throw new DomainError('DOMAIN_CONFLICT', 'A newer location reading is already stored. Obtain a fresh reading.');
    const data = { driverUserId: actor.id, latitude: decimal(request.latitude), longitude: decimal(request.longitude),
      accuracyMetres: decimal(request.accuracyMetres, 3), eventAt, receivedAt: now };
    if (previous) {
      const changed = await tx.tripPosition.updateMany({ where: { tripId, eventAt: { lt: eventAt } }, data });
      if (changed.count !== 1) throw new DomainError('DOMAIN_CONFLICT', 'A newer location reading is already stored. Obtain a fresh reading.');
    } else await tx.tripPosition.create({ data: { tripId, ...data } });
    return positionDto(await tx.tripPosition.findUniqueOrThrow({ where: { tripId } }));
  }, true);
}
