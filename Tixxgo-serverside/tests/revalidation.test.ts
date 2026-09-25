import { describe, expect, it, vi } from 'vitest';
import type { InternalFlightOffer } from '../src/domain/models.js';
import { FareRevalidationService } from '../src/modules/flights/revalidationService.js';
import type { SupplierGateway } from '../src/suppliers/gateway/SupplierGateway.js';

const storedOffer: InternalFlightOffer = {
  offerId: 'offer-1',
  segments: [],
  cabinClass: 'ECONOMY',
  baggage: { checkedKg: 15 },
  refundable: true,
  price: {
    supplier: { baseFare: 520000, taxes: 95000, total: 615000 },
    tixxgo: { serviceFee: 29900, discount: 20000 },
    customer: { total: 624900, currency: 'INR' }
  },
  expiresAt: '2099-10-15T00:00:00.000Z'
};

function createDatabase() {
  const quotes = new Map<string, Record<string, unknown>>();
  const database = vi.fn((table: string) => {
    if (table === 'flight_offers') {
      return { where: () => ({ first: async () => ({ id: 'offer-1', supplier_code: 'tbo', supplier_result_id: 'TBO001', internal_offer_json: storedOffer, expires_at: '2099-10-15T00:00:00.000Z' }) }) };
    }
    return {
      insert: async (row: Record<string, unknown>) => quotes.set(String(row.id), row),
      where: (filter: Record<string, string>) => ({
        first: async () => quotes.get(filter.id),
        update: async (values: Record<string, unknown>) => {
          const quote = quotes.get(filter.id);
          if (quote) Object.assign(quote, values);
        }
      })
    };
  });
  return { database: database as never, quotes };
}

describe('FareRevalidationService', () => {
  it('returns VALID when the supplier fare is unchanged', async () => {
    const { database } = createDatabase();
    const gateway = { revalidateFare: vi.fn().mockResolvedValue({ supplierResultId: 'TBO001', baseFare: 520000, taxes: 95000, total: 615000, currency: 'INR', rawSupplierPayload: {} }) } as unknown as SupplierGateway;
    const result = await new FareRevalidationService(database, gateway).revalidate('offer-1');

    expect(result).toMatchObject({ status: 'VALID', total: 6249 });
    expect(result.quoteId).toBeDefined();
  });

  it('returns PRICE_CHANGED from 6249 to 6449 and requires acceptance', async () => {
    const { database } = createDatabase();
    const gateway = { revalidateFare: vi.fn().mockResolvedValue({ supplierResultId: 'TBO001', baseFare: 540000, taxes: 95000, total: 635000, currency: 'INR', rawSupplierPayload: {} }) } as unknown as SupplierGateway;
    const result = await new FareRevalidationService(database, gateway).revalidate('offer-1');

    expect(result).toMatchObject({ status: 'PRICE_CHANGED', previousTotal: 6249, newTotal: 6449, difference: 200, requiresAcceptance: true });
    expect(result.quoteId).toBeDefined();
  });
});
