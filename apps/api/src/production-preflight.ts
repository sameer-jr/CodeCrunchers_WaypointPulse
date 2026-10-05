import { readConfig } from './config.js';

try {
  const config = readConfig();
  console.log(`Runtime configuration accepted: ${config.NODE_ENV}${config.STARTER_REFERENCE_DATA ? ', explicit SYNTHETIC starter references' : config.PUBLIC_JUDGE_DEMO ? ', explicit SYNTHETIC public judge demo' : ''}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Runtime configuration is invalid.');
  process.exitCode = 1;
}
