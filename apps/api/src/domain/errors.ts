export class DomainError extends Error {
  constructor(public code: 'INVALID_DOMAIN' | 'DOMAIN_FORBIDDEN' | 'DOMAIN_NOT_FOUND' | 'DOMAIN_CONFLICT' | 'MISSING_RELATED_DATA', message: string) { super(message); }
}

export function requireDomain(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError('INVALID_DOMAIN', message);
}
