import { describe, expect, it } from 'vitest';
import { OfferSelector } from '../src/modules/offers-selection/offerSelector.js';
import type { SupplierOffer } from '../src/suppliers/contracts/supplierTypes.js';

function offer(id: string, supplierCode: string, total: number, overrides: Partial<SupplierOffer> = {}): SupplierOffer {
  return {
    offerId: id,
    supplierCode,
    supplierResultId: `${supplierCode}-${id}`,
    segments: [{ airlineCode: 'AI', flightNumber: 'AI101', origin: 'AMD', destination: 'DEL', departureAt: '2026-10-15T06:00:00Z', arrivalAt: '2026-10-15T07:45:00Z', durationMinutes: 105 }],
    cabinClass: 'ECONOMY',
    fareFamily: 'Saver',
    baggage: { checkedKg: 15 },
    refundable: true,
    price: { supplier: { baseFare: total, taxes: 0, total }, tixxgo: { serviceFee: 0, discount: 0 }, customer: { total, currency: 'INR' } },
    expiresAt: '2026-10-15T00:00:00Z',
    supplierFare: { baseFare: total, taxes: 0, total, currency: 'INR' },
    rawSupplierPayload: {},
    ...overrides
  };
}

describe('OfferSelector', () => {
  const stats = [
    { supplierCode: 'a', bookingSuccessRate: 0.99, avgLatencyMs: 100, marginPercent: 5, healthy: true },
    { supplierCode: 'b', bookingSuccessRate: 0.99, avgLatencyMs: 100, marginPercent: 5, healthy: true }
  ];

  it('selects the cheaper identical product and keeps the other as fallback', () => {
    const selected = new OfferSelector().select([offer('A', 'a', 845000), offer('B', 'b', 815000)], stats);
    expect(selected).toHaveLength(1);
    expect(selected[0].offerId).toBe('B');
    expect(selected[0].fallbackOfferIds).toEqual(['A']);
  });

  it('keeps different fare families as separate offers', () => {
    const selected = new OfferSelector().select([offer('A', 'a', 845000), offer('B', 'b', 815000, { fareFamily: 'Flex' })], stats);
    expect(selected.map((item) => item.offerId).sort()).toEqual(['A', 'B']);
  });

  it('drops an unhealthy low-success supplier from comparison', () => {
    const selected = new OfferSelector().select([offer('A', 'a', 845000), offer('B', 'b', 815000)], [stats[0], { ...stats[1], bookingSuccessRate: 0.8, healthy: false }]);
    expect(selected[0].offerId).toBe('A');
  });
});
