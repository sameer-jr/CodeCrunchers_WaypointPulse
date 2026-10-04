import type { AuthUser, DriverRouteList } from '@waypoint/shared';
import type { LocalDriverOperation } from './model';
import { captureDriverSession, driverSessionIsCurrent, sharedDriverSessionAvailable } from './session';

const DATABASE = 'waypoint-driver-v1';
let opening: Promise<IDBDatabase> | undefined;
export interface CachedDriverRoutes { key: string; userId: string; savedAt: string; routes: DriverRouteList }
function database(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('routes', { keyPath: 'key' }).createIndex('userId', 'userId');
      db.createObjectStore('identities', { keyPath: 'id' });
      db.createObjectStore('operations', { keyPath: 'operationId' }).createIndex('userId', 'userId');
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
    request.onerror = () => { opening = undefined; reject(new Error('Device storage is unavailable. Keep this page open and reconnect.')); };
  });
  return opening;
}
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function stored<T>(names: string[], mode: IDBTransactionMode, work: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const tx = (await database()).transaction(names, mode);
  const committed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Unable to save on this device.'));
  });
  try { const result = await work(tx); await committed; return result; }
  catch (error) { void committed.catch(() => undefined); throw error; }
}
export function saveDriverRoutes(userId: string, routes: DriverRouteList, generation = captureDriverSession()): Promise<CachedDriverRoutes | null> {
  const record = { key: `${userId}:${routes.selectedDate}`, userId, savedAt: new Date().toISOString(), routes };
  return stored(['routes'], 'readwrite', async tx => {
    if (!sharedDriverSessionAvailable() || !driverSessionIsCurrent(generation, userId)) return null;
    await requestResult(tx.objectStore('routes').put(record)); return record;
  });
}
export function readDriverRoutes(userId: string, date?: string): Promise<CachedDriverRoutes | null> {
  const generation = captureDriverSession();
  return stored(['routes'], 'readonly', async tx => {
    if (!sharedDriverSessionAvailable() || !driverSessionIsCurrent(generation, userId)) return null;
    if (date) {
      const record = await requestResult(tx.objectStore('routes').get(`${userId}:${date}`)) as CachedDriverRoutes | undefined;
      return driverSessionIsCurrent(generation, userId) ? record ?? null : null;
    }
    const records = await requestResult(tx.objectStore('routes').index('userId').getAll(userId)) as CachedDriverRoutes[];
    return driverSessionIsCurrent(generation, userId) ? records.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null : null;
  });
}
export function rememberDriverIdentity(user: AuthUser, generation = captureDriverSession()): Promise<void> {
  if (user.role !== 'DRIVER') return hideDriverSession(generation);
  const identity: AuthUser = { id: user.id, email: user.email, role: 'DRIVER', displayName: user.displayName };
  return stored(['identities', 'meta'], 'readwrite', async tx => {
    if (!sharedDriverSessionAvailable() || !driverSessionIsCurrent(generation, user.id)) return;
    await requestResult(tx.objectStore('identities').put(identity));
    if (driverSessionIsCurrent(generation, user.id)) await requestResult(tx.objectStore('meta').put({ key: 'active-driver', userId: user.id }));
  });
}
export function hideDriverSession(generation = captureDriverSession()): Promise<void> {
  return stored(['meta'], 'readwrite', async tx => { if (driverSessionIsCurrent(generation)) await requestResult(tx.objectStore('meta').delete('active-driver')); });
}
export function readCachedDriverIdentity(generation = captureDriverSession()): Promise<AuthUser | null> {
  return stored(['meta', 'identities', 'routes'], 'readonly', async tx => {
    if (!sharedDriverSessionAvailable() || !driverSessionIsCurrent(generation)) return null;
    const active = await requestResult(tx.objectStore('meta').get('active-driver')) as { userId: string } | undefined;
    if (!active) return null;
    const user = await requestResult(tx.objectStore('identities').get(active.userId)) as AuthUser | undefined;
    const routes = await requestResult(tx.objectStore('routes').index('userId').getAll(active.userId));
    return user?.role === 'DRIVER' && routes.length && driverSessionIsCurrent(generation, user.id) ? user : null;
  });
}
export function readDriverOperations(userId: string): Promise<LocalDriverOperation[]> {
  return stored(['operations'], 'readonly', async tx => {
    const records = await requestResult(tx.objectStore('operations').index('userId').getAll(userId)) as LocalDriverOperation[];
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.baseVersion - b.baseVersion || a.operationId.localeCompare(b.operationId));
  });
}
export function saveDriverOperation(operation: LocalDriverOperation): Promise<void> {
  return stored(['operations'], 'readwrite', async tx => { await requestResult(tx.objectStore('operations').put(operation)); });
}
export async function getUnsyncedDriverOperations(userId: string): Promise<LocalDriverOperation[]> {
  return (await readDriverOperations(userId)).filter(operation => operation.syncStatus !== 'SYNCED');
}
export function clearDriverSession(userId: string, generation = captureDriverSession()): Promise<void> {
  return stored(['routes', 'identities', 'operations', 'meta'], 'readwrite', async tx => {
    if (!driverSessionIsCurrent(generation)) return;
    const operations = await requestResult(tx.objectStore('operations').index('userId').getAll(userId)) as LocalDriverOperation[];
    if (operations.some(operation => operation.syncStatus !== 'SYNCED')) throw new Error('Unsynced Driver work is saved on this device. Reconnect and sync before signing out.');
    const routes = await requestResult(tx.objectStore('routes').index('userId').getAll(userId)) as CachedDriverRoutes[];
    for (const record of routes) tx.objectStore('routes').delete(record.key);
    for (const operation of operations) tx.objectStore('operations').delete(operation.operationId);
    tx.objectStore('identities').delete(userId);
    const active = await requestResult(tx.objectStore('meta').get('active-driver')) as { userId: string } | undefined;
    if (active?.userId === userId) tx.objectStore('meta').delete('active-driver');
  });
}
