export function authorizedProofUrl(value: string, origin: string) {
  const url = new URL(value, origin);
  if (url.origin !== origin || !/^\/api\/proof\/attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname) ||
    url.username || url.password || url.search || url.hash) throw new Error('This proof image address is invalid.');
  return url.href;
}
