import type { SupplierOffer } from '../../suppliers/contracts/supplierTypes.js';
import { fareProductKey } from './itineraryFingerprint.js';

export interface SupplierStats {
  supplierCode: string;
  bookingSuccessRate: number;
  avgLatencyMs: number;
  marginPercent: number;
  healthy: boolean;
}

export interface SelectedSupplierOffer extends SupplierOffer {
  fallbackOfferIds?: string[];
}

export interface OfferSelectorWeights {
  price: number;
  successPenalty: number;
  latencyPenalty: number;
  marginBenefit: number;
}

const defaultWeights: OfferSelectorWeights = {
  price: 1,
  successPenalty: 100_000,
  latencyPenalty: 10,
  marginBenefit: 1_000
};

export class OfferSelector {
  constructor(
    private readonly weights: OfferSelectorWeights = defaultWeights,
    private readonly minimumSuccessRate = 0.95
  ) {}

  select(offers: SupplierOffer[], stats: SupplierStats[] = []): SelectedSupplierOffer[] {
    const statsBySupplier = new Map(stats.map((stat) => [stat.supplierCode, stat]));
    const groups = new Map<string, SupplierOffer[]>();
    for (const offer of offers) {
      const key = this.productKey(offer);
      groups.set(key, [...(groups.get(key) ?? []), offer]);
    }

    const selected: SelectedSupplierOffer[] = [];
    for (const group of groups.values()) {
      const healthy = group.filter((offer) => {
        const stat = statsBySupplier.get(offer.supplierCode);
        return !stat || (stat.healthy && stat.bookingSuccessRate >= this.minimumSuccessRate);
      });
      const candidates = healthy.length > 0 ? healthy : group;
      const ranked = [...candidates].sort((left, right) => this.score(left, statsBySupplier) - this.score(right, statsBySupplier));
      const [primary, ...fallbacks] = ranked;
      selected.push({ ...primary, fallbackOfferIds: fallbacks.map((offer) => offer.offerId) });
    }
    return selected;
  }

  private score(offer: SupplierOffer, statsBySupplier: Map<string, SupplierStats>): number {
    const stat = statsBySupplier.get(offer.supplierCode);
    return this.weights.price * offer.price.customer.total
      + this.weights.successPenalty * (1 - (stat?.bookingSuccessRate ?? 1))
      + this.weights.latencyPenalty * (stat?.avgLatencyMs ?? 0)
      - this.weights.marginBenefit * (stat?.marginPercent ?? 0);
  }

  private productKey(offer: SupplierOffer): string {
    return fareProductKey(offer);
  }
}
