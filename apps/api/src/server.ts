import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
const prisma = new PrismaClient();
await prisma.$connect();
const server = createApp(prisma, config).listen(config.API_PORT, config.API_HOST, () => {
  console.log(`Waypoint Pulse API listening on ${config.API_HOST}:${config.API_PORT}.`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => { void prisma.$disconnect().then(() => process.exit(0)); }));
}
