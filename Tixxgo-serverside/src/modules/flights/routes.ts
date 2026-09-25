import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { flightSearchSchema } from './schema.js';
import { FlightService } from './service.js';
import type { SupplierGateway } from '../../suppliers/gateway/SupplierGateway.js';
import { FareRevalidationService } from './revalidationService.js';

const offerParamsSchema = z.object({ offerId: z.string().uuid() });
const quoteParamsSchema = z.object({ quoteId: z.string().uuid() });

export function createFlightRouter(database: Knex, gateway: SupplierGateway): Router {
  const router = Router();
  const service = new FlightService(gateway, database);
  const revalidationService = new FareRevalidationService(database, gateway);

  router.post('/search', validate(flightSearchSchema), async (req, res, next) => {
    try {
      const result = await service.search(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/revalidate', validate(offerParamsSchema), async (req, res, next) => {
    try {
      res.status(200).json(await revalidationService.revalidate(req.body.offerId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/quotes/:quoteId/accept', validate(quoteParamsSchema, 'params'), async (req, res, next) => {
    try {
      res.status(200).json(await revalidationService.accept(req.params.quoteId as string));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
