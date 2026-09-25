import { Navigate, Route, Routes } from 'react-router-dom';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { PaymentPage } from './pages/PaymentPage';
import { RevalidatePage } from './pages/RevalidatePage';
import { ResultsPage } from './pages/ResultsPage';
import { SearchPage } from './pages/SearchPage';
import { TravellerPage } from './pages/TravellerPage';
import { useBookingFlow } from './context/BookingFlowContext';
import type { ReactNode } from 'react';

function QuoteGuard({ children }: { children: ReactNode }) {
  const { quoteId } = useBookingFlow();
  return quoteId ? children : <Navigate to="/search" replace />;
}

function BookingGuard({ children }: { children: ReactNode }) {
  const { bookingId } = useBookingFlow();
  return bookingId ? children : <Navigate to="/search" replace />;
}

export function AppRoutes() {
  return <Routes>
    <Route path="/search" element={<SearchPage />} />
    <Route path="/results" element={<ResultsPage />} />
    <Route path="/revalidate" element={<RevalidatePage />} />
    <Route path="/traveller" element={<QuoteGuard><TravellerPage /></QuoteGuard>} />
    <Route path="/payment" element={<BookingGuard><PaymentPage /></BookingGuard>} />
    <Route path="/confirmation" element={<BookingGuard><ConfirmationPage /></BookingGuard>} />
    <Route path="*" element={<Navigate to="/search" replace />} />
  </Routes>;
}
