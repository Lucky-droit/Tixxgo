import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestId: RequestHandler = (req, res, next) => {
  const id = req.header('X-Request-Id') ?? randomUUID();
  res.setHeader('X-Request-Id', id);
  res.locals.requestId = id;
  next();
};
