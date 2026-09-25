import type { BookingOrchestrator } from '../modules/bookings/bookingOrchestrator.js';

export function createReconciliationJob(orchestrator: BookingOrchestrator) {
  return () => orchestrator.reconcile();
}
