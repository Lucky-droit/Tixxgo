import type { CabinClass, FlightSegment, InternalFlightOffer, Paise } from '../../domain/models.js';

export interface InternalSearchRequest {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
  cabinClass: CabinClass;
}

export interface SupplierOfferRef {
  supplierResultId: string;
}

export interface SupplierFare {
  baseFare: Paise;
  taxes: Paise;
  total: Paise;
  currency: 'INR';
}

export interface SupplierOffer extends InternalFlightOffer {
  supplierCode: string;
  supplierResultId: string;
  supplierFare: SupplierFare;
  rawSupplierPayload: Record<string, unknown>;
}

export interface SupplierFareQuote extends SupplierFare {
  supplierResultId: string;
  rawSupplierPayload: Record<string, unknown>;
}

export interface SupplierBookingTraveller {
  type: string;
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  passportNumber?: string;
}

export interface SupplierBookingRequest {
  supplierResultId: string;
  clientReference: string;
  contact: { email: string; phone: string };
  travellers: SupplierBookingTraveller[];
}

export interface SupplierBookingResult {
  status: 'CONFIRMED' | 'FAILED' | 'UNKNOWN';
  supplierBookingRef?: string;
  message?: string;
  rawSupplierPayload: Record<string, unknown>;
}

export interface SupplierBookingStatus {
  status: 'CONFIRMED' | 'NOT_FOUND' | 'PENDING' | 'UNKNOWN';
  supplierBookingRef?: string;
  rawSupplierPayload: Record<string, unknown>;
}

export interface CancellationQuote {
  quoteId: string;
  airlineCharge: Paise;
  supplierRefund: Paise;
  currency: 'INR';
  rawSupplierPayload: Record<string, unknown>;
}

export interface SupplierCancelResult {
  status: 'CANCELLED' | 'REJECTED' | 'UNKNOWN';
  supplierCancelRef?: string;
  rawSupplierPayload: Record<string, unknown>;
}

export type { FlightSegment };
