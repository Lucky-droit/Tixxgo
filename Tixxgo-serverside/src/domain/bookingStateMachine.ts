import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { InvalidStateTransitionError } from './errors.js';
import type { BookingStatus } from './models.js';

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  INITIATED: ['PAYMENT_PENDING'],
  PAYMENT_PENDING: ['PAYMENT_SUCCESS', 'PAYMENT_FAILED'],
  PAYMENT_SUCCESS: ['SUPPLIER_BOOKING'],
  SUPPLIER_BOOKING: ['BOOKING_CONFIRMED', 'SUPPLIER_BOOKING_UNKNOWN', 'SUPPLIER_BOOKING_FAILED'],
  BOOKING_CONFIRMED: ['CANCELLATION_REQUESTED'],
  PAYMENT_FAILED: [],
  SUPPLIER_BOOKING_UNKNOWN: ['BOOKING_CONFIRMED', 'SUPPLIER_BOOKING_FAILED', 'MANUAL_REVIEW'],
  SUPPLIER_BOOKING_FAILED: [],
  MANUAL_REVIEW: [],
  CANCELLATION_REQUESTED: ['CANCELLED'],
  CANCELLED: []
};

export function assertTransition(fromStatus: BookingStatus, toStatus: BookingStatus): void {
  if (!transitions[fromStatus].includes(toStatus)) {
    throw new InvalidStateTransitionError(`Cannot transition booking from ${fromStatus} to ${toStatus}`, { fromStatus, toStatus });
  }
}

export async function transition(
  transaction: Knex.Transaction,
  bookingId: string,
  toStatus: BookingStatus,
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const booking = await transaction('bookings').where({ id: bookingId }).forUpdate().first<{ booking_status: BookingStatus }>();
  if (!booking) {
    throw new InvalidStateTransitionError('Booking does not exist', { bookingId });
  }
  assertTransition(booking.booking_status, toStatus);
  await transaction('bookings').where({ id: bookingId }).update({ booking_status: toStatus, updated_at: new Date() });
  await transaction('booking_events').insert({
    id: randomUUID(),
    booking_id: bookingId,
    from_status: booking.booking_status,
    to_status: toStatus,
    event_type: eventType,
    payload_json: JSON.stringify(payload),
    created_at: new Date()
  });
}

export function allowedTransitions(fromStatus: BookingStatus): readonly BookingStatus[] {
  return transitions[fromStatus];
}
