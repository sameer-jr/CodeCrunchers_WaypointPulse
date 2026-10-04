import type { AuthUser } from '@waypoint/shared';

export const DRIVER_SESSION_KEY = 'waypoint-driver-session-fence';
type SessionFence = { generation: string; mode: 'UNKNOWN' | 'TRANSITION' | 'DRIVER' | 'OTHER' | 'SIGNED_OUT'; driverId: string | null };
let fallback: SessionFence = { generation: crypto.randomUUID(), mode: 'UNKNOWN', driverId: null };
let storageBlocked = false;
function readFence(): SessionFence {
  if (storageBlocked) return fallback;
  try {
    const value = localStorage.getItem(DRIVER_SESSION_KEY);
    if (value) {
      const parsed = JSON.parse(value) as Partial<SessionFence>;
      if (typeof parsed.generation === 'string' && ['UNKNOWN', 'TRANSITION', 'DRIVER', 'OTHER', 'SIGNED_OUT'].includes(parsed.mode ?? '') &&
        (parsed.driverId === null || typeof parsed.driverId === 'string')) return parsed as SessionFence;
    }
    localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify(fallback));
  } catch { storageBlocked = true; }
  return fallback;
}
function writeFence(mode: SessionFence['mode'], driverId: string | null, generation: string = crypto.randomUUID()): string {
  fallback = { generation, mode, driverId };
  if (!storageBlocked) try { localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify(fallback)); } catch { storageBlocked = true; }
  return generation;
}
export function captureDriverSession(): string { return readFence().generation; }
export function sharedDriverSessionAvailable(): boolean { readFence(); return !storageBlocked; }
export function driverSessionIsCurrent(generation: string, driverId?: string): boolean {
  const current = readFence();
  return current.generation === generation && (driverId === undefined || (current.mode === 'DRIVER' && current.driverId === driverId));
}
export function beginDriverSessionChange(): string { return writeFence('TRANSITION', null); }
export function commitDriverSession(user: AuthUser | null, generation: string): string | null {
  if (!driverSessionIsCurrent(generation)) return null;
  return writeFence(user?.role === 'DRIVER' ? 'DRIVER' : user ? 'OTHER' : 'SIGNED_OUT', user?.role === 'DRIVER' ? user.id : null);
}
export function confirmDriverSession(user: AuthUser | null, generation: string): string | null {
  const current = readFence();
  if (current.generation !== generation || current.mode === 'TRANSITION') return null;
  const mode = user?.role === 'DRIVER' ? 'DRIVER' : user ? 'OTHER' : 'SIGNED_OUT', driverId = user?.role === 'DRIVER' ? user.id : null;
  if (current.mode === mode && current.driverId === driverId) return generation;
  return writeFence(mode, driverId, current.mode === 'UNKNOWN' ? generation : undefined);
}
