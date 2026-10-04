import { authResponseSchema, type ApiError, type AuthUser, type LoginInput } from '@waypoint/shared';

export class ApiFailure extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  } catch { throw new ApiFailure(0, 'Unable to reach Waypoint Pulse. Check your connection and try again.'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiError | null;
    throw new ApiFailure(response.status, body?.error?.message || 'The request could not be completed.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getIdentity(): Promise<AuthUser | null> {
  try { return authResponseSchema.parse(await apiRequest('/auth/me')).user; }
  catch (error) { if (error instanceof ApiFailure && error.status === 401) return null; throw error; }
}
export async function login(input: LoginInput): Promise<AuthUser> {
  return authResponseSchema.parse(await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(input) })).user;
}
