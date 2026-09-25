import { describe, expect, it } from 'vitest';
import { flightSearchSchema } from '../src/modules/flights/schema.js';

describe('flight search validation', () => {
  it('rejects invalid IATA input', () => {
    const result = flightSearchSchema.safeParse({ origin: 'AMD', destination: 'AM', departureDate: '2026-10-15', adults: 1, cabinClass: 'ECONOMY' });
    expect(result.success).toBe(false);
  });

  it('rejects a past departure date', () => {
    const result = flightSearchSchema.safeParse({ origin: 'AMD', destination: 'DEL', departureDate: '2020-10-15', adults: 1, cabinClass: 'ECONOMY' });
    expect(result.success).toBe(false);
  });
});
