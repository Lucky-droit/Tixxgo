import { useNavigate } from 'react-router-dom';
import { useBookingFlow } from '../context/BookingFlowContext';
import type { FlightOffer } from '../types/api';

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function OfferCard({ offer }: { offer: FlightOffer }) {
  const navigate = useNavigate(); const { setOfferId } = useBookingFlow(); const segment = offer.segments[0];
  return <article className="offer-card"><div className="flight-line"><div><span className="airline">{segment.airlineCode}</span><strong>{segment.flightNumber}</strong></div><span className="route">{segment.origin} <i>→</i> {segment.destination}</span><div className="price"><small>from</small><strong>{money(offer.price.customer.total)}</strong></div></div><div className="offer-meta"><span>{time(segment.departureAt)} - {time(segment.arrivalAt)}</span><span>{segment.durationMinutes} min</span><span>{offer.baggage.checkedKg ?? 0} kg checked</span><span>{offer.refundable ? 'Refundable' : 'Non-refundable'}</span><button onClick={() => { setOfferId(offer.offerId); navigate('/revalidate'); }}>Select</button></div></article>;
}

export function ResultsPage() { const { offers } = useBookingFlow(); return <main className="page"><div className="section-heading"><div><p className="eyebrow">SEARCH RESULTS</p><h1>Choose your flight.</h1></div><span className="result-count">{offers.length} options</span></div><div className="offer-list">{offers.map((offer) => <OfferCard key={offer.offerId} offer={offer} />)}</div>{offers.length === 0 && <p className="empty">No offers loaded. Return to search.</p>}</main>; }
