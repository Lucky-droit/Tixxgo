import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { constants } from '../../config/constants.js';
import { transition } from '../../domain/bookingStateMachine.js';
import { ConflictError, SupplierError } from '../../domain/errors.js';
import type { MockPaymentGateway } from '../payments/MockPaymentGateway.js';
import { NotificationService } from '../notifications/notificationService.js';
import type { SupplierGateway } from '../../suppliers/gateway/SupplierGateway.js';

interface BookingRow {
  id: string;
  booking_reference: string;
  supplier_code: string;
  supplier_result_id: string;
  supplier_booking_ref: string | null;
  booking_status: string;
  payment_status: string;
}

interface AttemptRow {
  id: string;
  booking_id: string;
  attempt_no: number;
  client_reference: string;
  status: 'IN_FLIGHT' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  response_json: Record<string, unknown> | string | null;
}

export class BookingOrchestrator {
  private readonly notifications: NotificationService;

  constructor(
    private readonly database: Knex,
    private readonly gateway: SupplierGateway,
    private readonly paymentGateway: MockPaymentGateway
  ) {
    this.notifications = new NotificationService(database);
  }

  async bookWithSupplier(bookingId: string): Promise<{ status: string; supplierBookingRef?: string }> {
    const preparation = await this.database.transaction(async (transaction) => {
      const booking = await transaction<BookingRow>('bookings').where({ id: bookingId }).forUpdate().first();
      if (!booking) throw new ConflictError('Booking not found');
      if (!['PAYMENT_SUCCESS', 'SUPPLIER_BOOKING_UNKNOWN', 'SUPPLIER_BOOKING'].includes(booking.booking_status)) {
        throw new ConflictError(`Booking cannot be sent to supplier from ${booking.booking_status}`);
      }

      const attempt = await transaction<AttemptRow>('supplier_booking_attempts').where({ booking_id: bookingId }).orderBy('attempt_no', 'desc').first();
      if (attempt?.status === 'SUCCESS') return { action: 'CONFIRMED' as const, booking, attempt };
      if (attempt && ['IN_FLIGHT', 'UNKNOWN'].includes(attempt.status)) return { action: 'RESOLVE' as const, booking, attempt };

      const attemptNo = (attempt?.attempt_no ?? 0) + 1;
      const newAttempt: AttemptRow = {
        id: randomUUID(),
        booking_id: bookingId,
        attempt_no: attemptNo,
        client_reference: booking.booking_reference,
        status: 'IN_FLIGHT',
        response_json: null
      };
      if (booking.booking_status === 'PAYMENT_SUCCESS') {
        await transition(transaction, bookingId, 'SUPPLIER_BOOKING', 'SUPPLIER_BOOKING_STARTED');
      }
      await transaction('supplier_booking_attempts').insert({
        id: newAttempt.id,
        booking_id: bookingId,
        attempt_no: attemptNo,
        client_reference: newAttempt.client_reference,
        status: newAttempt.status,
        request_json: JSON.stringify({ clientReference: newAttempt.client_reference, supplierResultId: booking.supplier_result_id }),
        started_at: new Date()
      });
      return { action: 'CREATE' as const, booking, attempt: newAttempt };
    });

    if (preparation.action === 'CONFIRMED') {
      return { status: 'BOOKING_CONFIRMED', supplierBookingRef: preparation.booking.supplier_booking_ref ?? undefined };
    }
    if (preparation.action === 'RESOLVE') {
      return this.resolveUnknown(preparation.booking, preparation.attempt);
    }

    try {
      const result = await this.gateway.createBooking(preparation.booking.supplier_code, {
        supplierResultId: preparation.booking.supplier_result_id,
        clientReference: preparation.attempt.client_reference,
        contact: { email: '', phone: '' },
        travellers: []
      });
      if (result.status === 'CONFIRMED' && result.supplierBookingRef) {
        await this.markConfirmed(preparation.booking.id, preparation.attempt.id, result.supplierBookingRef, result.rawSupplierPayload);
        return { status: 'BOOKING_CONFIRMED', supplierBookingRef: result.supplierBookingRef };
      }
      await this.markFailed(preparation.booking.id, preparation.attempt.id, result.rawSupplierPayload, result.message);
      await this.refund(preparation.booking.id, 'SUPPLIER_FAILURE');
      return { status: 'SUPPLIER_BOOKING_FAILED' };
    } catch (error) {
      const code = error instanceof SupplierError ? error.code : 'UNAVAILABLE';
      await this.markUnknown(preparation.booking.id, preparation.attempt.id, { errorCode: code });
      await this.notifications.send(preparation.booking.id, 'BOOKING_PROCESSING', { reason: code });
      return { status: 'SUPPLIER_BOOKING_UNKNOWN' };
    }
  }

  async resolveUnknown(booking: BookingRow, attempt: AttemptRow): Promise<{ status: string; supplierBookingRef?: string }> {
    const status = await this.gateway.getBookingStatus(booking.supplier_code, { clientReference: attempt.client_reference });
    if (status.status === 'CONFIRMED' && status.supplierBookingRef) {
      await this.markConfirmed(booking.id, attempt.id, status.supplierBookingRef, status.rawSupplierPayload);
      return { status: 'BOOKING_CONFIRMED', supplierBookingRef: status.supplierBookingRef };
    }

    const metadata = this.readMetadata(attempt.response_json);
    const notFoundChecks = status.status === 'NOT_FOUND' ? metadata.notFoundChecks + 1 : metadata.notFoundChecks;
    const statusChecks = metadata.statusChecks + 1;
    if (status.status === 'NOT_FOUND' && notFoundChecks >= 2) {
      await this.markFailed(booking.id, attempt.id, { ...status.rawSupplierPayload, notFoundChecks }, 'Supplier booking not found after consecutive checks');
      await this.refund(booking.id, 'SUPPLIER_FAILURE');
      return { status: 'SUPPLIER_BOOKING_FAILED' };
    }
    if (statusChecks >= constants.maxStatusCheckRetries) {
      await this.database('supplier_booking_attempts').where({ id: attempt.id }).update({ status: 'UNKNOWN', response_json: JSON.stringify({ ...status.rawSupplierPayload, statusChecks, notFoundChecks }) });
      await this.database.transaction(async (transaction) => {
        await transition(transaction, booking.id, 'MANUAL_REVIEW', 'SUPPLIER_STATUS_MAX_RETRIES', { statusChecks });
      });
      await this.notifications.send(booking.id, 'BOOKING_MANUAL_REVIEW', { statusChecks });
      return { status: 'MANUAL_REVIEW' };
    }
    await this.database('supplier_booking_attempts').where({ id: attempt.id }).update({ status: 'UNKNOWN', response_json: JSON.stringify({ ...status.rawSupplierPayload, statusChecks, notFoundChecks }) });
    await this.notifications.send(booking.id, 'BOOKING_PROCESSING', { supplierStatus: status.status });
    return { status: 'SUPPLIER_BOOKING_UNKNOWN' };
  }

  async reconcile(): Promise<{ processed: number }> {
    const cutoff = new Date(Date.now() - constants.reconciliationStaleMinutes * 60 * 1000);
    const bookings = await this.database.transaction(async (transaction) => {
      const result = await transaction('bookings')
        .whereIn('booking_status', ['PAYMENT_SUCCESS', 'SUPPLIER_BOOKING', 'SUPPLIER_BOOKING_UNKNOWN'])
        .where('updated_at', '<=', cutoff)
        .forUpdate()
        .skipLocked()
        .select('id', 'booking_reference', 'supplier_code', 'supplier_result_id', 'supplier_booking_ref', 'booking_status', 'payment_status');
      return result as BookingRow[];
    });
    for (const booking of bookings) await this.bookWithSupplier(booking.id);
    return { processed: bookings.length };
  }

  private async markConfirmed(bookingId: string, attemptId: string, supplierBookingRef: string, response: Record<string, unknown>): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction('supplier_booking_attempts').where({ id: attemptId }).update({ status: 'SUCCESS', response_json: JSON.stringify(response), finished_at: new Date() });
      await transaction('bookings').where({ id: bookingId }).update({ supplier_booking_ref: supplierBookingRef, ticketing_status: 'TICKETED', updated_at: new Date() });
      const booking = await transaction<BookingRow>('bookings').where({ id: bookingId }).forUpdate().first();
      if (booking?.booking_status === 'SUPPLIER_BOOKING' || booking?.booking_status === 'SUPPLIER_BOOKING_UNKNOWN') {
        await transition(transaction, bookingId, 'BOOKING_CONFIRMED', 'SUPPLIER_BOOKING_CONFIRMED', { supplierBookingRef });
      }
    });
    await this.notifications.send(bookingId, 'BOOKING_CONFIRMED', { supplierBookingRef });
  }

  private async markFailed(bookingId: string, attemptId: string, response: Record<string, unknown>, message?: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction('supplier_booking_attempts').where({ id: attemptId }).update({ status: 'FAILED', response_json: JSON.stringify({ response, message }), error_code: message, finished_at: new Date() });
      const booking = await transaction<BookingRow>('bookings').where({ id: bookingId }).forUpdate().first();
      if (booking?.booking_status === 'SUPPLIER_BOOKING' || booking?.booking_status === 'SUPPLIER_BOOKING_UNKNOWN') {
        await transition(transaction, bookingId, 'SUPPLIER_BOOKING_FAILED', 'SUPPLIER_BOOKING_FAILED', { message });
      }
    });
  }

  private async markUnknown(bookingId: string, attemptId: string, response: Record<string, unknown>): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction('supplier_booking_attempts').where({ id: attemptId }).update({ status: 'UNKNOWN', response_json: JSON.stringify(response) });
      const booking = await transaction<BookingRow>('bookings').where({ id: bookingId }).forUpdate().first();
      if (booking?.booking_status === 'SUPPLIER_BOOKING') await transition(transaction, bookingId, 'SUPPLIER_BOOKING_UNKNOWN', 'SUPPLIER_BOOKING_UNKNOWN', response);
    });
  }

  private async refund(bookingId: string, reason: 'SUPPLIER_FAILURE'): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const payment = await transaction<{ id: string; amount: string | number }>('payments').where('booking_id', bookingId).forUpdate().first();
      if (!payment) return;
      const key = `refund:${bookingId}:${reason}`;
      const existing = await transaction('refunds').where({ idempotency_key: key }).first();
      if (existing) return;
      await transaction('payments').where({ id: payment.id }).update({ status: 'REFUND_PENDING', updated_at: new Date() });
      await transaction('bookings').where({ id: bookingId }).update({ payment_status: 'REFUND_PENDING', updated_at: new Date() });
      await transaction('refunds').insert({ id: randomUUID(), booking_id: bookingId, payment_id: payment.id, reason, amount: payment.amount, status: 'REFUND_PENDING', idempotency_key: key, created_at: new Date(), updated_at: new Date() });
    });
    const payment = await this.database<{ id: string; amount: string | number }>('payments').where('booking_id', bookingId).first();
    if (!payment) return;
    const result = await this.paymentGateway.refund(payment.id, Math.round(Number(payment.amount) * 100), `refund:${bookingId}:${reason}`);
    await this.database.transaction(async (transaction) => {
      await transaction('refunds').where({ idempotency_key: `refund:${bookingId}:${reason}` }).update({ status: 'REFUNDED', gateway_refund_id: result.gatewayRefundId, updated_at: new Date() });
      await transaction('payments').where({ id: payment.id }).update({ status: 'REFUNDED', updated_at: new Date() });
      await transaction('bookings').where({ id: bookingId }).update({ payment_status: 'REFUNDED', updated_at: new Date() });
    });
    await this.notifications.send(bookingId, 'REFUND_INITIATED', { reason, status: 'REFUNDED' });
  }

  private readMetadata(value: Record<string, unknown> | string | null): { statusChecks: number; notFoundChecks: number } {
    const parsed = typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : value ?? {};
    return { statusChecks: Number(parsed.statusChecks ?? 0), notFoundChecks: Number(parsed.notFoundChecks ?? 0) };
  }
}
