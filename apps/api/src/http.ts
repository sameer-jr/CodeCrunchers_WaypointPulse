import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { DomainError } from './domain/errors.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function validateBody(schema: ZodType): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Check the submitted fields.', fields: result.error.flatten().fieldErrors } });
      return;
    }
    request.body = result.data;
    next();
  };
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof DomainError) {
    const status = { INVALID_DOMAIN: 400, DOMAIN_FORBIDDEN: 403, DOMAIN_NOT_FOUND: 404, DOMAIN_CONFLICT: 409, MISSING_RELATED_DATA: 409 }[error.code];
    response.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  const status = typeof error === 'object' && error && 'status' in error ? error.status : undefined;
  if (status === 400 || status === 413) {
    response.status(status).json({ error: { code: 'INVALID_REQUEST', message: status === 413 ? 'Request is too large.' : 'Request body must be valid JSON.' } });
    return;
  }
  console.error('API request failed with an internal error.');
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed. Please try again.' } });
};
