import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ValidationError } from '../domain/errors.js';

export function validate(schema: z.ZodType, source: 'body' | 'query' | 'params' = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new ValidationError('Request validation failed', { issues: result.error.issues }));
      return;
    }
    req[source] = result.data;
    next();
  };
}
