import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';

async function main() {
  const { values } = parseArgs({ options: { email: { type: 'string', default: 'store@waypoint.local' }, 'outlet-id': { type: 'string' }, 'outlet-ref': { type: 'string' }, replace: { type: 'boolean', default: false } } });
  if (process.env.NODE_ENV === 'production') throw new Error('Store demo assignment is disabled in production.');
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) throw new Error('This demo command only manages a local development database.');
  const email = z.string().email().parse(values.email).toLowerCase();
  if (Boolean(values['outlet-id']) === Boolean(values['outlet-ref'])) throw new Error('Provide exactly one --outlet-id UUID or --outlet-ref private reference.');
  const id = values['outlet-id'] ? z.string().uuid().parse(values['outlet-id']) : undefined;
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user?.active || user.role !== 'STORE_MANAGER') throw new Error('An active Store Manager account is required.');
      const outlet = await tx.outlet.findUnique({ where: id ? { id } : { outletRef: values['outlet-ref'] } });
      if (!outlet) throw new Error('Outlet not found. Import official references or install explicit synthetic judge fixtures first.');
      const assignments = await tx.userOutlet.findMany({ where: { userId: user.id } });
      const unchanged = assignments.length === 1 && assignments[0]!.outletId === outlet.id;
      if (!unchanged && assignments.length && !values.replace) throw new Error('An assignment exists. Use --replace explicitly to change the local demo scope.');
      if (!unchanged) {
        await tx.userOutlet.deleteMany({ where: { userId: user.id } });
        await tx.userOutlet.create({ data: { userId: user.id, outletId: outlet.id } });
      }
      return { assigned: true, unchanged, source: outlet.source, userId: user.id, outletId: outlet.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(JSON.stringify(result));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof z.ZodError ? 'Invalid assignment arguments.' : error instanceof Error ? error.message : 'Assignment failed.'); process.exitCode = 1; });
