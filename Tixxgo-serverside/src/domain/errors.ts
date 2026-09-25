export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 500,
    public readonly details: ErrorDetails = {}
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details: ErrorDetails = {}) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details: ErrorDetails = {}) {
    super('NOT_FOUND', message, 404, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Request conflicts with the current state', details: ErrorDetails = {}) {
    super('CONFLICT', message, 409, details);
  }
}

export class SupplierError extends AppError {
  constructor(code: 'TIMEOUT' | 'UNAVAILABLE' | 'REJECTED' | 'PRICE_CHANGED', message: string, details: ErrorDetails = {}) {
    super(code, message, 502, details);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message = 'Invalid state transition', details: ErrorDetails = {}) {
    super('INVALID_STATE_TRANSITION', message, 409, details);
  }
}
