import { describe, expect, it } from 'vitest';
import { assertTransition, allowedTransitions } from '../src/domain/bookingStateMachine.js';

describe('booking state machine', () => {
  it('allows payment pending to succeed or fail', () => {
    expect(allowedTransitions('PAYMENT_PENDING')).toEqual(['PAYMENT_SUCCESS', 'PAYMENT_FAILED']);
    expect(() => assertTransition('PAYMENT_PENDING', 'PAYMENT_SUCCESS')).not.toThrow();
  });

  it('rejects BOOKING_CONFIRMED to PAYMENT_PENDING', () => {
    expect(() => assertTransition('BOOKING_CONFIRMED', 'PAYMENT_PENDING')).toThrowError(/Cannot transition/);
  });
});
