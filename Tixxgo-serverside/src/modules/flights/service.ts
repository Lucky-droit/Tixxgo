import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { InternalFlightOffer } from '../../domain/models.js';
import type { InternalSearchRequest, SupplierOffer } from '../../suppliers/contracts/supplierTypes.js';
import type { SupplierGateway } from '../../suppliers/gateway/SupplierGateway.js';
import { PricingEngine } from '../pricing/PricingEngine.js';
import { OfferSelector, type SupplierStats } from '../offers-selection/offerSelector.js';

export interface FlightSearchResult {
  offers: InternalFlightOffer[];
  warnings: Array<{ supplierCode: string; code: string; message: string }>;
}

export class FlightService {
  constructor(
    private readonly gateway: SupplierGateway,
    private readonly database: Knex,
    private readonly pricingEngine = new PricingEngine(),
    private readonly offerSelector = new OfferSelector()
  ) {}

  async search(request: InternalSearchRequest): Promise<FlightSearchResult> {
    const searchId = randomUUID();
    const supplierResults = await this.gateway.search(request);
    const pricedOffers = supplierResults.offers.map((offer) => ({
      ...offer,
      price: this.pricingEngine.price(offer.supplierFare, { supplierCode: offer.supplierCode })
    }));
    const stats = await this.loadSupplierStats();
    const offers = this.offerSelector.select(pricedOffers, stats);

    if (offers.length > 0) {
      await this.database('flight_offers').insert(offers.map((offer) => ({
        id: offer.offerId,
        search_id: searchId,
        adult_count: request.adults,
        supplier_code: offer.supplierCode,
        supplier_result_id: offer.supplierResultId,
        internal_offer_json: JSON.stringify(this.toInternalOffer(offer)),
        raw_supplier_json: JSON.stringify(offer.rawSupplierPayload),
        fallback_offers: JSON.stringify(offer.fallbackOfferIds ?? []),
        expires_at: offer.expiresAt,
        created_at: new Date()
      })));
    }

    return {
      offers: offers.map((offer) => this.toInternalOffer(offer)),
      warnings: supplierResults.warnings
    };
  }

  private async loadSupplierStats(): Promise<SupplierStats[]> {
    const rows = await this.database('supplier_stats').select('supplier_code', 'booking_success_rate', 'avg_latency_ms', 'margin_percent', 'healthy');
    return rows.map((row: { supplier_code: string; booking_success_rate: string | number; avg_latency_ms: string | number; margin_percent: string | number; healthy: boolean }) => ({
      supplierCode: row.supplier_code,
      bookingSuccessRate: Number(row.booking_success_rate) > 1 ? Number(row.booking_success_rate) / 100 : Number(row.booking_success_rate),
      avgLatencyMs: Number(row.avg_latency_ms),
      marginPercent: Number(row.margin_percent),
      healthy: row.healthy
    }));
  }

  private toInternalOffer(offer: SupplierOffer): InternalFlightOffer {
    return {
      offerId: offer.offerId,
      segments: offer.segments,
      cabinClass: offer.cabinClass,
      fareFamily: offer.fareFamily,
      baggage: offer.baggage,
      refundable: offer.refundable,
      price: offer.price,
      expiresAt: offer.expiresAt
    };
  }

}
