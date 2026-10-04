import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { installPublicJudgeData } from '../apps/api/src/domain/public-judge.js';

if (process.env.PUBLIC_JUDGE_DEMO === 'true') {
  const db = new PrismaClient();
  try { console.log(JSON.stringify(await installPublicJudgeData(db))); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Public judge installation failed.'); process.exitCode = 1; }
  finally { await db.$disconnect(); }
} else console.log('Public judge data installation disabled; auth-only seed remains unchanged.');
