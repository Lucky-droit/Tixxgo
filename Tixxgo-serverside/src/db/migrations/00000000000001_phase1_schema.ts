import type { Knex } from 'knex';

const bookingStatuses = [
  'INITIATED',
  'PAYMENT_PENDING',
  'PAYMENT_SUCCESS',
  'SUPPLIER_BOOKING',
  'BOOKING_CONFIRMED',
  'PAYMENT_FAILED',
  'SUPPLIER_BOOKING_UNKNOWN',
  'SUPPLIER_BOOKING_FAILED',
  'MANUAL_REVIEW',
  'CANCELLATION_REQUESTED',
  'CANCELLED'
];

const paymentStatuses = ['PENDING', 'SUCCESS', 'FAILED', 'REFUND_PENDING', 'REFUNDED'];
const ticketingStatuses = ['NOT_TICKETED', 'TICKETING_PENDING', 'TICKETED', 'TICKETING_FAILED'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('flight_offers', (table) => {
    table.uuid('id').primary();
    table.string('search_id', 100).notNullable();
    table.string('supplier_code', 50).notNullable();
    table.string('supplier_result_id', 255).notNullable();
    table.jsonb('internal_offer_json').notNullable();
    table.jsonb('raw_supplier_json').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['expires_at']);
    table.index(['search_id']);
  });

  await knex.schema.createTable('fare_quotes', (table) => {
    table.uuid('id').primary();
    table.uuid('offer_id').notNullable().references('id').inTable('flight_offers').onDelete('RESTRICT');
    table.decimal('previous_total', 12, 2).notNullable();
    table.decimal('revalidated_total', 12, 2).notNullable();
    table.jsonb('supplier_cost_json').notNullable();
    table.jsonb('pricing_json').notNullable();
    table.string('status', 20).notNullable();
    table.timestamp('accepted_at', { useTz: true });
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.index(['offer_id']);
    table.index(['expires_at']);
    table.unique(['id', 'status']);
  });

  await knex.schema.createTable('bookings', (table) => {
    table.uuid('id').primary();
    table.string('booking_reference', 10).notNullable().unique();
    table.uuid('quote_id').notNullable().references('id').inTable('fare_quotes').onDelete('RESTRICT');
    table.uuid('offer_id').notNullable().references('id').inTable('flight_offers').onDelete('RESTRICT');
    table.string('supplier_code', 50).notNullable();
    table.string('supplier_result_id', 255).notNullable();
    table.string('supplier_booking_ref', 255);
    table.jsonb('flight_snapshot_json').notNullable();
    table.string('contact_email', 320).notNullable();
    table.string('contact_phone', 32).notNullable();
    table.decimal('supplier_cost_total', 12, 2).notNullable();
    table.decimal('tixxgo_service_fee', 12, 2).notNullable();
    table.decimal('tixxgo_discount', 12, 2).notNullable();
    table.decimal('customer_total', 12, 2).notNullable();
    table.string('currency', 3).notNullable().defaultTo('INR');
    table.string('payment_status', 20).notNullable().defaultTo('PENDING');
    table.string('booking_status', 40).notNullable().defaultTo('INITIATED');
    table.string('ticketing_status', 30).notNullable().defaultTo('NOT_TICKETED');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['booking_status']);
    table.index(['payment_status']);
    table.index(['quote_id']);
  });

  await knex.schema.createTable('travellers', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    table.string('type', 20).notNullable();
    table.string('title', 10).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.date('dob').notNullable();
    table.string('gender', 10).notNullable();
    table.string('passport_no', 100);
    table.index(['booking_id']);
  });

  await knex.schema.createTable('payments', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    table.string('gateway_txn_id', 255);
    table.decimal('amount', 12, 2).notNullable();
    table.string('status', 30).notNullable().defaultTo('PENDING');
    table.string('idempotency_key', 255).notNullable();
    table.jsonb('raw_gateway_json');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['booking_id', 'idempotency_key']);
    table.index(['booking_id']);
  });

  await knex.schema.createTable('supplier_booking_attempts', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    table.integer('attempt_no').unsigned().notNullable();
    table.string('client_reference', 255).notNullable();
    table.string('status', 20).notNullable();
    table.jsonb('request_json').notNullable();
    table.jsonb('response_json');
    table.string('error_code', 100);
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('finished_at', { useTz: true });
    table.unique(['booking_id', 'attempt_no']);
    table.index(['client_reference']);
  });

  await knex.schema.createTable('booking_events', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    table.string('from_status', 40);
    table.string('to_status', 40).notNullable();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload_json');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['booking_id', 'created_at']);
  });

  await knex.schema.createTable('cancellations', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    table.string('status', 30).notNullable();
    table.decimal('airline_charge', 12, 2).notNullable();
    table.decimal('tixxgo_fee', 12, 2).notNullable();
    table.decimal('estimated_refund', 12, 2).notNullable();
    table.jsonb('quote_json').notNullable();
    table.string('supplier_cancel_ref', 255);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['booking_id']);
  });

  await knex.schema.createTable('refunds', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    table.uuid('payment_id').notNullable().references('id').inTable('payments').onDelete('RESTRICT');
    table.string('reason', 40).notNullable();
    table.decimal('amount', 12, 2).notNullable();
    table.string('status', 30).notNullable();
    table.string('gateway_refund_id', 255);
    table.string('idempotency_key', 255).notNullable().unique();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['booking_id']);
  });

  await knex.schema.createTable('idempotency_keys', (table) => {
    table.string('key', 255).notNullable();
    table.string('endpoint', 255).notNullable();
    table.string('request_hash', 128).notNullable();
    table.integer('response_status');
    table.jsonb('response_body');
    table.timestamp('locked_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.primary(['key', 'endpoint']);
  });

  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    table.string('channel', 10).notNullable();
    table.string('template', 100).notNullable();
    table.jsonb('payload_json').notNullable();
    table.string('status', 30).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['booking_id']);
  });

  await knex.schema.createTable('supplier_stats', (table) => {
    table.string('supplier_code', 50).primary();
    table.decimal('booking_success_rate', 5, 2).notNullable();
    table.decimal('avg_latency_ms', 12, 2).notNullable();
    table.decimal('margin_percent', 5, 2).notNullable();
    table.boolean('healthy').notNullable().defaultTo(true);
  });

  await knex.raw("ALTER TABLE fare_quotes ADD CONSTRAINT fare_quotes_status_check CHECK (status IN ('VALID', 'PRICE_CHANGED', 'UNAVAILABLE'))");
  await knex.raw(`ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status IN (${paymentStatuses.map((status) => `'${status}'`).join(', ')}))`);
  await knex.raw(`ALTER TABLE bookings ADD CONSTRAINT bookings_booking_status_check CHECK (booking_status IN (${bookingStatuses.map((status) => `'${status}'`).join(', ')}))`);
  await knex.raw(`ALTER TABLE bookings ADD CONSTRAINT bookings_ticketing_status_check CHECK (ticketing_status IN (${ticketingStatuses.map((status) => `'${status}'`).join(', ')}))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('supplier_stats');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('idempotency_keys');
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('cancellations');
  await knex.schema.dropTableIfExists('booking_events');
  await knex.schema.dropTableIfExists('supplier_booking_attempts');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('travellers');
  await knex.schema.dropTableIfExists('bookings');
  await knex.schema.dropTableIfExists('fare_quotes');
  await knex.schema.dropTableIfExists('flight_offers');
}
