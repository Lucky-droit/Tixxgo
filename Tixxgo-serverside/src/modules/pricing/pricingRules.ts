import type { SupplierFare } from '../../suppliers/contracts/supplierTypes.js';

export interface PricingContext {
  supplierCode?: string;
}

export interface PricingRule {
  readonly name: string;
  apply(fare: SupplierFare, context: PricingContext): number;
}

export class ServiceFeeRule implements PricingRule {
  readonly name = 'service-fee';

  constructor(private readonly serviceFeePaise: number) {}

  apply(_fare: SupplierFare, _context: PricingContext): number {
    return this.serviceFeePaise;
  }
}

export class PromotionRule implements PricingRule {
  readonly name = 'promotion';

  constructor(private readonly discountPaise: number) {}

  apply(_fare: SupplierFare, _context: PricingContext): number {
    return this.discountPaise;
  }
}
