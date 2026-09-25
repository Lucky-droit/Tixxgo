import { Router } from 'express';
import type { Knex } from 'knex';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import type { MockPaymentGateway } from '../payments/MockPaymentGateway.js';
import type { SupplierGateway } from '../../suppliers/gateway/SupplierGateway.js';
import { CancellationService } from './service.js';
import { cancellationParamsSchema, cancellationRequestSchema } from './schema.js';

export function createCancellationService(database: Knex, gateway: SupplierGateway, paymentGateway: MockPaymentGateway): CancellationService {
  return new CancellationService(database, gateway, paymentGateway);
}

export function createCancellationRouter(service: CancellationService, database: Knex): Router {
  const router = Router();
  const confirmIdempotency = (req: Parameters<typeof idempotency>[0] extends never ? never : any, res: any, next: any) => {
    if (req.body?.confirm === true) return idempotency(database)(req, res, next);
    next();
  };

  router.post('/:bookingId/cancel', confirmIdempotency, validate(cancellationParamsSchema, 'params'), validate(cancellationRequestSchema), async (req, res, next) => {
    try {
      const result = await service.cancel(req.params.bookingId as string, req.body);
      if (req.body.confirm === true) await res.locals.completeIdempotency?.(200, result);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function createCancellationReconciliationRouter(service: CancellationService): Router {
  const router = Router();
  router.post('/reconcile-cancellations', async (_req, res, next) => {
    try {
      res.status(200).json(await service.reconcile());
    } catch (error) {
      next(error);
    }
  });
  return router;
}
