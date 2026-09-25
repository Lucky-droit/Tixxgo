import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { AppError, ConflictError, NotFoundError, SupplierError } from '../../domain/errors.js';
import type { InternalFlightOffer, PriceBreakdown } from '../../domain/models.js';
import { fromPaise } from '../../utils/money.js';
import type { SupplierGateway } from '../../suppliers/gateway/SupplierGateway.js';
import { PricingEngine } from '../pricing/PricingEngine.js';

interface StoredOfferRow {
  id: string;
  supplier_code: string;
  supplier_result_id: string;
  internal_offer_json: InternalFlightOffer | string;
  expires_at: string | Date;
}

interface StoredQuoteRow {
  id: string;
  status: 'VALID' | 'PRICE_CHANGED' | 'UNAVAILABLE';
  accepted_at: string | Date | null;
  expires_at: string | Date;
}

export interface RevalidationResponse {
  status: 'VALID' | 'PRICE_CHANGED' | 'UNAVAILABLE';
  quoteId?: string;
  total?: number;
  previousTotal?: number;
  newTotal?: number;
  difference?: number;
  requiresAcceptance?: boolean;
}

export class FareRevalidationService {
  constructor(
    private readonly database: Knex,
    private readonly gateway: SupplierGateway,
    private readonly pricingEngine = new PricingEngine()
  ) {}

  async revalidate(offerId: string): Promise<RevalidationResponse> {
    const offer = await this.database<StoredOfferRow>('flight_offers').where({ id: offerId }).first();
    if (!offer) {
      throw new NotFoundError('Flight offer not found');
    }
    if (new Date(offer.expires_at).getTime() <= Date.now()) {
      throw new AppError('OFFER_EXPIRED', 'Flight offer has expired', 410);
    }

    let freshFare;
    try {
      freshFare = await this.gateway.revalidateFare(offer.supplier_code, { supplierResultId: offer.supplier_result_id });
    } catch (error) {
      if (error instanceof SupplierError && ['UNAVAILABLE', 'REJECTED', 'TIMEOUT'].includes(error.code)) {
        return { status: 'UNAVAILABLE' };
      }
      throw error;
    }

    const internalOffer = this.parseOffer(offer.internal_offer_json);
    const pricing = this.pricingEngine.price(freshFare, { supplierCode: offer.supplier_code });
    const previousTotalPaise = internalOffer.price.customer.total;
    const newTotalPaise = pricing.customer.total;
    const quoteId = randomUUID();
    const quoteExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const status = previousTotalPaise === newTotalPaise ? 'VALID' : 'PRICE_CHANGED';

    await this.database('fare_quotes').insert({
      id: quoteId,
      offer_id: offer.id,
      previous_total: fromPaise(previousTotalPaise),
      revalidated_total: fromPaise(newTotalPaise),
      supplier_cost_json: JSON.stringify(freshFare),
      pricing_json: JSON.stringify(pricing),
      status,
      expires_at: quoteExpiresAt
    });

    if (status === 'VALID') {
      return { status, quoteId, total: fromPaise(newTotalPaise) };
    }

    return {
      status,
      quoteId,
      previousTotal: fromPaise(previousTotalPaise),
      newTotal: fromPaise(newTotalPaise),
      difference: fromPaise(Math.abs(newTotalPaise - previousTotalPaise)),
      requiresAcceptance: true
    };
  }

  async accept(quoteId: string): Promise<{ quoteId: string; status: string; acceptedAt: string }> {
    const quote = await this.database<StoredQuoteRow>('fare_quotes').where({ id: quoteId }).first();
    if (!quote) {
      throw new NotFoundError('Fare quote not found');
    }
    if (new Date(quote.expires_at).getTime() <= Date.now()) {
      throw new AppError('QUOTE_EXPIRED', 'Fare quote has expired', 410);
    }
    if (quote.status === 'UNAVAILABLE') {
      throw new ConflictError('Unavailable fare cannot be accepted');
    }

    const acceptedAt = new Date();
    await this.database('fare_quotes').where({ id: quoteId }).update({ accepted_at: acceptedAt });
    return { quoteId, status: quote.status, acceptedAt: acceptedAt.toISOString() };
  }

  private parseOffer(value: InternalFlightOffer | string): InternalFlightOffer {
    if (typeof value === 'string') {
      return JSON.parse(value) as InternalFlightOffer;
    }
    return value;
  }
}
