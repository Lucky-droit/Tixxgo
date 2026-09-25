import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { constants } from '../../config/constants.js';
import { transition } from '../../domain/bookingStateMachine.js';
import { ConflictError, NotFoundError, SupplierError } from '../../domain/errors.js';
import { fromPaise, toPaise } from '../../utils/money.js';
import type { MockPaymentGateway } from '../payments/MockPaymentGateway.js';
import { NotificationService } from '../notifications/notificationService.js';
import type { SupplierGateway } from '../../suppliers/gateway/SupplierGateway.js';
import type { CancellationRequest } from './schema.js';

interface BookingRow {
  id: string;
  booking_reference: string;
  supplier_code: string;
  supplier_booking_ref: string | null;
  booking_status: string;
  customer_total: string | number;
  tixxgo_service_fee: string | number;
  currency: 'INR';
  flight_snapshot_json: Record<string, unknown> | string;
}

interface CancellationRow {
  id: string;
  booking_id: string;
  status: string;
  quote_json: Record<string, unknown> | string;
  airline_charge: string | number;
  tixxgo_fee: string | number;
  estimated_refund: string | number;
}

export class CancellationService {
  private readonly notifications: NotificationService;

  constructor(
    private readonly database: Knex,
    private readonly gateway: SupplierGateway,
    private readonly paymentGateway: MockPaymentGateway
  ) {
    this.notifications = new NotificationService(database);
  }

  async cancel(bookingId: string, request: CancellationRequest): Promise<Record<string, unknown>> {
    if (!request.confirm) return this.preview(bookingId);
    return this.confirm(bookingId, request.cancellationQuoteId);
  }

  async reconcile(): Promise<{ processed: number }> {
    const rows = await this.database('cancellations')
      .join('bookings', 'bookings.id', 'cancellations.booking_id')
      .where('cancellations.status', 'CANCELLATION_REQUESTED')
      .select('cancellations.id', 'cancellations.booking_id', 'bookings.supplier_code', 'bookings.supplier_booking_ref');
    for (const row of rows) {
      if (!row.supplier_booking_ref) continue;
      try {
        const status = await this.gateway.getBookingStatus(row.supplier_code, { supplierBookingRef: row.supplier_booking_ref });
        if (status.status === 'NOT_FOUND') {
          await this.finalizeCancellation(row.booking_id, row.id);
          continue;
        }
        if (status.status === 'CONFIRMED') {
          const result = await this.gateway.cancelBooking(row.supplier_code, row.supplier_booking_ref, row.id);
          if (result.status === 'CANCELLED') await this.finalizeCancellation(row.booking_id, row.id, result.supplierCancelRef);
        }
      } catch (error) {
        if (!(error instanceof SupplierError && error.code === 'TIMEOUT')) throw error;
      }
    }
    return { processed: rows.length };
  }

  async preview(bookingId: string): Promise<Record<string, unknown>> {
    const booking = await this.loadConfirmedBooking(bookingId);
    const flight = parseJson<{ refundable?: boolean }>(booking.flight_snapshot_json);
    if (flight.refundable === false) throw new ConflictError('Non-refundable booking cannot be cancelled');
    if (!booking.supplier_booking_ref) throw new ConflictError('Booking has no supplier booking reference');

    const supplierQuote = await this.gateway.getCancellationQuote(booking.supplier_code, booking.supplier_booking_ref);
    const customerTotalPaise = toPaise(booking.customer_total);
    const serviceFeePaise = toPaise(booking.tixxgo_service_fee);
    const tixxgoCancellationFeePaise = constants.cancellationFeePaise;
    const estimatedRefundPaise = Math.max(0, customerTotalPaise - supplierQuote.airlineCharge - tixxgoCancellationFeePaise - serviceFeePaise);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const quoteId = randomUUID();
    const quote = {
      cancellationQuoteId: quoteId,
      airlineCharge: fromPaise(supplierQuote.airlineCharge),
      tixxgoCancellationFee: fromPaise(tixxgoCancellationFeePaise),
      nonRefundableServiceFee: fromPaise(serviceFeePaise),
      estimatedRefund: fromPaise(estimatedRefundPaise),
      currency: booking.currency,
      expiresAt
    };

    await this.database('cancellations').insert({
      id: quoteId,
      booking_id: bookingId,
      status: 'QUOTED',
      airline_charge: quote.airlineCharge,
      tixxgo_fee: quote.tixxgoCancellationFee,
      estimated_refund: quote.estimatedRefund,
      quote_json: JSON.stringify({ ...quote, supplierQuote }),
      created_at: new Date(),
      updated_at: new Date()
    });
    return quote;
  }

  private async confirm(bookingId: string, cancellationQuoteId: string): Promise<Record<string, unknown>> {
    const prepared = await this.database.transaction(async (transaction) => {
      const booking = await transaction<BookingRow>('bookings').where({ id: bookingId }).forUpdate().first();
      if (!booking) throw new NotFoundError('Booking not found');
      const cancellation = await transaction<CancellationRow>('cancellations').where({ id: cancellationQuoteId, booking_id: bookingId }).forUpdate().first();
      if (!cancellation) throw new NotFoundError('Cancellation quote not found');
      if (cancellation.status === 'CANCELLED') return { action: 'DONE' as const, booking, cancellation };
      if (cancellation.status !== 'QUOTED') throw new ConflictError('Cancellation quote is no longer usable');
      if (new Date(this.quoteExpiry(cancellation.quote_json)).getTime() <= Date.now()) throw new ConflictError('Cancellation quote has expired; request a new preview');
      if (booking.booking_status !== 'BOOKING_CONFIRMED') throw new ConflictError('Only confirmed bookings can be cancelled');
      if (!booking.supplier_booking_ref) throw new ConflictError('Booking has no supplier booking reference');

      await transition(transaction, bookingId, 'CANCELLATION_REQUESTED', 'CANCELLATION_REQUESTED', { cancellationQuoteId });
      await transaction('cancellations').where({ id: cancellationQuoteId }).update({ status: 'CANCELLATION_REQUESTED', updated_at: new Date() });
      return { action: 'CANCEL' as const, booking, cancellation };
    });

    if (prepared.action === 'DONE') return this.customerCancellationResult(prepared.cancellation);

    try {
      const result = await this.gateway.cancelBooking(prepared.booking.supplier_code, prepared.booking.supplier_booking_ref as string, cancellationQuoteId);
      if (result.status !== 'CANCELLED') {
        await this.notifications.send(bookingId, 'CANCELLATION_PROCESSING', { reason: result.status });
        return { status: 'CANCELLATION_REQUESTED', cancellationQuoteId };
      }
      await this.finalizeCancellation(bookingId, cancellationQuoteId, result.supplierCancelRef);
      await this.refund(bookingId, cancellationQuoteId, Number(prepared.cancellation.estimated_refund));
      return this.customerCancellationResult(prepared.cancellation);
    } catch (error) {
      if (error instanceof SupplierError && error.code === 'TIMEOUT') {
        await this.notifications.send(bookingId, 'CANCELLATION_PROCESSING', { reason: 'TIMEOUT' });
        return { status: 'CANCELLATION_REQUESTED', cancellationQuoteId };
      }
      throw error;
    }
  }

  private async finalizeCancellation(bookingId: string, cancellationQuoteId: string, supplierCancelRef?: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction('cancellations').where({ id: cancellationQuoteId }).update({ status: 'CANCELLED', supplier_cancel_ref: supplierCancelRef, updated_at: new Date() });
      const booking = await transaction('bookings').where({ id: bookingId }).forUpdate().first<{ booking_status: string }>();
      if (booking?.booking_status === 'CANCELLATION_REQUESTED') {
        await transition(transaction, bookingId, 'CANCELLED', 'CANCELLED', { cancellationQuoteId, supplierCancelRef });
      }
    });
  }

  private async refund(bookingId: string, cancellationQuoteId: string, amountInr: number): Promise<void> {
    const payment = await this.database('payments').where({ booking_id: bookingId }).first<{ id: string }>();
    if (!payment) throw new NotFoundError('Payment record not found');
    const key = `refund:cancellation:${bookingId}`;
    await this.database.transaction(async (transaction) => {
      const existing = await transaction('refunds').where({ idempotency_key: key }).first();
      if (existing) return;
      await transaction('payments').where({ id: payment.id }).update({ status: 'REFUND_PENDING', updated_at: new Date() });
      await transaction('bookings').where({ id: bookingId }).update({ payment_status: 'REFUND_PENDING', updated_at: new Date() });
      await transaction('refunds').insert({ id: randomUUID(), booking_id: bookingId, payment_id: payment.id, reason: 'CUSTOMER_CANCELLATION', amount: amountInr, status: 'REFUND_PENDING', idempotency_key: key, created_at: new Date(), updated_at: new Date() });
    });
    const result = await this.paymentGateway.refund(payment.id, toPaise(amountInr), key);
    await this.database.transaction(async (transaction) => {
      await transaction('refunds').where({ idempotency_key: key }).update({ status: 'REFUNDED', gateway_refund_id: result.gatewayRefundId, updated_at: new Date() });
      await transaction('payments').where({ id: payment.id }).update({ status: 'REFUNDED', updated_at: new Date() });
      await transaction('bookings').where({ id: bookingId }).update({ payment_status: 'REFUNDED', updated_at: new Date() });
    });
    await this.notifications.send(bookingId, 'CANCELLATION_REFUNDED', { cancellationQuoteId, amount: amountInr });
  }

  private async loadConfirmedBooking(bookingId: string): Promise<BookingRow> {
    const booking = await this.database<BookingRow>('bookings').where({ id: bookingId }).first();
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.booking_status !== 'BOOKING_CONFIRMED') throw new ConflictError('Only confirmed bookings can be cancelled');
    return booking;
  }

  private quoteExpiry(value: Record<string, unknown> | string): string {
    const quote = typeof value === 'string' ? JSON.parse(value) as { expiresAt: string } : value as unknown as { expiresAt: string };
    return quote.expiresAt;
  }

  private customerCancellationResult(cancellation: CancellationRow): Record<string, unknown> {
    return {
      status: 'CANCELLED',
      cancellationQuoteId: cancellation.id,
      estimatedRefund: Number(cancellation.estimated_refund)
    };
  }
}

function parseJson<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}
