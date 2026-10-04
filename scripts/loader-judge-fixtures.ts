import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { installLoaderFixture } from '../apps/api/src/loader/testing/synthetic.js';

const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.NODE_ENV === 'production' || url.hostname !== '127.0.0.1' || url.pathname !== '/waypoint_loader_judge') throw new Error('Loader fixture installation requires the separate local judge database.');
const db = new PrismaClient();
try {
  const fixture = await installLoaderFixture(db);
  console.log(JSON.stringify({ source: 'SYNTHETIC', database: 'waypoint_loader_judge', operationalDate: fixture.serviceDate,
    depot: fixture.depot.name, shortfallOrder: fixture.shortfallOrder.orderRef, expectedUnits: fixture.shortfallOrder.orderedUnits,
    preparation: 'Independent demand and planning references only. No Loader trip or allocation was precomputed.' }));
} finally { await db.$disconnect(); }
