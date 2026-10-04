import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { DEMO_ACCOUNTS } from '@waypoint/shared';
import { createApp } from './app.js';
import { readConfig } from './config.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('Run npm run test to provision an isolated PostgreSQL test database.');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const config = readConfig({ ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: 'test' });
const app = createApp(prisma, config);
const password = process.env.SEED_DEMO_PASSWORD!;
const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });

afterAll(async () => prisma.$disconnect());
describe('PostgreSQL authentication and authorization', () => {
  it.each(DEMO_ACCOUNTS)('authenticates the seeded $role and exposes only safe identity fields', async account => {
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/login').send({ email: account.email, password });
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: account.email, role: account.role });
    expect(Object.keys(response.body.user).sort()).toEqual(['displayName', 'email', 'id', 'role']);
    expect(String(response.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(response.headers['set-cookie'])).toContain('SameSite=Strict');
    expect((await agent.get('/api/auth/me')).body.user.email).toBe(account.email);
  });
  it('rejects incorrect passwords and unknown accounts with the same response', async () => {
    for (const email of ['driver@waypoint.local', 'absent@waypoint.local']) {
      const response = await request(app).post('/api/auth/login').send({ email, password: 'incorrect' });
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    }
  });
  it('rejects unauthenticated protected requests', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/workspaces/dispatcher')).status).toBe(401);
  });
  it.each(['driver@waypoint.local', 'store@waypoint.local'])('prevents %s from reading the Dispatcher resource', async email => {
    const response = await login(email);
    const cookies = response.headers['set-cookie'];
    expect((await request(app).get('/api/workspaces/dispatcher').set('Cookie', cookies)).status).toBe(403);
  });
  it('allows only the matching workspace for each account', async () => {
    const slugs = ['dispatcher', 'loader', 'driver', 'store'];
    for (const [index, account] of DEMO_ACCOUNTS.entries()) {
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email: account.email, password });
      for (const [target, slug] of slugs.entries()) {
        expect((await agent.get(`/api/workspaces/${slug}`)).status).toBe(index === target ? 200 : 403);
      }
    }
  });
  it('rejects invalid input, client role injection, and foreign-origin mutations', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'bad', password })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'driver@waypoint.local', password, role: 'DISPATCHER' })).status).toBe(400);
    expect((await request(app).post('/api/auth/logout').set('Origin', 'https://unapproved.example')).status).toBe(403);
    expect((await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad')).status).toBe(400);
  });
  it('revokes logout sessions even if the old cookie is replayed', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/login').send({ email: 'dispatcher@waypoint.local', password });
    const cookies = response.headers['set-cookie'];
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookies)).status).toBe(401);
  });
  it('rejects expired sessions, deactivated users and forged cookies', async () => {
    const response = await login('loader@waypoint.local');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'loader@waypoint.local' } });
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    expect((await request(app).get('/api/auth/me').set('Cookie', response.headers['set-cookie'])).status).toBe(401);
    const fresh = await login('loader@waypoint.local');
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    try {
      expect((await request(app).get('/api/auth/me').set('Cookie', fresh.headers['set-cookie'])).status).toBe(401);
      expect((await login('loader@waypoint.local')).status).toBe(401);
    } finally { await prisma.user.update({ where: { id: user.id }, data: { active: true } }); }
    expect((await request(app).get('/api/auth/me').set('Cookie', 'waypoint_session=forged')).status).toBe(401);
  });
  it('stores salted password hashes and token digests, and reports database readiness', async () => {
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(4);
    expect(new Set(users.map(user => user.passwordHash)).size).toBe(4);
    for (const user of users) expect(user.passwordHash).toMatch(/^scrypt\$/);
    const sessions = await prisma.session.findMany();
    for (const session of sessions) expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await request(app).get('/api/health')).body).toMatchObject({ status: 'ok', database: 'connected' });
  });
});
