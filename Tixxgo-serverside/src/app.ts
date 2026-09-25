import express, { type Express } from 'express';
import type { Knex } from 'knex';
import { db } from './db/knex.js';
import { AppError, ValidationError } from './domain/errors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { cors } from './middleware/cors.js';
import { requestId } from './middleware/requestId.js';
import { env } from './config/env.js';
import { createMockSupplierRouter } from './suppliers/mock/mockSupplierServer.js';
import { createSupplierRuntime } from './suppliers/runtime.js';
import { createFlightRouter } from './modules/flights/routes.js';
import { createBookingRouter } from './modules/bookings/routes.js';
import { createPaymentRoutes } from './modules/payments/routes.js';
import { MockPaymentGateway } from './modules/payments/MockPaymentGateway.js';
import { BookingOrchestrator } from './modules/bookings/bookingOrchestrator.js';
import { createReconciliationRouter } from './modules/bookings/reconciliationRoutes.js';
import { createCancellationReconciliationRouter, createCancellationRouter, createCancellationService } from './modules/cancellations/routes.js';

export function createApp(database: Knex = db): Express {
  const app = express();
  const supplierRuntime = createSupplierRuntime();
  const paymentGateway = new MockPaymentGateway();
  const bookingOrchestrator = new BookingOrchestrator(database, supplierRuntime.gateway, paymentGateway);
  const paymentRoutes = createPaymentRoutes(database, paymentGateway, (bookingId) => bookingOrchestrator.bookWithSupplier(bookingId));

  app.use(requestId);
  app.use(cors);
  app.use(express.json());
  app.use('/api/dev/mock-supplier', createMockSupplierRouter(supplierRuntime.scenarios));
  app.use('/api/flights', createFlightRouter(database, supplierRuntime.gateway));
  app.use('/api/bookings', paymentRoutes.bookingPayment);
  app.use('/api/bookings', createBookingRouter(database));
  app.use('/api/payments', paymentRoutes.paymentCallbacks);
  const cancellationService = createCancellationService(database, supplierRuntime.gateway, paymentGateway);
  app.use('/api/bookings', createCancellationRouter(cancellationService, database));
  app.use('/api/admin', createCancellationReconciliationRouter(cancellationService));
  app.use('/api/admin', createReconciliationRouter(bookingOrchestrator));

  app.get('/health', async (_req, res, next) => {
    try {
      await database.raw('SELECT 1');
      res.status(200).json({ status: 'ok', database: 'ok' });
    } catch (error) {
      next(new AppError('DATABASE_UNAVAILABLE', 'Database connectivity check failed', 503, { cause: error instanceof Error ? error.message : 'unknown' }));
    }
  });

  if (env.NODE_ENV !== 'production') {
    app.get('/api/dev/error', (_req, _res, next) => {
      next(new ValidationError('Example validation failure', { field: 'example' }));
    });
  }

  app.use(errorHandler);
  return app;
}
