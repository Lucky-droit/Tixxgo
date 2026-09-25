import type { Knex } from 'knex';
import { NotFoundError } from '../../domain/errors.js';
import { transition } from '../../domain/bookingStateMachine.js';
import { fromPaise } from '../../utils/money.js';
import { MockPaymentGateway, type PaymentCreation } from './MockPaymentGateway.js';

interface PaymentRow {
  id: string;
  booking_id: string;
  gateway_txn_id: string | null;
  amount: string | number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

export class PaymentService {
  constructor(
    private readonly database: Knex,
    private readonly gateway: MockPaymentGateway,
    private readonly onPaymentSuccess?: (bookingId: string) => Promise<unknown>
  ) {}

  async createPayment(bookingId: string, idempotencyKey: string): Promise<PaymentCreation> {
    const payment = await this.database<PaymentRow>('payments').where({ booking_id: bookingId }).orderBy('created_at', 'desc').first();
    if (!payment) throw new NotFoundError('Payment record not found');
    if (payment.status !== 'PENDING' && payment.gateway_txn_id) {
      const existing = await this.gateway.getPayment(payment.gateway_txn_id);
      if (existing) return existing;
    }
    const creation = await this.gateway.createPayment(Math.round(Number(payment.amount) * 100), idempotencyKey);
    await this.database('payments').where({ id: payment.id }).update({ gateway_txn_id: creation.gatewayTxnId, raw_gateway_json: JSON.stringify(creation), updated_at: new Date() });
    return creation;
  }

  async processCallback(gatewayTxnId: string, status: 'SUCCESS' | 'FAILED'): Promise<{ bookingId: string; status: string }> {
    const result = await this.database.transaction(async (transaction) => {
      const payment = await transaction<PaymentRow>('payments').where({ gateway_txn_id: gatewayTxnId }).forUpdate().first();
      if (!payment) throw new NotFoundError('Payment transaction not found');
      const booking = await transaction<{ id: string; booking_status: 'PAYMENT_PENDING' | string }>('bookings').where({ id: payment.booking_id }).forUpdate().first();
      if (!booking) throw new NotFoundError('Booking not found');

      if (payment.status !== 'PENDING') {
        return { bookingId: payment.booking_id, status: payment.status };
      }

      const paymentStatus = status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
      const bookingStatus = status === 'SUCCESS' ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';
      await transaction('payments').where({ id: payment.id }).update({ status: paymentStatus, updated_at: new Date() });
      await transaction('bookings').where({ id: payment.booking_id }).update({ payment_status: paymentStatus, updated_at: new Date() });
      await transition(transaction, payment.booking_id, bookingStatus, `PAYMENT_${status}`, { gatewayTxnId });
      return { bookingId: payment.booking_id, status: bookingStatus };
    });
    if (result.status === 'PAYMENT_SUCCESS') {
      await this.onPaymentSuccess?.(result.bookingId);
    }
    return result;
  }

  async setScenario(scenario: 'SUCCESS' | 'FAILURE' | 'DELAYED_SUCCESS'): Promise<string> {
    this.gateway.setScenario(scenario);
    return this.gateway.getScenario();
  }
}
