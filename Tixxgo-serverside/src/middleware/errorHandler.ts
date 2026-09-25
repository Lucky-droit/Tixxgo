import type { ErrorRequestHandler } from 'express';
import { AppError } from '../domain/errors.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = error instanceof AppError
    ? error
    : new AppError('INTERNAL_ERROR', 'An unexpected error occurred', 500);

  if (appError.statusCode >= 500) {
    logger.error({ err: error, requestId: res.locals.requestId, path: req.path }, 'Request failed');
  }

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details
    }
  });
};
