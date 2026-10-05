import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { readConfig } from '../config.js';
import { assertPublicJudgeDatabase, preparePublicJudgeReviewInTransaction, type JudgeFixture } from './public-judge-review.js';

export const PUBLIC_JUDGE_RESET_TABLES = [
  'Session', 'AuditEvent', 'OfflineOperation', 'TripPosition', 'OutletLocation', 'DeliveryAttachment', 'DeliveryProof', 'Receipt',
  'Exception', 'DeferralRecord', 'Allocation', 'DeliveryRecord', 'LoadRecord', 'TripStop', 'Trip', 'PlanningRun', 'Order', 'FuelUsage'
] as const;

const retainedTables = ['User', 'ReferenceImport', 'Depot', 'Outlet', 'Vehicle', 'CalendarDay', 'DistrictTravel', 'ServiceAllowance',
  'UserOutlet', 'UserDepot', 'VehicleAvailability', 'FuelLedger'] as const;
const allTables = [...retainedTables, ...PUBLIC_JUDGE_RESET_TABLES];
const quoteTables = (tables: readonly string[]) => tables.map(name => `ONLY "public"."${name}"`).join(', ');

function requirePublicDemo(env: NodeJS.ProcessEnv) {
  const config = readConfig(env);
  if (!config.PUBLIC_JUDGE_DEMO && !config.STARTER_REFERENCE_DATA) throw new Error('A reset is permitted only in an explicitly enabled public judge or starter-reference database.');
  return config;
}

async function assertResetScope(tx: Prisma.TransactionClient): Promise<JudgeFixture> {
  await assertPublicJudgeDatabase(tx);
  const users = await tx.user.findMany({ select: { id: true, email: true, role: true, active: true } });
  const expected = { 'store@waypoint.local': 'STORE_MANAGER', 'dispatcher@waypoint.local': 'DISPATCHER', 'loader@waypoint.local': 'LOADER', 'driver@waypoint.local': 'DRIVER' };
  if (users.length !== 4 || users.some(user => !user.active || expected[user.email as keyof typeof expected] !== user.role)) throw new Error('Reset requires exactly the four active public demo accounts and expected roles.');
  const store = users.find(user => user.role === 'STORE_MANAGER')!, dispatcher = users.find(user => user.role === 'DISPATCHER')!, loader = users.find(user => user.role === 'LOADER')!;
  const depots = await tx.depot.findMany();
  const depot = depots.find(row => row.name === 'SYNTHETIC Allocation DRIVER Depot');
  if (!depot || depots.length !== 2 || !depots.some(row => row.name === 'SYNTHETIC Allocation DRIVER Foreign Depot')) throw new Error('Unexpected depot data prevents the public reset.');
  const outlets = await tx.outlet.findMany();
  const refs = ['FRESH', 'VAN', 'TECH', 'MALL', 'FOREIGN'].map(key => `SYN-PLAN-DRIVER-${key}`);
  if (outlets.length !== refs.length || outlets.some(row => row.source !== 'SYNTHETIC' || row.importId || !refs.includes(row.outletRef))) throw new Error('Unexpected outlet provenance prevents the public reset.');
  const storeOutlet = outlets.find(row => row.outletRef === 'SYN-PLAN-DRIVER-FRESH')!;
  if (storeOutlet.depotId !== depot.id) throw new Error('The expected Store outlet and depot do not match.');
  const outletScopes = await tx.userOutlet.findMany(), depotScopes = await tx.userDepot.findMany();
  if (outletScopes.length !== 1 || outletScopes[0].userId !== store.id || outletScopes[0].outletId !== storeOutlet.id
    || depotScopes.length !== 2 || ![dispatcher.id, loader.id].every(userId => depotScopes.some(row => row.userId === userId && row.depotId === depot.id))) {
    throw new Error('Unexpected account scope prevents the public reset.');
  }
  const vehicles = await tx.vehicle.findMany(), vehicleRefs = ['AMBIENT', 'REEFER', 'VAN', 'FUEL-LIMITED', 'UNAVAILABLE', 'UNKNOWN', 'INACTIVE'].map(key => `SYN-PLAN-DRIVER-${key}`);
  if (vehicles.length !== vehicleRefs.length || vehicles.some(row => row.source !== 'SYNTHETIC' || row.importId || row.depotId !== depot.id || !vehicleRefs.includes(row.vehicleRef))) throw new Error('Unexpected vehicle provenance prevents the public reset.');
  if (await tx.referenceImport.count() || await tx.calendarDay.count({ where: { OR: [{ source: { not: 'SYNTHETIC' } }, { importId: { not: null } }] } })
    || await tx.districtTravel.count({ where: { OR: [{ source: { not: 'SYNTHETIC' } }, { importId: { not: null } }, { depotId: { not: depot.id } }] } })
    || await tx.serviceAllowance.count({ where: { OR: [{ source: { not: 'SYNTHETIC' } }, { importId: { not: null } }] } })) {
    throw new Error('Unexpected imported reference provenance prevents the public reset.');
  }
  if (await tx.auditEvent.count({ where: { metadata: { path: ['source'], equals: 'OFFICIAL' } } })) throw new Error('Official audit provenance prevents the public reset.');
  const migrations = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  if (Number(migrations[0]?.count) !== 10) throw new Error('Unexpected migration state prevents the public reset.');
  return { depot, storeOutlet, store, dispatcher };
}

async function inventory(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
  const [database] = await tx.$queryRaw<{ databaseName: string }[]>`SELECT current_database()::text AS "databaseName"`;
  const tables: Record<string, { count: number; checksum: string }> = {};
  for (const table of allTables) {
    const [row] = await tx.$queryRawUnsafe<{ count: string; checksum: string }[]>(`SELECT count(*)::text AS count,
      md5(COALESCE(string_agg(md5(to_jsonb(r)::text), '' ORDER BY md5(to_jsonb(r)::text)), '')) AS checksum FROM "public"."${table}" AS r`);
    tables[table] = { count: Number(row.count), checksum: row.checksum };
  }
  const migrations = await tx.$queryRaw`SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  const foreignKeys = await tx.$queryRaw`SELECT c.conrelid::regclass::text AS table_name, c.conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = 'f' ORDER BY table_name, c.conname`;
  const inventoryDigest = createHash('sha256').update(JSON.stringify({ tables, migrations, foreignKeys })).digest('hex');
  return { databaseName: database.databaseName, inventoryDigest, tables };
}

export async function inspectPublicJudgeReset(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  requirePublicDemo(env);
  return db.$transaction(async tx => { await assertResetScope(tx); return inventory(tx); }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
}

export async function resetPublicJudgeDemo(db: PrismaClient, options: { expectedInventoryDigest: string; emptyOrders?: boolean; afterReseed?: () => Promise<void> }, env: NodeJS.ProcessEnv = process.env) {
  const config = requirePublicDemo(env);
  if (options.emptyOrders ? !config.STARTER_REFERENCE_DATA : !config.PUBLIC_JUDGE_DEMO) throw new Error('Use an empty-order reset for starter references, or the four-order reset for public judge mode.');
  if (!/^[a-f0-9]{64}$/.test(options.expectedInventoryDigest)) throw new Error('Supply the exact reviewed public inventory digest.');
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '10s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waypoint-public-judge-review-v1'))`;
    await tx.$executeRawUnsafe(`LOCK TABLE ${quoteTables(PUBLIC_JUDGE_RESET_TABLES)} IN ACCESS EXCLUSIVE MODE`);
    await tx.$executeRawUnsafe(`LOCK TABLE ${quoteTables(retainedTables)} IN SHARE MODE`);
    const fixture = await assertResetScope(tx), before = await inventory(tx);
    if (before.inventoryDigest !== options.expectedInventoryDigest) throw new Error('Public data changed since the reviewed backup inventory; reset was not performed.');
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quoteTables(PUBLIC_JUDGE_RESET_TABLES)} RESTRICT`);
    const orders = options.emptyOrders ? [] : await preparePublicJudgeReviewInTransaction(tx, fixture);
    const after = await inventory(tx);
    for (const table of retainedTables) if (after.tables[table].checksum !== before.tables[table].checksum || after.tables[table].count !== before.tables[table].count) throw new Error('Reset changed retained reference or account data; transaction rolled back.');
    for (const table of PUBLIC_JUDGE_RESET_TABLES) {
      const expectedCount = options.emptyOrders ? 0 : table === 'Order' ? 4 : table === 'AuditEvent' ? 8 : 0;
      if (after.tables[table].count !== expectedCount) throw new Error('Fresh reset counts did not match; transaction rolled back.');
    }
    if (await tx.order.count({ where: { OR: [{ status: { not: 'CONFIRMED' } }, { version: { not: 2 } }] } })) throw new Error('Fresh demand lifecycle did not match; transaction rolled back.');
    await options.afterReseed?.();
    return { result: 'PASS' as const, before, after, orders };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60000 });
}
