import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

const allowedOrigins = new Set(
  env.FRONTEND_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
);

export const cors: RequestHandler = (req, res, next) => {
  const origin = req.header('Origin');

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, X-Request-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(origin && !allowedOrigins.has(origin) ? 403 : 204);
    return;
  }

  next();
};
