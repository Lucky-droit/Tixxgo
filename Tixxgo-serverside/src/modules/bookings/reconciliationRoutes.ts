import { Router } from 'express';
import type { BookingOrchestrator } from './bookingOrchestrator.js';

export function createReconciliationRouter(orchestrator: BookingOrchestrator): Router {
  const router = Router();
  router.post('/reconcile', async (_req, res, next) => {
    try {
      res.status(200).json(await orchestrator.reconcile());
    } catch (error) {
      next(error);
    }
  });
  return router;
}
