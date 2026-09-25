import { describe, expect, it } from 'vitest';
import { mapTboSearch } from '../src/suppliers/adapters/tbo/tboMapper.js';
import type { TboSearchResponse } from '../src/suppliers/adapters/tbo/tboTypes.js';

describe('TBO mapper', () => {
  it('maps the sample TBO fare into the internal supplier offer shape', () => {
    const response: TboSearchResponse = {
      TraceId: 'trace-1',
      Response: {
        Results: [[{
          ResultIndex: 'TBO001',
          Airline: 'AI',
          AirlineName: 'Air India',
          FlightNumber: 'AI482',
          Origin: 'AMD',
          Destination: 'DEL',
          DepartureTime: '2026-10-15T06:00:00+05:30',
          ArrivalTime: '2026-10-15T07:45:00+05:30',
          Duration: 105,
          CabinClass: 'ECONOMY',
          FareFamily: 'Saver',
          Baggage: '15 KG',
          IsRefundable: true,
          Fare: { BaseFare: 5200, Tax: 950, TotalFare: 6150, Currency: 'INR' }
        }]]
      }
    };

    const [offer] = mapTboSearch(response);

    expect(offer.supplierResultId).toBe('TBO001');
    expect(offer.segments[0]).toMatchObject({ airlineCode: 'AI', flightNumber: 'AI482', origin: 'AMD', destination: 'DEL' });
    expect(offer.supplierFare).toEqual({ baseFare: 520000, taxes: 95000, total: 615000, currency: 'INR' });
    expect(offer.price.supplier).toEqual({ baseFare: 520000, taxes: 95000, total: 615000 });
    expect(offer.baggage.checkedKg).toBe(15);
    expect(offer.refundable).toBe(true);
  });
});
