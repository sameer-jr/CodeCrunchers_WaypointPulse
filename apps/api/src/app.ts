import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import { loginSchema, ROLES, ROLE_HOME, ROLE_LABELS, type LoginInput } from '@waypoint/shared';
import type { Config } from './config.js';
import { authenticate, authorize, cookieOptions, createSession, protectOrigin, publicUser, revokeSession, SESSION_COOKIE } from './auth.js';
import { errorHandler, HttpError, validateBody } from './http.js';
import { hashPassword, verifyPassword } from './password.js';
import { domainReadRouter } from './domain/routes.js';
import { storeRouter } from './store/routes.js';
import type { StoreServiceOptions } from './store/services.js';
import { dispatcherRouter } from './dispatcher/routes.js';
import type { DispatcherServiceOptions } from './dispatcher/services.js';
import { planningRouter } from './planning/routes.js';
import type { PlanningServiceOptions } from './planning/services.js';
import { loaderRouter } from './loader/routes.js';
import type { LoaderServiceOptions } from './loader/services.js';
import { driverRouter } from './driver/routes.js';
import type { DriverServiceOptions } from './driver/services.js';
import { proofRouter } from './proof/routes.js';
import { locationRouter } from './location/routes.js';
import type { LocationServiceOptions } from './location/services.js';
import { publicJudgeWorkspaceMetadata } from './domain/public-judge-workspace.js';

const dummyHash = hashPassword('timing-only-invalid-account');

export function createApp(prisma: PrismaClient, config: Config, options: { store?: StoreServiceOptions; dispatcher?: DispatcherServiceOptions; planning?: PlanningServiceOptions; loader?: LoaderServiceOptions; driver?: DriverServiceOptions; location?: LocationServiceOptions } = {}) {
  const storeOptions = { allowSyntheticReferences: config.PUBLIC_JUDGE_DEMO || config.STORE_ALLOW_SYNTHETIC, ...options.store };
  if (config.NODE_ENV === 'production' && storeOptions.allowSyntheticReferences && !config.PUBLIC_JUDGE_DEMO) throw new Error('Synthetic Store eligibility is not allowed in production.');
  const planningOptions = { allowSyntheticReferences: config.PUBLIC_JUDGE_DEMO || config.PLANNING_ALLOW_SYNTHETIC, ...options.planning };
  if (config.NODE_ENV === 'production' && planningOptions.allowSyntheticReferences && !config.PUBLIC_JUDGE_DEMO) throw new Error('Synthetic planning references are not allowed in production.');
  const app = express();
  app.disable('x-powered-by');
  if (config.API_TRUST_PROXY) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(protectOrigin(config));
  const mediaRequest = (method: string, path: string) => method === 'POST' && (path === '/api/driver/sync' || /^\/api\/driver\/stops\/[^/]+\/complete$/.test(path));
  const standardJson = express.json({ limit: '16kb' });
  app.use((request, response, next) => mediaRequest(request.method, request.path) ? next() : standardJson(request, response, next));
  app.use('/api/driver', authenticate(prisma, config), authorize('DRIVER'), (request, response, next) =>
    mediaRequest(request.method, `/api/driver${request.path}`) ? express.json({ limit: '5mb' })(request, response, next) : next());
  app.use('/api/auth', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: 'ok', database: 'connected', milestone: 'foundation' });
    } catch {
      response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'The database is not ready.' } });
    }
  });
  app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Try again in 15 minutes.' } }
  }), validateBody(loginSchema), async (request, response) => {
    const { email, password } = request.body as LoginInput;
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
    if (!user || !user.active || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    await revokeSession(prisma, config, request);
    await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await createSession(prisma, user.id, config, response);
    response.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', async (request, response) => {
    await revokeSession(prisma, config, request);
    response.clearCookie(SESSION_COOKIE, cookieOptions(config));
    response.status(204).end();
  });
  app.get('/api/auth/me', authenticate(prisma, config), (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ user: response.locals.user });
  });
  for (const role of ROLES) {
    const slug = ROLE_HOME[role].split('/')[1];
    app.get(`/api/workspaces/${slug}`, authenticate(prisma, config), authorize(role), async (_request, response) => {
      const user = response.locals.user as { id: string };
      response.set('Cache-Control', 'no-store').json({ role, title: ROLE_LABELS[role], state: 'FOUNDATION',
        ...(config.PUBLIC_JUDGE_DEMO ? { publicJudge: await publicJudgeWorkspaceMetadata(prisma, user.id, role) } : {}) });
    });
  }
  app.use('/api/domain', authenticate(prisma, config), domainReadRouter(prisma));
  app.use('/api/proof', authenticate(prisma, config), proofRouter(prisma));
  app.use('/api/location', authenticate(prisma, config), locationRouter(prisma, options.location));
  app.use('/api/store', authenticate(prisma, config), authorize('STORE_MANAGER'), storeRouter(prisma, storeOptions));
  app.use('/api/loader', authenticate(prisma, config), authorize('LOADER'), loaderRouter(prisma, { demoDate: config.DISPATCHER_DEMO_DATE, ...options.loader }));
  app.use('/api/driver', authenticate(prisma, config), authorize('DRIVER'), driverRouter(prisma, { demoDate: config.DISPATCHER_DEMO_DATE, ...options.driver }));
  app.use('/api/dispatcher/plans', authenticate(prisma, config), authorize('DISPATCHER'), planningRouter(prisma, planningOptions));
  app.use('/api/dispatcher', authenticate(prisma, config), authorize('DISPATCHER'), dispatcherRouter(prisma, { demoDate: config.DISPATCHER_DEMO_DATE, ...options.dispatcher, allowSyntheticReferences: planningOptions.allowSyntheticReferences }));
  app.use((_request, _response, next) => next(new HttpError(404, 'NOT_FOUND', 'This API resource does not exist.')));
  app.use(errorHandler);
  return app;
}
