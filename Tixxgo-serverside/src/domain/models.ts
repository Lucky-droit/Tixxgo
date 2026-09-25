export type Paise = number;
export type Currency = 'INR';

export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
export type FareQuoteStatus = 'VALID' | 'PRICE_CHANGED' | 'UNAVAILABLE';
export type BookingStatus =
  | 'INITIATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_SUCCESS'
  | 'SUPPLIER_BOOKING'
  | 'BOOKING_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'SUPPLIER_BOOKING_UNKNOWN'
  | 'SUPPLIER_BOOKING_FAILED'
  | 'MANUAL_REVIEW'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';
export type TicketingStatus = 'NOT_TICKETED' | 'TICKETING_PENDING' | 'TICKETED' | 'TICKETING_FAILED';

export interface FlightSegment {
  airlineCode: string;
  airlineName?: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
}

export interface BaggageAllowance {
  checkedKg: number | null;
  cabinKg?: number | null;
}

export interface PriceBreakdown {
  supplier: {
    baseFare: Paise;
    taxes: Paise;
    total: Paise;
  };
  tixxgo: {
    serviceFee: Paise;
    discount: Paise;
  };
  customer: {
    total: Paise;
    currency: Currency;
  };
}

export interface InternalFlightOffer {
  offerId: string;
  segments: FlightSegment[];
  cabinClass: CabinClass;
  fareFamily?: string;
  baggage: BaggageAllowance;
  refundable: boolean;
  price: PriceBreakdown;
  expiresAt: string;
}

export interface StoredFlightOffer extends InternalFlightOffer {
  searchId: string;
  supplierCode: string;
  supplierResultId: string;
  rawSupplierPayload: Record<string, unknown>;
}

export interface FareQuote {
  id: string;
  offerId: string;
  previousTotal: Paise;
  revalidatedTotal: Paise;
  supplierCost: Record<string, unknown>;
  pricing: PriceBreakdown;
  status: FareQuoteStatus;
  acceptedAt?: string;
  expiresAt: string;
}

export interface BookingPriceSnapshot {
  supplierCostTotal: Paise;
  tixxgoServiceFee: Paise;
  tixxgoDiscount: Paise;
  customerTotal: Paise;
  currency: Currency;
}

export interface Booking {
  id: string;
  bookingReference: string;
  quoteId: string;
  offerId: string;
  supplierCode: string;
  supplierResultId: string;
  supplierBookingRef?: string;
  flightSnapshot: InternalFlightOffer;
  contactEmail: string;
  contactPhone: string;
  price: BookingPriceSnapshot;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  ticketingStatus: TicketingStatus;
  createdAt: string;
  updatedAt: string;
}
