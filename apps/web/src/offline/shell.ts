let ready: Promise<boolean> | undefined;
export function ensureOfflineShell(): Promise<boolean> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return Promise.resolve(false);
  ready ??= navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(async () => {
    await navigator.serviceWorker.ready;
    return true;
  }).catch(() => false);
  return ready;
}
