import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';

async function main() {
  const { values } = parseArgs({ options: {
    email: { type: 'string', default: 'dispatcher@waypoint.local' },
    'depot-id': { type: 'string', multiple: true }, 'depot-name': { type: 'string', multiple: true },
    replace: { type: 'boolean', default: false }
  } });
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('Dispatcher demo assignment requires a local development database.');
  }
  const ids = values['depot-id'], names = values['depot-name'];
  if (Boolean(ids?.length) === Boolean(names?.length)) throw new Error('Provide --depot-id or --depot-name; repeat the option for multiple depots.');
  const requested = [...new Set(ids ? z.array(z.string().uuid()).parse(ids) : z.array(z.string().trim().min(1).max(80)).parse(names))];
  const email = z.string().email().parse(values.email).toLowerCase();
  const db = new PrismaClient();
  try {
    const result = await db.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user?.active || user.role !== 'DISPATCHER') throw new Error('An active Dispatcher account is required.');
      const depots = await tx.depot.findMany({ where: ids ? { id: { in: requested } } : { name: { in: requested } }, select: { id: true } });
      if (depots.length !== requested.length) throw new Error('A requested depot was not found. Import references or install explicit synthetic fixtures first.');
      const current = await tx.userDepot.findMany({ where: { userId: user.id }, select: { depotId: true } });
      const depotIds = depots.map(row => row.id).sort();
      const unchanged = current.length === depotIds.length && current.every(row => depotIds.includes(row.depotId));
      if (!unchanged && current.length && !values.replace) throw new Error('An assignment exists. Use --replace explicitly to change the local demo scope.');
      if (!unchanged) {
        await tx.userDepot.deleteMany({ where: { userId: user.id } });
        await tx.userDepot.createMany({ data: depotIds.map(depotId => ({ userId: user.id, depotId })) });
      }
      return { assigned: true, unchanged, userId: user.id, depotIds, depotCount: depotIds.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  console.error(error instanceof z.ZodError ? 'Invalid assignment arguments.' : error instanceof Error ? error.message : 'Dispatcher assignment failed.');
  process.exitCode = 1;
});
