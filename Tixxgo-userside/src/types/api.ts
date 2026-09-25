export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';

export interface FlightOffer {
  offerId: string;
  segments: Array<{
    airlineCode: string;
    airlineName?: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureAt: string;
    arrivalAt: string;
    durationMinutes: number;
  }>;
  cabinClass: CabinClass;
  fareFamily?: string;
  baggage: { checkedKg: number | null; cabinKg?: number | null };
  refundable: boolean;
  price: {
    supplier: { baseFare: number; taxes: number; total: number };
    tixxgo: { serviceFee: number; discount: number };
    customer: { total: number; currency: 'INR' };
  };
  expiresAt: string;
}

export interface SearchResponse {
  offers: FlightOffer[];
  warnings: Array<{ supplierCode: string; code: string; message: string }>;
}

export interface RevalidationResponse {
  status: 'VALID' | 'PRICE_CHANGED' | 'UNAVAILABLE';
  quoteId?: string;
  total?: number;
  previousTotal?: number;
  newTotal?: number;
  difference?: number;
  requiresAcceptance?: boolean;
}

export interface BookingResponse {
  id: string;
  bookingReference: string;
  status: string;
}

export interface BookingView {
  id: string;
  bookingReference: string;
  bookingStatus: string;
  paymentStatus: string;
  ticketingStatus: string;
  supplierBookingRef?: string;
  contact: { email: string; phone: string };
}

export interface AppErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}
