import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeDatabase, root, runNode } from './process.mjs';

export async function verifyFoundationUpgrade(database, directory, env) {
  await database.createDatabase('waypoint_upgrade');
  const url = new URL(env.DATABASE_URL);
  url.pathname = '/waypoint_upgrade';
  const upgradeEnv = { ...env, DATABASE_URL: url.toString() };
  const baseline = resolve(directory, 'upgrade-check');
  const firstMigration = '20261002000100_auth_foundation';
  await mkdir(resolve(baseline, 'migrations', firstMigration), { recursive: true });
  await copyFile(resolve(root, 'prisma/schema.prisma'), resolve(baseline, 'schema.prisma'));
  await copyFile(resolve(root, 'prisma/migrations/migration_lock.toml'), resolve(baseline, 'migrations/migration_lock.toml'));
  await copyFile(resolve(root, 'prisma/migrations', firstMigration, 'migration.sql'), resolve(baseline, 'migrations', firstMigration, 'migration.sql'));
  await runNode('node_modules/prisma/build/index.js', ['migrate', 'deploy', '--schema', resolve(baseline, 'schema.prisma')], upgradeEnv);
  await runNode('node_modules/tsx/dist/cli.mjs', ['prisma/seed.ts'], upgradeEnv);
  const client = database.getPgClient('waypoint_upgrade', '127.0.0.1');
  await client.connect();
  try {
    const users = await client.query('SELECT id FROM "User" ORDER BY id');
    if (users.rowCount !== 4) throw new Error('Foundation migration did not seed four users.');
    await client.query('INSERT INTO "Session" (id, "tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3, $4)', [randomUUID(), 'a'.repeat(64), users.rows[0].id, new Date(Date.now() + 3600000)]);
    const fingerprint = async () => {
      const accounts = await client.query('SELECT * FROM "User" ORDER BY id');
      const sessions = await client.query('SELECT * FROM "Session" ORDER BY id');
      return createHash('sha256').update(JSON.stringify([accounts.rows, sessions.rows])).digest('hex');
    };
    const before = await fingerprint();
    await initializeDatabase(upgradeEnv);
    await initializeDatabase(upgradeEnv);
    if (before !== await fingerprint()) throw new Error('Domain upgrade unexpectedly changed foundation users/passwords/sessions.');
    console.log('PASS: Milestone 1 → Domain migration and repeated seed retain all four users, password hashes and the existing session unchanged.');
  } finally { await client.end(); }
}

export async function verifyDomainUpgrade(database, directory, env) {
  await database.createDatabase('waypoint_domain_upgrade');
  const url = new URL(env.DATABASE_URL);
  url.pathname = '/waypoint_domain_upgrade';
  const upgradeEnv = { ...env, DATABASE_URL: url.toString() };
  const baseline = resolve(directory, 'domain-upgrade-check');
  await mkdir(baseline, { recursive: true });
  await copyFile(resolve(root, 'prisma/schema.prisma'), resolve(baseline, 'schema.prisma'));
  await mkdir(resolve(baseline, 'migrations'), { recursive: true });
  await copyFile(resolve(root, 'prisma/migrations/migration_lock.toml'), resolve(baseline, 'migrations/migration_lock.toml'));
  for (const migration of ['20261002000100_auth_foundation', '20261002000200_domain', '20261002000201_domain_constraints']) {
    await mkdir(resolve(baseline, 'migrations', migration), { recursive: true });
    await copyFile(resolve(root, 'prisma/migrations', migration, 'migration.sql'), resolve(baseline, 'migrations', migration, 'migration.sql'));
  }
  await runNode('node_modules/prisma/build/index.js', ['migrate', 'deploy', '--schema', resolve(baseline, 'schema.prisma')], upgradeEnv);
  await runNode('node_modules/tsx/dist/cli.mjs', ['prisma/seed.ts'], upgradeEnv);
  const client = database.getPgClient('waypoint_domain_upgrade', '127.0.0.1');
  await client.connect();
  try {
    const identifiers = Object.fromEntries(['depot', 'outlet', 'order', 'vehicle', 'trip', 'stop', 'load', 'delivery', 'receipt'].map(name => [name, randomUUID()]));
    const users = Object.fromEntries((await client.query('SELECT id, role FROM "User"')).rows.map(row => [row.role, row.id]));
    await client.query('INSERT INTO "Depot" (id,name) VALUES ($1, $2)', [identifiers.depot, 'SYNTHETIC migration depot']);
    await client.query('INSERT INTO "Outlet" (id,"outletRef",brand,district,"depotId","dockType","accessConstraint","deliveryWindowOpen","deliveryWindowClose",source,"updatedAt") VALUES ($1,$2,\'FRESH\',$3,$4,\'STREET\',\'NORMAL\',300,960,\'SYNTHETIC\',now())', [identifiers.outlet, 'SYN-MIGRATION-OUTLET', 'SYNTHETIC district', identifiers.depot]);
    await client.query(`INSERT INTO "CalendarDay" (date,"operatingDay","dayOfWeek","dayName",weekend,"isoYear","isoWeek",payday,"festivalRamp",holiday,monsoon,source)
      SELECT d,true,EXTRACT(ISODOW FROM d)::int-1,(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[EXTRACT(ISODOW FROM d)::int],false,EXTRACT(ISOYEAR FROM d),EXTRACT(WEEK FROM d),false,0,false,false,'SYNTHETIC' FROM (SELECT DATE '2040-01-02' d) dates`);
    await client.query('INSERT INTO "UserOutlet" ("userId","outletId") VALUES ($1,$2)', [users.STORE_MANAGER, identifiers.outlet]);
    await client.query('INSERT INTO "Order" (id,"orderRef","outletId","requestedDeliveryDate","temperatureRequirement","orderedUnits","orderedWeightKg","orderedVolumeM3","updatedAt") VALUES ($1,$2,$3,\'2040-01-02\',\'AMBIENT\',73,41.25,0.75,now())', [identifiers.order, 'SYN-MIGRATION-ORDER', identifiers.outlet]);
    await client.query('INSERT INTO "Vehicle" (id,"vehicleRef",type,"temperatureCapability","weightCapacityKg","volumeCapacityM3","fuelType","kmPerLitre","weeklyFuelQuotaLitres","depotId",source,"updatedAt") VALUES ($1,$2,\'TRUCK\',\'AMBIENT\',1700,15,\'DIESEL\',8,84,$3,\'SYNTHETIC\',now())', [identifiers.vehicle, 'SYN-MIGRATION-VEHICLE', identifiers.depot]);
    await client.query('INSERT INTO "Trip" (id,"tripRef","serviceDate","vehicleId","tripNumber","driverUserId","updatedAt") VALUES ($1,$2,\'2040-01-02\',$3,1,$4,now())', [identifiers.trip, 'SYN-MIGRATION-TRIP', identifiers.vehicle, users.DRIVER]);
    await client.query('INSERT INTO "TripStop" (id,"tripId","orderId",sequence,"updatedAt") VALUES ($1,$2,$3,1,now())', [identifiers.stop, identifiers.trip, identifiers.order]);
    await client.query('INSERT INTO "LoadRecord" (id,"tripStopId","expectedUnits","loadedUnits",status,reason,"reviewStatus","recordedByUserId","recordedAt","reviewedByUserId","reviewedAt","updatedAt") VALUES ($1,$2,73,69,\'COMPLETE\',\'Synthetic variance\',\'APPROVED\',$3,now(),$4,now(),now())', [identifiers.load, identifiers.stop, users.LOADER, users.DISPATCHER]);
    await client.query('INSERT INTO "DeliveryRecord" (id,"tripStopId","loadRecordId",outcome,"expectedLoadedUnits","deliveredUnits","driverNote","arrivedAt","completedAt","recordedByDriverId","updatedAt") VALUES ($1,$2,$3,\'PARTIALLY_DELIVERED\',69,66,\'Synthetic variance\',now(),now(),$4,now())', [identifiers.delivery, identifiers.stop, identifiers.load, users.DRIVER]);
    await client.query('INSERT INTO "Receipt" (id,"deliveryRecordId","receivedUnits",status,"issueNote","confirmedByUserId","confirmedAt","updatedAt") VALUES ($1,$2,65,\'ISSUE_REPORTED\',\'Synthetic variance\',$3,now(),now())', [identifiers.receipt, identifiers.delivery, users.STORE_MANAGER]);
    const fingerprint = async () => {
      const records = [];
      for (const table of ['User', 'Session', 'Order', 'TripStop', 'LoadRecord', 'DeliveryRecord', 'Receipt']) {
        const allocationColumns = table === 'TripStop' ? " - 'plannedServiceStart' - 'plannedServiceComplete' - 'plannedWaitingMinutes' - 'version' - 'arrivalClientEventAt' - 'arrivalOperationCreatedAt'"
          : table === 'DeliveryRecord' ? " - 'reasonCode' - 'clientEventAt' - 'operationCreatedAt'" : '';
        records.push(await client.query(`SELECT to_jsonb(record) - 'eligibleDeliveryDate' - 'issueType'${allocationColumns} AS record FROM "${table}" record ORDER BY id`));
      }
      return createHash('sha256').update(JSON.stringify(records.map(result => result.rows))).digest('hex');
    };
    const before = await fingerprint();
    await initializeDatabase(upgradeEnv);
    await initializeDatabase(upgradeEnv);
    if (before !== await fingerprint()) throw new Error('Store migration changed existing domain quantities or authentication data.');
    const order = (await client.query('SELECT "eligibleDeliveryDate" = "requestedDeliveryDate" AS preserved FROM "Order" WHERE id=$1', [identifiers.order])).rows[0];
    if (!order.preserved) throw new Error('Legacy eligibility date was not backfilled from the original request.');
    console.log('PASS: Milestone 2 → Store migration retains original ordered/loaded/delivered/received facts (73/69/66/65), authentication data and requested-date eligibility.');
  } finally { await client.end(); }
}
