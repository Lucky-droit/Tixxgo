import { z } from 'zod';

const cabinClasses = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] as const;

export const flightSearchSchema = z.object({
  origin: z.string().regex(/^[A-Za-z]{3}$/, 'Origin must be a 3-letter IATA code').transform((value) => value.toUpperCase()),
  destination: z.string().regex(/^[A-Za-z]{3}$/, 'Destination must be a 3-letter IATA code').transform((value) => value.toUpperCase()),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Departure date must use YYYY-MM-DD').refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && parsed >= new Date(new Date().toISOString().slice(0, 10));
  }, 'Departure date cannot be in the past'),
  adults: z.number().int().min(1).max(9),
  cabinClass: z.enum(cabinClasses)
}).refine((value) => value.origin !== value.destination, {
  path: ['destination'],
  message: 'Origin and destination must be different'
});

export type FlightSearchRequest = z.infer<typeof flightSearchSchema>;
