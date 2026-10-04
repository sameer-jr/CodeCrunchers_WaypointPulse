import { createHmac, randomBytes } from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import type { Request, RequestHandler, Response } from 'express';
import type { AuthUser, Role } from '@waypoint/shared';
import type { Config } from './config.js';
import { HttpError } from './http.js';

export const SESSION_COOKIE = 'waypoint_session';
export function publicUser(user: User): AuthUser {
  return { id: user.id, email: user.email, role: user.role, displayName: user.displayName };
}
export function tokenHash(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
export function readToken(request: Request): string | undefined {
  const value: unknown = request.cookies?.[SESSION_COOKIE];
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export function cookieOptions(config: Config) {
  return { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/api' };
}
export async function createSession(prisma: PrismaClient, userId: string, config: Config, response: Response) {
  const token = randomBytes(32).toString('hex');
  const maxAge = config.SESSION_HOURS * 60 * 60 * 1000;
  await prisma.session.create({ data: { tokenHash: tokenHash(token, config.AUTH_SECRET), userId, expiresAt: new Date(Date.now() + maxAge) } });
  response.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge });
}
export async function revokeSession(prisma: PrismaClient, config: Config, request: Request) {
  const token = readToken(request);
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token, config.AUTH_SECRET) } });
}

export function authenticate(prisma: PrismaClient, config: Config): RequestHandler {
  return async (request, response, next) => {
    const token = readToken(request);
    if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token, config.AUTH_SECRET) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || !session.user.active) {
      response.clearCookie(SESSION_COOKIE, cookieOptions(config));
      throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has ended. Sign in again.');
    }
    response.locals.user = publicUser(session.user);
    next();
  };
}

export function authorize(...roles: Role[]): RequestHandler {
  return (_request, response, next) => {
    const user = response.locals.user as AuthUser | undefined;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    if (!roles.includes(user.role)) throw new HttpError(403, 'FORBIDDEN', 'This workspace is assigned to another role.');
    next();
  };
}

export function protectOrigin(config: Config): RequestHandler {
  return (request, _response, next) => {
    const origin = request.get('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && origin && origin !== config.WEB_ORIGIN) {
      throw new HttpError(403, 'ORIGIN_REJECTED', 'This request came from an unapproved origin.');
    }
    next();
  };
}
