import { z } from 'zod';
import { dateSchema } from './domain/dates.js';

const configSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  AUTH_SECRET: z.string().min(32).refine(value => !value.startsWith('replace-'), 'Generate an AUTH_SECRET; do not use the template.'),
  WEB_ORIGIN: z.string().url().transform(value => new URL(value).origin),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  STORE_ALLOW_SYNTHETIC: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  PLANNING_ALLOW_SYNTHETIC: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  DISPATCHER_DEMO_DATE: dateSchema.optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});
export type Config = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) throw new Error(`Invalid API environment: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}.`);
  if (result.data.NODE_ENV === 'production' && !result.data.WEB_ORIGIN.startsWith('https://')) {
    throw new Error('Production WEB_ORIGIN must use HTTPS for secure session cookies.');
  }
  if (result.data.NODE_ENV === 'production' && result.data.STORE_ALLOW_SYNTHETIC) throw new Error('Synthetic Store eligibility is not allowed in production.');
  if (result.data.NODE_ENV === 'production' && result.data.PLANNING_ALLOW_SYNTHETIC) throw new Error('Synthetic planning references are not allowed in production.');
  return result.data;
}
