import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { installLoaderFixture } from '../apps/api/src/loader/testing/synthetic.js';

const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.NODE_ENV === 'production' || url.hostname !== '127.0.0.1' || url.pathname !== '/waypoint_driver_judge') {
  throw new Error('Driver fixture installation requires the separate local judge database.');
}
const db = new PrismaClient();
try {
  const fixture = await installLoaderFixture(db, { key: 'DRIVER' });
  console.log(JSON.stringify({ source: 'SYNTHETIC', database: 'waypoint_driver_judge', operationalDate: fixture.serviceDate,
    depot: fixture.depot.name, shortfallOrder: fixture.shortfallOrder.orderRef, expectedUnits: fixture.shortfallOrder.orderedUnits,
    preparation: 'Demand and reference data only. Generate and release a real plan; assign through Dispatcher Routes and load through Loader.' }));
} finally { await db.$disconnect(); }
