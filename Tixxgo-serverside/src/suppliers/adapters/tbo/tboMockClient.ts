import type { InternalSearchRequest, SupplierBookingRequest } from '../../contracts/supplierTypes.js';
import type { ScenarioController } from '../../mock/scenarioController.js';
import type { TboBookingResponse, TboFareResponse, TboSearchResponse, TboStatusResponse } from './tboTypes.js';

const sampleFlight = {
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
};

export class TboMockClient {
  private readonly bookings = new Map<string, string>();

  constructor(private readonly scenarios: ScenarioController) {}

  async search(_request: InternalSearchRequest): Promise<TboSearchResponse> {
    return { TraceId: crypto.randomUUID(), Response: { Results: [[sampleFlight, { ...sampleFlight, ResultIndex: 'TBO002', FlightNumber: 'AI491', Fare: { ...sampleFlight.Fare, BaseFare: 6100, TotalFare: 7050 } }]] } };
  }

  async revalidate(resultIndex: string): Promise<TboFareResponse> {
    const fare = this.scenarios.get() === 'PRICE_CHANGE'
      ? { BaseFare: 5400, Tax: 950, TotalFare: 6350, Currency: 'INR' }
      : sampleFlight.Fare;
    return { TraceId: crypto.randomUUID(), Response: { ResultIndex: resultIndex, Fare: fare } };
  }

  async createBooking(request: SupplierBookingRequest): Promise<TboBookingResponse> {
    const scenario = this.scenarios.get();
    if (scenario === 'BOOKING_FAIL') {
      return { TraceId: crypto.randomUUID(), Response: { Status: 'FAILED', Message: 'Seats are no longer available' } };
    }
    if (scenario === 'BOOKING_TIMEOUT_NOT_CREATED') {
      return new Promise(() => undefined);
    }

    const existing = this.bookings.get(request.clientReference);
    const pnr = existing ?? `PNR${String(this.bookings.size + 1).padStart(6, '0')}`;
    this.bookings.set(request.clientReference, pnr);
    if (scenario === 'BOOKING_TIMEOUT') {
      return new Promise(() => undefined);
    }
    return { TraceId: crypto.randomUUID(), Response: { Status: 'CONFIRMED', PNR: pnr } };
  }

  async getBookingStatus(query: { clientReference?: string; supplierBookingRef?: string }): Promise<TboStatusResponse> {
    const scenario = this.scenarios.get();
    if (scenario === 'STATUS_CHECK_NOT_FOUND') {
      return { TraceId: crypto.randomUUID(), Response: { Status: 'NOT_FOUND' } };
    }
    const pnr = query.supplierBookingRef ?? (query.clientReference ? this.bookings.get(query.clientReference) : undefined);
    if (scenario === 'STATUS_CHECK_CONFIRMED' || pnr) {
      return { TraceId: crypto.randomUUID(), Response: { Status: 'CONFIRMED', PNR: pnr ?? 'PNR000001' } };
    }
    return { TraceId: crypto.randomUUID(), Response: { Status: 'NOT_FOUND' } };
  }

  async getCancellationQuote(supplierBookingRef: string): Promise<{ TraceId: string; Response: { QuoteId: string; AirlineCharge: number; Refund: number } }> {
    return { TraceId: crypto.randomUUID(), Response: { QuoteId: `QUOTE-${supplierBookingRef}`, AirlineCharge: 500, Refund: 5650 } };
  }

  async cancelBooking(supplierBookingRef: string, quoteId: string): Promise<{ TraceId: string; Response: { Status: 'CANCELLED' | 'REJECTED'; CancelRef?: string } }> {
    if (this.scenarios.get() !== 'CANCEL_OK') {
      return { TraceId: crypto.randomUUID(), Response: { Status: 'REJECTED' } };
    }
    return { TraceId: crypto.randomUUID(), Response: { Status: 'CANCELLED', CancelRef: `CAN-${supplierBookingRef}-${quoteId}` } };
  }

  getCreatedBookingsCount(): number {
    return this.bookings.size;
  }
}
