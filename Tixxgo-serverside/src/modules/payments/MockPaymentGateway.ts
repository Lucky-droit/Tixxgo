import { randomUUID } from 'node:crypto';

export type PaymentScenario = 'SUCCESS' | 'FAILURE' | 'DELAYED_SUCCESS';

interface MockPayment {
  gatewayTxnId: string;
  amountPaise: number;
  idempotencyKey: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

export interface PaymentCreation {
  gatewayTxnId: string;
  paymentUrl: string;
  token: string;
  status: MockPayment['status'];
}

export class MockPaymentGateway {
  private scenario: PaymentScenario = 'SUCCESS';
  private readonly payments = new Map<string, MockPayment>();

  setScenario(scenario: PaymentScenario): void {
    this.scenario = scenario;
  }

  getScenario(): PaymentScenario {
    return this.scenario;
  }

  async createPayment(amountPaise: number, idempotencyKey: string): Promise<PaymentCreation> {
    const existing = [...this.payments.values()].find((payment) => payment.idempotencyKey === idempotencyKey);
    if (existing) return this.toCreation(existing);

    const payment: MockPayment = {
      gatewayTxnId: `MOCK-${randomUUID()}`,
      amountPaise,
      idempotencyKey,
      status: this.scenario === 'SUCCESS' ? 'SUCCESS' : this.scenario === 'FAILURE' ? 'FAILED' : 'PENDING'
    };
    this.payments.set(payment.gatewayTxnId, payment);
    return this.toCreation(payment);
  }

  async refund(paymentId: string, _amountPaise: number, _idempotencyKey: string): Promise<{ status: 'REFUNDED'; gatewayRefundId: string }> {
    return { status: 'REFUNDED', gatewayRefundId: `REFUND-${paymentId}` };
  }

  async getPayment(gatewayTxnId: string): Promise<PaymentCreation | undefined> {
    const payment = this.payments.get(gatewayTxnId);
    return payment ? this.toCreation(payment) : undefined;
  }

  async simulateWebhook(gatewayTxnId: string, status: 'SUCCESS' | 'FAILED'): Promise<void> {
    const payment = this.payments.get(gatewayTxnId);
    if (payment) payment.status = status;
  }

  private toCreation(payment: MockPayment): PaymentCreation {
    return {
      gatewayTxnId: payment.gatewayTxnId,
      paymentUrl: `https://mock-payment.local/pay/${payment.gatewayTxnId}`,
      token: payment.gatewayTxnId,
      status: payment.status
    };
  }
}
