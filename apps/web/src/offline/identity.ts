import type { AuthUser } from '@waypoint/shared';
import { ApiFailure, getIdentity } from '../api';
import { captureDriverSession, confirmDriverSession, driverSessionIsCurrent } from './session';
import { hideDriverSession, readCachedDriverIdentity, rememberDriverIdentity } from './storage';

export interface IdentitySnapshot { user: AuthUser | null; generation: string }
export function identityFromSnapshot(snapshot: IdentitySnapshot | undefined): AuthUser | null {
  return snapshot && driverSessionIsCurrent(snapshot.generation) ? snapshot.user : null;
}
export async function readIdentitySnapshot(fetchIdentity: () => Promise<AuthUser | null> = getIdentity): Promise<IdentitySnapshot> {
  const generation = captureDriverSession();
  try {
    const user = await fetchIdentity();
    const confirmed = confirmDriverSession(user, generation);
    if (!confirmed) return { user: null, generation };
    if (user?.role === 'DRIVER') await rememberDriverIdentity(user, confirmed).catch(() => undefined);
    else await hideDriverSession(confirmed).catch(() => undefined);
    return { user: driverSessionIsCurrent(confirmed) ? user : null, generation: confirmed };
  } catch (error) {
    if (!driverSessionIsCurrent(generation)) return { user: null, generation };
    if (error instanceof ApiFailure && error.status === 0) {
      const cached = await readCachedDriverIdentity(generation).catch(() => null);
      if (cached && driverSessionIsCurrent(generation, cached.id)) return { user: cached, generation };
    }
    throw error;
  }
}
export async function readScopedIdentity(fetchIdentity: () => Promise<AuthUser | null> = getIdentity): Promise<AuthUser | null> {
  return identityFromSnapshot(await readIdentitySnapshot(fetchIdentity));
}
