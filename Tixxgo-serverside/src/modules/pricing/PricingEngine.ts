import { constants } from '../../config/constants.js';
import type { PriceBreakdown } from '../../domain/models.js';
import { addMoney, subMoney } from '../../utils/money.js';
import type { SupplierFare } from '../../suppliers/contracts/supplierTypes.js';
import { PromotionRule, ServiceFeeRule, type PricingContext, type PricingRule } from './pricingRules.js';

export class PricingEngine {
  constructor(
    private readonly rules: PricingRule[] = [
      new ServiceFeeRule(constants.serviceFeePaise),
      new PromotionRule(constants.promoDiscountPaise)
    ]
  ) {}

  price(fare: SupplierFare, context: PricingContext = {}): PriceBreakdown {
    const supplierTotal = addMoney(fare.baseFare, fare.taxes);
    const serviceFee = this.ruleValue('service-fee', fare, context);
    const discount = this.ruleValue('promotion', fare, context);
    const customerTotal = Math.max(0, subMoney(supplierTotal, discount) + serviceFee);

    return {
      supplier: {
        baseFare: fare.baseFare,
        taxes: fare.taxes,
        total: supplierTotal
      },
      tixxgo: {
        serviceFee,
        discount
      },
      customer: {
        total: customerTotal,
        currency: fare.currency
      }
    };
  }

  private ruleValue(name: string, fare: SupplierFare, context: PricingContext): number {
    return this.rules
      .filter((rule) => rule.name === name)
      .reduce((value, rule) => value + rule.apply(fare, context), 0);
  }
}
