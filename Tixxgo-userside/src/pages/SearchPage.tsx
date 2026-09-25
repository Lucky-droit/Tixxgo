import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '../api/apiClient';
import { useBookingFlow } from '../context/BookingFlowContext';

export function SearchPage() {
  const navigate = useNavigate();
  const { setOffers } = useBookingFlow();
  const [form, setForm] = useState({ origin: 'AMD', destination: 'DEL', departureDate: '2026-10-15', adults: 1, cabinClass: 'ECONOMY' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try { const result = await apiClient.search({ ...form, adults: Number(form.adults) }); setOffers(result.offers); navigate('/results'); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'Search failed'); }
    finally { setLoading(false); }
  }

  return <main className="page search-page"><section className="masthead"><p className="eyebrow">TIXXGO / FLIGHT DESK</p><h1>Find the route ahead.</h1><p className="lede">Clear fares, quiet booking, and a human-readable trail from search to ticket.</p></section><form className="search-panel" onSubmit={submit}><label>From<input value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value.toUpperCase() })} maxLength={3} required /></label><label>To<input value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value.toUpperCase() })} maxLength={3} required /></label><label>Departure<input type="date" value={form.departureDate} onChange={(event) => setForm({ ...form, departureDate: event.target.value })} required /></label><label>Travellers<input type="number" min="1" max="9" value={form.adults} onChange={(event) => setForm({ ...form, adults: Number(event.target.value) })} required /></label><label>Cabin<select value={form.cabinClass} onChange={(event) => setForm({ ...form, cabinClass: event.target.value })}><option>ECONOMY</option><option>PREMIUM_ECONOMY</option><option>BUSINESS</option><option>FIRST</option></select></label><button className="primary" disabled={loading}>{loading ? 'Searching...' : 'Search flights'}</button>{error && <p className="error">{error}</p>}</form></main>;
}
