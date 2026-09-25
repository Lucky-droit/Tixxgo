import { createContext, useContext, useState, type ReactNode } from 'react';
import type { FlightOffer } from '../types/api';

interface BookingFlowState {
  offers: FlightOffer[];
  offerId?: string;
  quoteId?: string;
  bookingId?: string;
  bookingReference?: string;
}

interface BookingFlowValue extends BookingFlowState {
  setOffers: (offers: FlightOffer[]) => void;
  setOfferId: (offerId: string) => void;
  setQuoteId: (quoteId: string) => void;
  setBooking: (bookingId: string, bookingReference: string) => void;
}

const BookingFlowContext = createContext<BookingFlowValue | null>(null);

export function BookingFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookingFlowState>({ offers: [] });
  const value: BookingFlowValue = {
    ...state,
    setOffers: (offers) => setState((current) => ({ ...current, offers })),
    setOfferId: (offerId) => setState((current) => ({ ...current, offerId })),
    setQuoteId: (quoteId) => setState((current) => ({ ...current, quoteId })),
    setBooking: (bookingId, bookingReference) => setState((current) => ({ ...current, bookingId, bookingReference })),
  };
  return <BookingFlowContext.Provider value={value}>{children}</BookingFlowContext.Provider>;
}

export function useBookingFlow() {
  const value = useContext(BookingFlowContext);
  if (!value) throw new Error('useBookingFlow must be used inside BookingFlowProvider');
  return value;
}
