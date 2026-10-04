import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, loginSchema, ROLE_HOME, ROLES } from './index.js';

describe('authentication contract', () => {
  it('normalizes email without altering the password', () => {
    expect(loginSchema.parse({ email: ' DRIVER@waypoint.local ', password: ' password ' }))
      .toEqual({ email: 'driver@waypoint.local', password: ' password ' });
  });
  it('rejects a client-supplied role', () => {
    expect(loginSchema.safeParse({ email: 'driver@waypoint.local', password: 'test', role: 'DISPATCHER' }).success).toBe(false);
  });
  it('provides one safe demo identity and home for every role', () => {
    expect(new Set(DEMO_ACCOUNTS.map(user => user.email)).size).toBe(4);
    for (const role of ROLES) expect(ROLE_HOME[role]).toMatch(/^\/(dispatcher|loader|driver|store)\//);
  });
});
