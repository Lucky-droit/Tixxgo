import { useEffect, useState } from 'react';
import { useBookingFlow } from '../context/BookingFlowContext';
import { apiClient } from '../api/apiClient';
import type { BookingView } from '../types/api';

export function ConfirmationPage() { const { bookingId, bookingReference } = useBookingFlow(); const [booking, setBooking] = useState<BookingView>();
  useEffect(() => { if (!bookingId) return; let active = true; const load = () => apiClient.getBooking(bookingId).then((result) => { if (active) setBooking(result); }).catch(() => undefined); load(); const timer = window.setInterval(() => { if (booking?.bookingStatus === 'SUPPLIER_BOOKING_UNKNOWN') load(); }, 3000); return () => { active = false; window.clearInterval(timer); }; }, [bookingId, booking?.bookingStatus]);
  const status = booking?.bookingStatus ?? 'PAYMENT_PENDING'; const processing = status === 'SUPPLIER_BOOKING_UNKNOWN' || status === 'SUPPLIER_BOOKING';
  return <main className="page centered"><div className={`confirmation ${processing ? 'processing' : ''}`}><span className="check">{processing ? '…' : '✓'}</span><p className="eyebrow">{processing ? 'PROCESSING' : 'BOOKING RECEIVED'}</p><h1>{processing ? 'Your booking is being confirmed.' : 'You are all set.'}</h1><p>{processing ? 'The supplier is taking a little longer. We will keep checking and email you when the PNR is ready.' : 'Your payment and reservation are on their way through the booking desk.'}</p><dl><div><dt>Reference</dt><dd>{booking?.bookingReference ?? bookingReference ?? '...'}</dd></div><div><dt>Status</dt><dd>{status.replaceAll('_', ' ')}</dd></div>{booking?.supplierBookingRef && <div><dt>PNR</dt><dd>{booking.supplierBookingRef}</dd></div>}</dl></div></main>; }
