import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { DEMO_ACCOUNTS } from '@waypoint/shared';
import { hashPassword } from '../apps/api/src/password.js';

const password = process.env.SEED_DEMO_PASSWORD;
if (!password || password.length < 12 || password.length > 128) {
  throw new Error('Set SEED_DEMO_PASSWORD to 12–128 characters before seeding.');
}

const prisma = new PrismaClient();
try {
  for (const account of DEMO_ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing) continue;
    await prisma.user.create({ data: { ...account, passwordHash: await hashPassword(password) } });
  }
  console.log('Demo initialization complete: four auth accounts; no competition data imported.');
} finally {
  await prisma.$disconnect();
}
