import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '../api/apiClient';
import { useBookingFlow } from '../context/BookingFlowContext';

const money = (value?: number) => value === undefined ? '-' : `₹${value.toLocaleString('en-IN')}`;
export function RevalidatePage() {
  const navigate = useNavigate(); const { offerId, setQuoteId } = useBookingFlow(); const [result, setResult] = useState<Awaited<ReturnType<typeof apiClient.revalidate>>>(); const [error, setError] = useState('');
  useEffect(() => { if (offerId) apiClient.revalidate(offerId).then(setResult).catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Revalidation failed')); }, [offerId]);
  if (error) return <main className="page"><div className="state-card"><p className="eyebrow">REVALIDATION</p><h1>That fare moved.</h1><p>{error}</p><button onClick={() => navigate('/search')}>Back to search</button></div></main>;
  if (!result) return <main className="page centered"><div className="loader">Checking live fare...</div></main>;
  if (result.status === 'UNAVAILABLE') return <main className="page"><div className="state-card"><p className="eyebrow">NO LONGER AVAILABLE</p><h1>This flight has moved on.</h1><button onClick={() => navigate('/search')}>Search again</button></div></main>;
  const changed = result.status === 'PRICE_CHANGED';
  return <main className="page narrow"><p className="eyebrow">FARE CHECK</p><h1>{changed ? 'The fare changed.' : 'Your fare is live.'}</h1><div className="fare-card"><span>{changed ? 'Previous total' : 'Confirmed total'}<strong>{money(changed ? result.previousTotal : result.total)}</strong></span>{changed && <><span className="arrow">→</span><span>New total<strong>{money(result.newTotal)}</strong></span></>}</div>{changed ? <p className="notice">The supplier refreshed this fare. Accept the new total to continue.</p> : <p className="notice success">The fare is valid for the next step.</p>}<div className="actions">{changed && <button onClick={() => navigate('/results')}>Go back</button>}<button className="primary" onClick={async () => { if (changed && result.quoteId) await apiClient.acceptQuote(result.quoteId); if (result.quoteId) setQuoteId(result.quoteId); navigate('/traveller'); }}>{changed ? 'Accept and continue' : 'Continue'}</button></div></main>;
}
