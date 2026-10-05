import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { installPublicJudgeData } from '../apps/api/src/domain/public-judge.js';
import { installStarterReferenceData } from '../apps/api/src/domain/starter-reference.js';

if (process.env.PUBLIC_JUDGE_DEMO === 'true' || process.env.STARTER_REFERENCE_DATA === 'true') {
  const db = new PrismaClient();
  try { console.log(JSON.stringify(process.env.STARTER_REFERENCE_DATA === 'true' ? await installStarterReferenceData(db) : await installPublicJudgeData(db))); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Public judge installation failed.'); process.exitCode = 1; }
  finally { await db.$disconnect(); }
} else console.log('Optional safe reference installation disabled; auth-only seed remains unchanged.');
