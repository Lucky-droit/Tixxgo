import type { CabinClass, PriceBreakdown } from '../../../domain/models.js';
import type { SupplierFareQuote, SupplierOffer } from '../../contracts/supplierTypes.js';
import type { TboFareResponse, TboFlightResult, TboSearchResponse } from './tboTypes.js';

const cabinClasses: Record<string, CabinClass> = {
  ECONOMY: 'ECONOMY',
  PREMIUM_ECONOMY: 'PREMIUM_ECONOMY',
  BUSINESS: 'BUSINESS',
  FIRST: 'FIRST'
};

function toPaise(amountInr: number): number {
  return Math.round(amountInr * 100);
}

function parseBaggage(value?: string): { checkedKg: number | null; cabinKg?: number | null } {
  const checkedKg = value ? Number(value.match(/\d+(?:\.\d+)?/)?.[0] ?? NaN) : NaN;
  return { checkedKg: Number.isFinite(checkedKg) ? checkedKg : null };
}

function toPrice(fare: TboFlightResult['Fare']): PriceBreakdown {
  const baseFare = toPaise(fare.BaseFare);
  const taxes = toPaise(fare.Tax);
  const total = toPaise(fare.TotalFare);
  return {
    supplier: { baseFare, taxes, total },
    tixxgo: { serviceFee: 0, discount: 0 },
    customer: { total, currency: 'INR' }
  };
}

export function mapTboFlight(result: TboFlightResult): SupplierOffer {
  const price = toPrice(result.Fare);
  return {
    offerId: crypto.randomUUID(),
    supplierCode: 'tbo',
    supplierResultId: result.ResultIndex,
    segments: [{
      airlineCode: result.Airline,
      airlineName: result.AirlineName,
      flightNumber: result.FlightNumber,
      origin: result.Origin,
      destination: result.Destination,
      departureAt: result.DepartureTime,
      arrivalAt: result.ArrivalTime,
      durationMinutes: result.Duration
    }],
    cabinClass: cabinClasses[result.CabinClass] ?? 'ECONOMY',
    fareFamily: result.FareFamily,
    baggage: parseBaggage(result.Baggage),
    refundable: result.IsRefundable,
    price,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    supplierFare: {
      baseFare: price.supplier.baseFare,
      taxes: price.supplier.taxes,
      total: price.supplier.total,
      currency: 'INR'
    },
    rawSupplierPayload: result as unknown as Record<string, unknown>
  };
}

export function mapTboSearch(response: TboSearchResponse): SupplierOffer[] {
  return response.Response.Results.flat().map(mapTboFlight);
}

export function mapTboFare(response: TboFareResponse): SupplierFareQuote {
  const baseFare = toPaise(response.Response.Fare.BaseFare);
  const taxes = toPaise(response.Response.Fare.Tax);
  return {
    supplierResultId: response.Response.ResultIndex,
    baseFare,
    taxes,
    total: toPaise(response.Response.Fare.TotalFare),
    currency: 'INR',
    rawSupplierPayload: response as unknown as Record<string, unknown>
  };
}
