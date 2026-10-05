import { z } from 'zod';
import { dateSchema } from './domain/dates.js';
import { PUBLIC_JUDGE_DATES } from './domain/public-judge-dates.js';

const configSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  AUTH_SECRET: z.string().min(32).refine(value => !value.startsWith('replace-'), 'Generate an AUTH_SECRET; do not use the template.'),
  SEED_DEMO_PASSWORD: z.string().min(12).max(128).optional(),
  WEB_ORIGIN: z.string().url().transform(value => new URL(value).origin),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  STORE_ALLOW_SYNTHETIC: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  PLANNING_ALLOW_SYNTHETIC: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  DISPATCHER_DEMO_DATE: dateSchema.optional(),
  PUBLIC_JUDGE_DEMO: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});
export type Config = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse({ ...env, API_HOST: env.API_HOST ?? (env.NODE_ENV === 'production' ? '::' : undefined),
    API_PORT: env.API_PORT ?? env.PORT });
  if (!result.success) throw new Error(`Invalid API environment: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}.`);
  if (result.data.NODE_ENV === 'production' && !result.data.WEB_ORIGIN.startsWith('https://')) {
    throw new Error('Production WEB_ORIGIN must use HTTPS for secure session cookies.');
  }
  if (result.data.NODE_ENV === 'production') {
    const knownInfrastructure = /^(replace-|local-only-|waypoint-ci-only-)/i;
    const databasePassword = decodeURIComponent(new URL(result.data.DATABASE_URL).password);
    if (!databasePassword || knownInfrastructure.test(databasePassword)) throw new Error('Production DATABASE_URL requires fresh database credentials.');
    if (knownInfrastructure.test(result.data.AUTH_SECRET)) throw new Error('Production AUTH_SECRET requires a fresh secret.');
    if (!result.data.SEED_DEMO_PASSWORD || /^(WaypointDemo!2026|WaypointCIOnly!2026|replace-.*)$/.test(result.data.SEED_DEMO_PASSWORD)) {
      throw new Error('Production SEED_DEMO_PASSWORD requires a newly configured judge password.');
    }
    if (result.data.STORE_ALLOW_SYNTHETIC && !result.data.PUBLIC_JUDGE_DEMO) throw new Error('Synthetic Store eligibility is not allowed in production without explicit PUBLIC_JUDGE_DEMO.');
    if (result.data.PLANNING_ALLOW_SYNTHETIC && !result.data.PUBLIC_JUDGE_DEMO) throw new Error('Synthetic planning references are not allowed in production without explicit PUBLIC_JUDGE_DEMO.');
  }
  if (result.data.PUBLIC_JUDGE_DEMO) {
    if (result.data.DISPATCHER_DEMO_DATE && !Object.values(PUBLIC_JUDGE_DATES).some(date => date === result.data.DISPATCHER_DEMO_DATE)) {
      throw new Error('Public judge demo operational day must be a registered execution, planning or history date.');
    }
    result.data.DISPATCHER_DEMO_DATE ??= PUBLIC_JUDGE_DATES.executionDate;
  }
  return result.data;
}
