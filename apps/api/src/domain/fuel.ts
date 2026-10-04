import { Prisma, type PrismaClient } from '@prisma/client';
import { weekStart } from './dates.js';
import { DomainError } from './errors.js';

export async function fuelAvailability(db: PrismaClient | Prisma.TransactionClient, vehicleId: string, date: string) {
  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throw new DomainError('DOMAIN_NOT_FOUND', 'Vehicle not found.');
  const ledger = await db.fuelLedger.findUnique({ where: { vehicleId_weekStart: { vehicleId, weekStart: weekStart(date) } }, include: { usage: { where: { status: 'ACTIVE' } } } });
  const sum = (kind: 'CONSUMED' | 'RESERVED') => (ledger?.usage ?? []).filter(row => row.kind === kind).reduce((value, row) => value.add(row.litres), new Prisma.Decimal(0));
  const consumed = sum('CONSUMED'), planned = sum('RESERVED');
  const known = ledger?.openingConsumedLitres != null;
  return { weekStart: weekStart(date).toISOString().slice(0, 10), quotaLitres: vehicle.weeklyFuelQuotaLitres.toString(), known,
    openingSource: ledger?.openingSource ?? null, referenceSource: vehicle.source,
    authoritative: known && ledger!.openingSource === 'OFFICIAL' && vehicle.source === 'OFFICIAL' && ledger!.usage.every(row => row.source === 'OFFICIAL'),
    recordedConsumedLitres: consumed.toString(), reservedLitres: planned.toString(),
    openingConsumedLitres: ledger?.openingConsumedLitres?.toString() ?? null,
    remainingLitres: known ? vehicle.weeklyFuelQuotaLitres.sub(ledger!.openingConsumedLitres!).sub(consumed).sub(planned).toString() : null };
}
