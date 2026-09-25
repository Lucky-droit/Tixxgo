import { Router } from 'express';
import { z } from 'zod';
import { ScenarioController } from './scenarioController.js';

const scenarioSchema = z.object({ scenario: z.string().min(1) });

export function createMockSupplierRouter(controller: ScenarioController): Router {
  const router = Router();

  router.post('/scenario', (req, res, next) => {
    const result = scenarioSchema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    try {
      res.json({ scenario: controller.set(result.data.scenario) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/scenario', (_req, res) => {
    res.json({ scenario: controller.get() });
  });

  return router;
}
