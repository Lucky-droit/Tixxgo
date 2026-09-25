import { describe, expect, it } from 'vitest';
import { PricingEngine } from '../src/modules/pricing/PricingEngine.js';
import { PromotionRule, ServiceFeeRule } from '../src/modules/pricing/pricingRules.js';
import type { SupplierFare } from '../src/suppliers/contracts/supplierTypes.js';

const fare: SupplierFare = { baseFare: 520000, taxes: 95000, total: 615000, currency: 'INR' };

function price(serviceFeePaise: number, discountPaise: number, supplierFare = fare) {
  return new PricingEngine([new ServiceFeeRule(serviceFeePaise), new PromotionRule(discountPaise)]).price(supplierFare);
}

describe('PricingEngine', () => {
  it('prices 5200/950 with 299 fee and 200 discount as 6249', () => {
    expect(price(29900, 20000).customer.total).toBe(624900);
  });

  it('prices the revalidated 5400 fare as 6449', () => {
    const revalidated = { ...fare, baseFare: 540000, total: 635000 };
    expect(price(29900, 20000, revalidated).customer.total).toBe(644900);
  });

  it('supports zero discount', () => {
    expect(price(29900, 0).customer.total).toBe(644900);
  });

  it('never returns a negative customer total', () => {
    expect(price(0, 700000).customer.total).toBe(0);
  });
});
