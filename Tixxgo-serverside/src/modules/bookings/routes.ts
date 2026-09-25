import { Router } from 'express';
import type { Knex } from 'knex';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import { BookingService } from './service.js';
import { bookingParamsSchema, createBookingSchema } from './schema.js';

export function createBookingRouter(database: Knex): Router {
  const router = Router();
  const service = new BookingService(database);

  router.post('/', idempotency(database), validate(createBookingSchema), async (req, res, next) => {
    try {
      const result = await service.create(req.body, req.header('Idempotency-Key') as string);
      await res.locals.completeIdempotency?.(201, result);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:idOrReference', validate(bookingParamsSchema, 'params'), async (req, res, next) => {
    try {
      res.status(200).json(await service.get(req.params.idOrReference as string));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
