import { Router } from 'express';
import { z } from 'zod';
import type { Knex } from 'knex';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import { MockPaymentGateway } from './MockPaymentGateway.js';
import { PaymentService } from './service.js';

const bookingParamsSchema = z.object({ id: z.string().uuid() });
const callbackSchema = z.object({ gatewayTxnId: z.string().min(1), status: z.enum(['SUCCESS', 'FAILED']) });
const scenarioSchema = z.object({ scenario: z.enum(['SUCCESS', 'FAILURE', 'DELAYED_SUCCESS']) });

export function createPaymentRoutes(database: Knex, gateway = new MockPaymentGateway(), onPaymentSuccess?: (bookingId: string) => Promise<unknown>): { bookingPayment: Router; paymentCallbacks: Router; gateway: MockPaymentGateway } {
  const service = new PaymentService(database, gateway, onPaymentSuccess);
  const bookingPayment = Router();
  const paymentCallbacks = Router();

  bookingPayment.post('/:id/payment', idempotency(database), validate(bookingParamsSchema, 'params'), async (req, res, next) => {
    try {
      const result = await service.createPayment(req.params.id as string, req.header('Idempotency-Key') as string);
      await res.locals.completeIdempotency?.(200, result);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  paymentCallbacks.post('/mock-gateway/callback', validate(callbackSchema), async (req, res, next) => {
    try {
      res.status(200).json(await service.processCallback(req.body.gatewayTxnId, req.body.status));
    } catch (error) {
      next(error);
    }
  });

  paymentCallbacks.post('/mock-gateway/scenario', validate(scenarioSchema), async (req, res, next) => {
    try {
      res.status(200).json({ scenario: await service.setScenario(req.body.scenario) });
    } catch (error) {
      next(error);
    }
  });

  return { bookingPayment, paymentCallbacks, gateway };
}
