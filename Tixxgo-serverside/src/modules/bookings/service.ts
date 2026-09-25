import { randomInt, randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { ConflictError, NotFoundError } from '../../domain/errors.js';
import type { Booking, InternalFlightOffer, PriceBreakdown } from '../../domain/models.js';
import { fromPaise } from '../../utils/money.js';
import type { CreateBookingRequest } from './schema.js';

interface QuoteRow {
  id: string;
  offer_id: string;
  status: 'VALID' | 'PRICE_CHANGED' | 'UNAVAILABLE';
  accepted_at: string | Date | null;
  expires_at: string | Date;
  supplier_code: string;
  supplier_result_id: string;
  internal_offer_json: InternalFlightOffer | string;
  pricing_json: PriceBreakdown | string;
  supplier_cost_json: Record<string, unknown> | string;
  adult_count: number;
}

interface StoredBookingRow {
  id: string;
  booking_reference: string;
  flight_snapshot_json: InternalFlightOffer | string;
  contact_email: string;
  contact_phone: string;
  supplier_cost_total: string | number;
  tixxgo_service_fee: string | number;
  tixxgo_discount: string | number;
  customer_total: string | number;
  currency: 'INR';
  payment_status: string;
  booking_status: string;
  ticketing_status: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export class BookingService {
  constructor(private readonly database: Knex) {}

  async create(request: CreateBookingRequest, idempotencyKey: string): Promise<{ id: string; bookingReference: string; status: string }> {
    return this.database.transaction(async (transaction) => {
      const quote = await transaction<QuoteRow>('fare_quotes')
        .join('flight_offers', 'flight_offers.id', 'fare_quotes.offer_id')
        .select('fare_quotes.*', 'flight_offers.supplier_code', 'flight_offers.supplier_result_id', 'flight_offers.internal_offer_json', 'flight_offers.adult_count')
        .where('fare_quotes.id', request.quoteId)
        .first();

      if (!quote) throw new NotFoundError('Fare quote not found');
      if (new Date(quote.expires_at).getTime() <= Date.now()) throw new ConflictError('Fare quote has expired');
      if (quote.status === 'UNAVAILABLE') throw new ConflictError('Unavailable fare cannot be booked');
      if (quote.status === 'PRICE_CHANGED' && !quote.accepted_at) throw new ConflictError('Price change must be accepted before booking');
      if (request.travellers.filter((traveller) => traveller.type === 'ADULT').length !== quote.adult_count) {
        throw new ConflictError('Traveller adult count does not match the search request');
      }

      const flightSnapshot = parseJson<InternalFlightOffer>(quote.internal_offer_json);
      const pricing = parseJson<PriceBreakdown>(quote.pricing_json);
      const supplierCost = parseJson<{ total: number }>(quote.supplier_cost_json);
      const bookingId = randomUUID();
      const paymentId = randomUUID();
      const bookingReference = await this.insertBookingWithReference(transaction, {
        id: bookingId,
        quote_id: quote.id,
        offer_id: quote.offer_id,
        supplier_code: quote.supplier_code,
        supplier_result_id: quote.supplier_result_id,
        flight_snapshot_json: JSON.stringify(flightSnapshot),
        contact_email: request.contact.email,
        contact_phone: request.contact.phone,
        supplier_cost_total: fromPaise(supplierCost.total),
        tixxgo_service_fee: fromPaise(pricing.tixxgo.serviceFee),
        tixxgo_discount: fromPaise(pricing.tixxgo.discount),
        customer_total: fromPaise(pricing.customer.total),
        currency: pricing.customer.currency,
        payment_status: 'PENDING',
        booking_status: 'PAYMENT_PENDING',
        ticketing_status: 'NOT_TICKETED',
        created_at: new Date(),
        updated_at: new Date()
      });

      await transaction('travellers').insert(request.travellers.map((traveller) => ({
        id: randomUUID(),
        booking_id: bookingId,
        type: traveller.type,
        title: traveller.title,
        first_name: traveller.firstName,
        last_name: traveller.lastName,
        dob: traveller.dob,
        gender: traveller.gender,
        passport_no: traveller.passportNo ?? null
      })));
      await transaction('booking_events').insert({ id: randomUUID(), booking_id: bookingId, from_status: null, to_status: 'PAYMENT_PENDING', event_type: 'BOOKING_CREATED', payload_json: JSON.stringify({ quoteId: quote.id }) });
      await transaction('payments').insert({ id: paymentId, booking_id: bookingId, amount: fromPaise(pricing.customer.total), status: 'PENDING', idempotency_key: idempotencyKey, raw_gateway_json: null, created_at: new Date(), updated_at: new Date() });

      return { id: bookingId, bookingReference, status: 'PAYMENT_PENDING' };
    });
  }

  async get(idOrReference: string): Promise<Record<string, unknown>> {
    const booking = await this.database<StoredBookingRow>('bookings').where((query) => query.where('bookings.id', idOrReference).orWhere('bookings.booking_reference', idOrReference)).first();
    if (!booking) throw new NotFoundError('Booking not found');
    const travellers = await this.database('travellers').select('type', 'title', 'first_name', 'last_name', 'dob', 'gender', 'passport_no').where({ booking_id: booking.id });
    return {
      id: booking.id,
      bookingReference: booking.booking_reference,
      contact: { email: booking.contact_email, phone: booking.contact_phone },
      flight: parseJson<InternalFlightOffer>(booking.flight_snapshot_json),
      price: {
        supplierCostTotal: booking.supplier_cost_total,
        tixxgoServiceFee: booking.tixxgo_service_fee,
        tixxgoDiscount: booking.tixxgo_discount,
        customerTotal: booking.customer_total,
        currency: booking.currency
      },
      paymentStatus: booking.payment_status,
      bookingStatus: booking.booking_status,
      ticketingStatus: booking.ticketing_status,
      travellers,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at
    };
  }

  private async insertBookingWithReference(transaction: Knex.Transaction, values: Record<string, unknown>): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = `TXG-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      try {
        await transaction.transaction(async (savepoint) => {
          await savepoint('bookings').insert({ ...values, booking_reference: reference });
        });
        return reference;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictError('Could not generate a unique booking reference');
  }
}

function parseJson<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}
