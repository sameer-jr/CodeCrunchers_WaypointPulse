import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const accountEmail = 'dispatcher@waypoint.local';

export async function verifyDockerHttp({ baseUrl, origin, password }) {
  const url = new URL(baseUrl);
  assert(['web', 'localhost', '127.0.0.1'].includes(url.hostname), 'Docker verification targets only the local stack.');
  assert(password, 'SEED_DEMO_PASSWORD is required for seeded authentication verification.');
  const request = (path, options = {}) => fetch(new URL(path, url), { signal: AbortSignal.timeout(15000), ...options });
  const web = await request('/');
  assert.equal(web.status, 200, 'Web must respond with HTTP 200.');
  assert(web.headers.get('content-type')?.includes('text/html'), 'Web must serve HTML.');
  const health = await request('/api/health');
  assert.equal(health.status, 200, 'API health must respond with HTTP 200.');
  const healthBody = await health.json();
  assert.equal(healthBody.status, 'ok');
  assert.equal(healthBody.database, 'connected', 'API health must confirm PostgreSQL connectivity.');
  assert.equal((await request('/api/workspaces/dispatcher')).status, 401, 'Protected workspace must require authentication.');

  const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: accountEmail, password }) });
  assert.equal(login.status, 200, 'Seeded Dispatcher login must succeed.');
  const user = (await login.json()).user;
  assert.equal(user?.email, accountEmail);
  assert.equal(user?.role, 'DISPATCHER');
  assert.equal(typeof user?.id, 'string');
  const cookie = login.headers.getSetCookie().find(value => value.startsWith('waypoint_session='))?.split(';')[0];
  assert(cookie, 'Login must issue a session cookie.');
  try {
    const me = await request('/api/auth/me', { headers: { Cookie: cookie } });
    assert.equal(me.status, 200, 'Persisted session must restore the seeded identity.');
    const restored = (await me.json()).user;
    assert.equal(restored?.id, user.id);
    assert.equal(restored?.email, accountEmail);
    assert.equal(restored?.role, 'DISPATCHER');
    const workspace = await request('/api/workspaces/dispatcher', { headers: { Cookie: cookie } });
    assert.equal(workspace.status, 200, 'Authenticated Dispatcher workspace must be available.');
    assert.equal((await workspace.json()).role, 'DISPATCHER');
  } finally {
    const logout = await request('/api/auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
    assert.equal(logout.status, 204, 'Verification session must be logged out.');
  }
  console.log('PASS: Web HTTP, database-connected API health, seeded Dispatcher login, restored session, protected workspace and logout.');
}

async function verifyInstallation() {
  const { PrismaClient, Prisma } = await import('@prisma/client');
  const { DEMO_ACCOUNTS } = await import('@waypoint/shared');
  const db = new PrismaClient();
  try {
    const expectedMigrations = (await readdir(new URL('../prisma/migrations/', import.meta.url), { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.deepEqual(applied.map(row => row.migration_name).sort(), expectedMigrations, 'Every committed migration must be applied.');
    const users = await db.user.findMany({ select: { email: true, role: true }, orderBy: { email: 'asc' } });
    const safeUsers = DEMO_ACCOUNTS.map(({ email, role }) => ({ email, role })).sort((a, b) => a.email.localeCompare(b.email));
    assert.deepEqual(users, safeUsers, 'Fresh installation must contain only the four publication-safe auth accounts.');
    const models = Object.values(Prisma.ModelName).filter(name => !['User', 'Session'].includes(name));
    const counts = await Promise.all(models.map(name => db[name[0].toLowerCase() + name.slice(1)].count()));
    assert(counts.every(count => count === 0), 'Installation must not seed reference, assignment or operational data.');
    console.log(`PASS: ${expectedMigrations.length} committed migrations and four safe auth accounts; no reference/operational data seeded.`);
  } finally { await db.$disconnect(); }
}

async function verifyMediaRuntime() {
  const { default: sharp } = await import('sharp');
  const { prepareProofAttachments } = await import('../apps/api/dist/proof/media.js');
  const input = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#b9df42' } }).png().toBuffer();
  const attachments = await prepareProofAttachments(['PHOTO', 'SIGNATURE'].map(kind => ({ kind, contentType: 'image/png', base64: input.toString('base64') })));
  assert.equal(attachments.length, 2);
  for (const attachment of attachments) {
    const metadata = await sharp(attachment.bytes).metadata();
    assert.equal(metadata.format, attachment.kind === 'PHOTO' ? 'jpeg' : 'png');
    assert.equal(metadata.width, 12);
    assert.equal(metadata.height, 8);
    assert.equal(attachment.byteLength, attachment.bytes.length);
  }
  console.log('PASS: Image processing runtime decodes and normalizes synthetic photo/signature bytes; no application records written.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--installation')) await verifyInstallation();
    await verifyMediaRuntime();
    await verifyDockerHttp({ baseUrl: process.env.DOCKER_VERIFY_URL ?? 'http://web', origin: process.env.WEB_ORIGIN,
      password: process.env.SEED_DEMO_PASSWORD });
  } catch (error) {
    console.error(`FAIL: Docker verification: ${error instanceof Error ? error.message : 'Unexpected verification failure.'}`);
    process.exitCode = 1;
  }
}
