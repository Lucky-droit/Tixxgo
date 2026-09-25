import type {
  CancellationQuote,
  InternalSearchRequest,
  SupplierBookingRequest,
  SupplierBookingResult,
  SupplierBookingStatus,
  SupplierCancelResult,
  SupplierFareQuote,
  SupplierOffer,
  SupplierOfferRef
} from './supplierTypes.js';

export interface SupplierAdapter {
  readonly code: string;
  searchFlights(request: InternalSearchRequest): Promise<SupplierOffer[]>;
  revalidateFare(ref: SupplierOfferRef): Promise<SupplierFareQuote>;
  createBooking(request: SupplierBookingRequest): Promise<SupplierBookingResult>;
  getBookingStatus(query: { clientReference?: string; supplierBookingRef?: string }): Promise<SupplierBookingStatus>;
  getCancellationQuote(supplierBookingRef: string): Promise<CancellationQuote>;
  cancelBooking(supplierBookingRef: string, quoteId: string): Promise<SupplierCancelResult>;
}
