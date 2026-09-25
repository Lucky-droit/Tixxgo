import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Knex } from 'knex';
import { AppError, ConflictError } from '../domain/errors.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

function requestHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(body))).digest('hex');
}

export function idempotency(database: Knex): RequestHandler {
  return async (req, res, next) => {
    const key = req.header('Idempotency-Key');
    if (!key) {
      next(new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required', 400));
      return;
    }

    const endpoint = `${req.method} ${req.baseUrl}${req.path}`;
    const hash = requestHash(req.body);
    let owner = false;
    let completed = false;

    try {
      await database('idempotency_keys').insert({ key, endpoint, request_hash: hash });
      owner = true;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        next(error);
        return;
      }

      const existing = await database('idempotency_keys').where({ key, endpoint }).first();
      if (!existing) {
        next(error);
        return;
      }
      if (existing.request_hash !== hash) {
        next(new ConflictError('Idempotency key was already used with a different request body'));
        return;
      }
      if (existing.response_status === null || existing.response_status === undefined) {
        next(new AppError('REQUEST_IN_PROGRESS', 'A request with this idempotency key is already in progress', 409));
        return;
      }
      res.status(existing.response_status).json(existing.response_body);
      return;
    }

    const complete = async (status: number, body: unknown): Promise<void> => {
      if (owner && !completed) {
        completed = true;
        await database('idempotency_keys').where({ key, endpoint }).update({ response_status: status, response_body: body });
      }
    };
    res.locals.completeIdempotency = complete;
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      void complete(res.statusCode, body);
      return originalJson(body);
    }) as typeof res.json;
    next();
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}
