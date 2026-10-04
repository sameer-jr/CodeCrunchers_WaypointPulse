import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { assignDriverToTrip } from '../apps/api/src/driver/services.js';

async function main() {
  const { values } = parseArgs({ options: { email: { type: 'string', default: 'driver@waypoint.local' },
    'dispatcher-email': { type: 'string', default: 'dispatcher@waypoint.local' }, 'trip-id': { type: 'string' } } });
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Demo Driver assignment requires a local development database.');
  const tripId = z.string().uuid().parse(values['trip-id']);
  const db = new PrismaClient();
  try {
    const driver = await db.user.findUniqueOrThrow({ where: { email: z.string().email().parse(values.email).toLowerCase() } });
    const dispatcher = await db.user.findUniqueOrThrow({ where: { email: z.string().email().parse(values['dispatcher-email']).toLowerCase() } });
    const trip = await db.trip.findUniqueOrThrow({ where: { id: tripId } });
    const result = await assignDriverToTrip(db, dispatcher.id, tripId, { driverUserId: driver.id, expectedTripVersion: trip.version });
    console.log(JSON.stringify({ assigned: true, tripId: result.id, version: result.version, driverUserId: driver.id }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof z.ZodError ? 'Invalid Driver assignment arguments.' : error instanceof Error ? error.message : 'Driver assignment failed.'); process.exitCode = 1; });
