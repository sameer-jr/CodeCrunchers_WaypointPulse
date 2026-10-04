import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, DriverRouteList } from '@waypoint/shared';
import type { LocalDriverOperation } from './model';

vi.mock('../api', () => ({
  ApiFailure: class extends Error { constructor(public status: number, message: string) { super(message); } },
  getIdentity: vi.fn()
}));

const driver: AuthUser = { id: '10000000-0000-4000-8000-000000000001', role: 'DRIVER', email: 'driver@example.test', displayName: 'Synthetic Driver' };
const otherDriver: AuthUser = { ...driver, id: '10000000-0000-4000-8000-000000000002', email: 'other@example.test' };
const routes: DriverRouteList = { selectedDate: '2040-03-05', availableDates: ['2040-03-05'], trips: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
type FakeRequest = { result: unknown; onsuccess?: () => void };
// Requests and transaction completion are asynchronous; tests can hold DB opening
// while the real storage module's session guard waits to create its transaction.
function fakeIndexedDB(holdOpen = false) {
  const data = new Map(['routes', 'identities', 'operations', 'meta'].map(name => [name, new Map<string, unknown>()]));
  const pending: FakeRequest[] = [];
  let opened = !holdOpen;
  const db = { close: vi.fn(), onversionchange: null, transaction: (names: string[], mode: string) => {
    const local = new Map(names.map(name => [name, new Map(data.get(name))]));
    let timer: ReturnType<typeof setTimeout>;
    const tx = { oncomplete: undefined as (() => void) | undefined,
      onabort: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined,
      objectStore: (name: string) => {
        const values = local.get(name)!;
        return {
          get: (key: string) => request(() => values.get(key)),
          put: (value: Record<string, unknown>) => request(() => {
            const key = String(value.operationId ?? value.key ?? value.id);
            values.set(key, structuredClone(value)); return key;
          }),
          delete: (key: string) => request(() => { values.delete(key); }),
          index: () => ({ getAll: (userId: string) => request(() => [...values.values()].filter(value => (value as { userId: string }).userId === userId)) })
        };
      }
    };
    function complete() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (mode === 'readwrite') for (const [name, values] of local) data.set(name, values);
        tx.oncomplete?.();
      }, 0);
    }
    function request(work: () => unknown): FakeRequest {
      const result: FakeRequest = { result: undefined };
      queueMicrotask(() => { result.result = work(); result.onsuccess?.(); complete(); });
      return result;
    }
    complete(); return tx;
  } };
  const open = vi.fn(() => {
    const request: FakeRequest = { result: db };
    if (opened) queueMicrotask(() => request.onsuccess?.());
    else pending.push(request);
    return request;
  });
  return { data, open, release: () => { opened = true; for (const request of pending.splice(0)) queueMicrotask(() => request.onsuccess?.()); } };
}
function fakeLocalStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
async function modules(holdOpen = false) {
  const database = fakeIndexedDB(holdOpen);
  vi.stubGlobal('indexedDB', { open: database.open });
  const session = await import('./session'), storage = await import('./storage'), identity = await import('./identity');
  const generation = session.commitDriverSession(driver, session.beginDriverSessionChange())!;
  return { session, storage, identity, database, generation };
}

beforeEach(() => { vi.resetModules(); vi.stubGlobal('localStorage', fakeLocalStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Driver session fence', () => {
  it('discards an authentication response begun before logout without reopening device storage', async () => {
    const { session, identity, database } = await modules();
    const response = deferred<AuthUser | null>(), pending = identity.readScopedIdentity(() => response.promise);
    session.commitDriverSession(null, session.beginDriverSessionChange());
    response.resolve(driver);
    expect(await pending).toBeNull(); expect(database.open).not.toHaveBeenCalled();
  });

  it('does not let old authentication restore Driver A after Driver B signs in', async () => {
    const { session, identity, storage, database } = await modules();
    const response = deferred<AuthUser | null>(), pending = identity.readScopedIdentity(() => response.promise);
    const current = session.commitDriverSession(otherDriver, session.beginDriverSessionChange())!;
    await storage.rememberDriverIdentity(otherDriver, current);
    response.resolve(driver);
    expect(await pending).toBeNull();
    expect(database.data.get('meta')?.get('active-driver')).toEqual({ key: 'active-driver', userId: otherDriver.id });
  });

  it('rejects cached query identity after logout and requests begun during sign-in', async () => {
    const { session, identity, generation } = await modules();
    const snapshot = { user: driver, generation };
    expect(identity.identityFromSnapshot(snapshot)).toEqual(driver);
    const transition = session.beginDriverSessionChange();
    expect(identity.identityFromSnapshot(snapshot)).toBeNull();
    expect(await identity.readScopedIdentity(async () => driver)).toBeNull();
    const signedOut = session.commitDriverSession(null, transition)!;
    expect(session.driverSessionIsCurrent(signedOut)).toBe(true);
    expect(session.driverSessionIsCurrent(signedOut, driver.id)).toBe(false);
  });

  it('checks the shared generation after database opening before any late route or identity write', async () => {
    const { session, storage, database, generation } = await modules(true);
    const saveRoute = storage.saveDriverRoutes(driver.id, routes, generation);
    const saveIdentity = storage.rememberDriverIdentity(driver, generation);
    session.commitDriverSession(null, session.beginDriverSessionChange());
    database.release();
    expect(await saveRoute).toBeNull(); await saveIdentity;
    expect(database.data.get('routes')?.size).toBe(0);
    expect(database.data.get('identities')?.size).toBe(0);
    expect(database.data.get('meta')?.size).toBe(0);
  });

  it('does not return an offline identity when logout occurs while database opening is pending', async () => {
    const { session, storage, database, generation } = await modules(true);
    database.data.get('identities')!.set(driver.id, driver);
    database.data.get('meta')!.set('active-driver', { key: 'active-driver', userId: driver.id });
    database.data.get('routes')!.set(`${driver.id}:${routes.selectedDate}`, { key: `${driver.id}:${routes.selectedDate}`, userId: driver.id, routes });
    const pending = storage.readCachedDriverIdentity(generation);
    session.commitDriverSession(null, session.beginDriverSessionChange()); database.release();
    expect(await pending).toBeNull();
  });

  it('observes another tab changing the shared nonce and rejects that tab’s late writes and query snapshot', async () => {
    const first = await modules(true), snapshot = { user: driver, generation: first.generation };
    const late = first.storage.saveDriverRoutes(driver.id, routes, first.generation);
    vi.resetModules();
    const otherTab = await import('./session');
    expect(otherTab.captureDriverSession()).toBe(first.generation);
    otherTab.commitDriverSession(null, otherTab.beginDriverSessionChange());
    first.database.release();
    expect(await late).toBeNull();
    expect(first.identity.identityFromSnapshot(snapshot)).toBeNull();
  });

  it('uses current Driver cache online/offline but fences it after an authenticated role transition', async () => {
    const { session, storage, identity, database, generation } = await modules();
    await storage.saveDriverRoutes(driver.id, routes, generation); await storage.rememberDriverIdentity(driver, generation);
    expect(await storage.readCachedDriverIdentity(generation)).toEqual(driver);
    const { ApiFailure } = await import('../api');
    expect(await identity.readScopedIdentity(async () => { throw new ApiFailure(0, 'Offline'); })).toEqual(driver);
    const response = deferred<AuthUser | null>(), late = identity.readScopedIdentity(() => response.promise);
    session.commitDriverSession({ ...driver, role: 'STORE_MANAGER' }, session.beginDriverSessionChange());
    response.resolve(driver); expect(await late).toBeNull();
    expect(await storage.readCachedDriverIdentity()).toBeNull();
    expect(database.data.get('routes')?.size).toBe(1);
  });

  it('preserves unsynced evidence when cache cleanup refuses logout', async () => {
    const { storage, database, generation } = await modules();
    const operation: LocalDriverOperation = { operationId: '80000000-0000-4000-8000-000000000001', userId: driver.id,
      tripId: '20000000-0000-4000-8000-000000000001', entityType: 'TRIP', entityId: '20000000-0000-4000-8000-000000000001',
      action: 'START_TRIP', payload: {}, baseVersion: 1, createdAt: '2026-10-04T00:00:00.000Z', clientEventAt: '2026-10-04T00:00:00.000Z',
      syncStatus: 'CONFLICT', attempts: 1, reason: 'Trip changed' };
    await storage.saveDriverOperation(operation);
    await expect(storage.clearDriverSession(driver.id, generation)).rejects.toThrow(/Unsynced/);
    expect(database.data.get('operations')?.get(operation.operationId)).toEqual(operation);
  });

  it('fails closed for offline identity when cross-tab storage is blocked while keeping online cookie auth usable', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage blocked'); } });
    const { identity, storage, generation } = await modules();
    expect(await identity.readScopedIdentity(async () => driver)).toEqual(driver);
    expect(await storage.saveDriverRoutes(driver.id, routes, generation)).toBeNull();
    expect(await storage.readCachedDriverIdentity(generation)).toBeNull();
    const { ApiFailure } = await import('../api');
    await expect(identity.readScopedIdentity(async () => { throw new ApiFailure(0, 'Offline'); })).rejects.toMatchObject({ status: 0 });
  });
});
