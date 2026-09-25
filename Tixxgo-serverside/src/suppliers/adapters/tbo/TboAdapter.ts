import type { SupplierAdapter } from '../../contracts/SupplierAdapter.js';
import type { InternalSearchRequest, SupplierBookingRequest, SupplierBookingResult, SupplierBookingStatus, SupplierCancelResult, CancellationQuote, SupplierFareQuote, SupplierOffer, SupplierOfferRef } from '../../contracts/supplierTypes.js';
import { TboMockClient } from './tboMockClient.js';
import { mapTboFare, mapTboSearch } from './tboMapper.js';

export class TboAdapter implements SupplierAdapter {
  readonly code = 'tbo';

  constructor(private readonly client: TboMockClient) {}

  async searchFlights(request: InternalSearchRequest): Promise<SupplierOffer[]> {
    return mapTboSearch(await this.client.search(request));
  }

  async revalidateFare(ref: SupplierOfferRef): Promise<SupplierFareQuote> {
    return mapTboFare(await this.client.revalidate(ref.supplierResultId));
  }

  async createBooking(request: SupplierBookingRequest): Promise<SupplierBookingResult> {
    const response = await this.client.createBooking(request);
    return {
      status: response.Response.Status,
      supplierBookingRef: response.Response.PNR,
      message: response.Response.Message,
      rawSupplierPayload: response as unknown as Record<string, unknown>
    };
  }

  async getBookingStatus(query: { clientReference?: string; supplierBookingRef?: string }): Promise<SupplierBookingStatus> {
    const response = await this.client.getBookingStatus(query);
    return {
      status: response.Response.Status,
      supplierBookingRef: response.Response.PNR,
      rawSupplierPayload: response as unknown as Record<string, unknown>
    };
  }

  async getCancellationQuote(supplierBookingRef: string): Promise<CancellationQuote> {
    const response = await this.client.getCancellationQuote(supplierBookingRef);
    return {
      quoteId: response.Response.QuoteId,
      airlineCharge: response.Response.AirlineCharge * 100,
      supplierRefund: response.Response.Refund * 100,
      currency: 'INR',
      rawSupplierPayload: response as unknown as Record<string, unknown>
    };
  }

  async cancelBooking(supplierBookingRef: string, quoteId: string): Promise<SupplierCancelResult> {
    const response = await this.client.cancelBooking(supplierBookingRef, quoteId);
    return {
      status: response.Response.Status,
      supplierCancelRef: response.Response.CancelRef,
      rawSupplierPayload: response as unknown as Record<string, unknown>
    };
  }
}
