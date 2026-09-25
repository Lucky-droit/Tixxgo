import { createHash } from 'node:crypto';
import type { InternalFlightOffer } from '../../domain/models.js';

export function itineraryFingerprint(offer: InternalFlightOffer): string {
  const canonical = [
    ...offer.segments.map((segment) => [
      segment.airlineCode.toUpperCase(),
      segment.flightNumber.toUpperCase(),
      segment.origin.toUpperCase(),
      segment.destination.toUpperCase(),
      new Date(segment.departureAt).toISOString(),
      new Date(segment.arrivalAt).toISOString()
    ]),
    offer.cabinClass
  ];
  return createHash('sha1').update(JSON.stringify(canonical)).digest('hex');
}

export function fareProductKey(offer: InternalFlightOffer): string {
  return [
    itineraryFingerprint(offer),
    offer.fareFamily ?? '',
    offer.baggage.checkedKg ?? '',
    offer.baggage.cabinKg ?? '',
    offer.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE'
  ].join('|');
}
