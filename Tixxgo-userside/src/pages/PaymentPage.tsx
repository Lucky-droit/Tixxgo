import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '../api/apiClient';
import { useBookingFlow } from '../context/BookingFlowContext';

export function PaymentPage() { const navigate = useNavigate(); const { bookingId } = useBookingFlow(); const [payment, setPayment] = useState<{ gatewayTxnId: string }>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function pay(status: 'SUCCESS' | 'FAILED') { if (!bookingId) return; setBusy(true); try { const current = payment ?? await apiClient.createPayment(bookingId); setPayment(current); await apiClient.callbackPayment(current.gatewayTxnId, status); navigate('/confirmation'); } catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Payment failed'); } finally { setBusy(false); } }
  return <main className="page narrow"><p className="eyebrow">SECURE CHECKOUT</p><h1>Ready when you are.</h1><div className="payment-card"><div className="mock-mark">TXG</div><p>Mock payment environment</p><div className="actions"><button className="primary" disabled={busy} onClick={() => pay('SUCCESS')}>{busy ? 'Processing...' : 'Pay successfully'}</button><button disabled={busy} onClick={() => pay('FAILED')}>Simulate failure</button></div>{error && <p className="error">{error}</p>}</div></main>; }
