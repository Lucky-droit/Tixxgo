import { describe, expect, it, vi } from 'vitest';
import type { SupplierOffer } from '../src/suppliers/contracts/supplierTypes.js';
import type { SupplierGateway } from '../src/suppliers/gateway/SupplierGateway.js';
import { FlightService } from '../src/modules/flights/service.js';

const supplierOffer: SupplierOffer = {
  offerId: 'offer-1',
  supplierCode: 'tbo',
  supplierResultId: 'TBO001',
  segments: [{ airlineCode: 'AI', flightNumber: 'AI482', origin: 'AMD', destination: 'DEL', departureAt: '2026-10-15T06:00:00+05:30', arrivalAt: '2026-10-15T07:45:00+05:30', durationMinutes: 105 }],
  cabinClass: 'ECONOMY',
  baggage: { checkedKg: 15 },
  refundable: true,
  price: { supplier: { baseFare: 520000, taxes: 95000, total: 615000 }, tixxgo: { serviceFee: 0, discount: 0 }, customer: { total: 615000, currency: 'INR' } },
  expiresAt: '2026-10-15T00:00:00.000Z',
  supplierFare: { baseFare: 520000, taxes: 95000, total: 615000, currency: 'INR' },
  rawSupplierPayload: { supplierCode: 'tbo', secret: 'must-not-leak' }
};

describe('FlightService', () => {
  it('persists server-side supplier fields but returns a safe internal offer', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const database = vi.fn((table: string) => table === 'supplier_stats'
      ? { select: vi.fn().mockResolvedValue([]) }
      : { insert }) as never;
    const gateway = { search: vi.fn().mockResolvedValue({ offers: [supplierOffer], warnings: [] }) } as unknown as SupplierGateway;
    const service = new FlightService(gateway, database);

    const result = await service.search({ origin: 'AMD', destination: 'DEL', departureDate: '2026-10-15', adults: 1, cabinClass: 'ECONOMY' });

    expect(result.offers[0]).not.toHaveProperty('supplierResultId');
    expect(JSON.stringify(result)).not.toContain('TBO001');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(insert).toHaveBeenCalledOnce();
  });
});
