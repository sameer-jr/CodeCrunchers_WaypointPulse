export function syntheticReferencesPermitted(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.PUBLIC_JUDGE_DEMO === 'true' || env.STARTER_REFERENCE_DATA === 'true';
}
