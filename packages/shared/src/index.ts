import { z } from 'zod';
export * from './store.js';
export * from './dispatcher.js';
export * from './planning.js';
export * from './loader.js';
export * from './driver.js';
export * from './proof.js';
export * from './location.js';

export const ROLES = ['DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  DISPATCHER: 'Dispatcher', LOADER: 'Loader', DRIVER: 'Driver', STORE_MANAGER: 'Store Manager'
};
export const ROLE_HOME: Record<Role, string> = {
  DISPATCHER: '/dispatcher/pulse', LOADER: '/loader/loads',
  DRIVER: '/driver/today', STORE_MANAGER: '/store/home'
};
export const DEMO_ACCOUNTS = ROLES.map(role => ({
  role, email: `${role === 'STORE_MANAGER' ? 'store' : role.toLowerCase()}@waypoint.local`,
  displayName: `${ROLE_LABELS[role]} Demo`
}));

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1, 'Enter your password.').max(128)
}).strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const userSchema = z.object({
  id: z.string(), email: z.string().email(), role: roleSchema, displayName: z.string()
});
export type AuthUser = z.infer<typeof userSchema>;
export const authResponseSchema = z.object({ user: userSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;
export interface ApiError { error: { code: string; message: string; fields?: Record<string, string[]> } }
