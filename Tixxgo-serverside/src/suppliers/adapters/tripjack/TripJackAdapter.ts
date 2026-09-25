import type { SupplierAdapter } from '../../contracts/SupplierAdapter.js';
import type { CancellationQuote, InternalSearchRequest, SupplierBookingRequest, SupplierBookingResult, SupplierBookingStatus, SupplierCancelResult, SupplierFareQuote, SupplierOffer, SupplierOfferRef } from '../../contracts/supplierTypes.js';

export class TripJackAdapter implements SupplierAdapter {
  readonly code = 'tripjack';

  searchFlights(_request: InternalSearchRequest): Promise<SupplierOffer[]> {
    return this.notImplemented();
  }

  revalidateFare(_ref: SupplierOfferRef): Promise<SupplierFareQuote> {
    return this.notImplemented();
  }

  createBooking(_request: SupplierBookingRequest): Promise<SupplierBookingResult> {
    return this.notImplemented();
  }

  getBookingStatus(_query: { clientReference?: string; supplierBookingRef?: string }): Promise<SupplierBookingStatus> {
    return this.notImplemented();
  }

  getCancellationQuote(_supplierBookingRef: string): Promise<CancellationQuote> {
    return this.notImplemented();
  }

  cancelBooking(_supplierBookingRef: string, _quoteId: string): Promise<SupplierCancelResult> {
    return this.notImplemented();
  }

  private notImplemented<T>(): Promise<T> {
    return Promise.reject(new Error('NotImplemented'));
  }
}
