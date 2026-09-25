# Code Flow

## Phase 1: Storage and Domain Foundations

The Phase 1 migration creates the server-side persistence boundary for offers, fare revalidation, bookings, travellers, payments, supplier booking attempts, booking audit events, cancellations, refunds, idempotency records, notifications, and supplier statistics.

`flight_offers.internal_offer_json` stores the supplier-independent `InternalFlightOffer` model returned to future customer-facing modules. `flight_offers.raw_supplier_json` stores the original supplier payload on the server only. Supplier identifiers remain on the server-side offer record and are not part of the internal response model.

Price snapshots are stored separately for supplier cost, Tixxgo fee/discount, and customer total. Booking status, payment status, and ticketing status are separate columns so later state-machine transitions can audit each change through `booking_events`.

All Phase 1 tables use PostgreSQL types and constraints through Knex migrations. Foreign keys protect booking-related records, while idempotency and supplier-attempt uniqueness constraints provide database-level duplicate protection for later phases.

## Phase 2: Supplier Boundary

All supplier calls now flow through `SupplierGateway`, which resolves enabled adapters from `SupplierRegistry`, applies per-call timeouts, fans out search calls, normalizes supplier errors, and logs call duration. Adapter-specific request/response fields remain inside `src/suppliers/adapters/`.

The TBO adapter maps TBO-shaped mock payloads into the internal supplier offer and fare contracts. The stateful mock supplier supports scenario switching through `POST /api/dev/mock-supplier/scenario`; it tracks booking client references so timeout recovery can status-check without creating duplicate bookings. TripJack is a contract-compatible stub and does not affect non-supplier modules.

## Phase 3: Flight Search

`POST /api/flights/search` validates the customer request, delegates supplier fan-out to `SupplierGateway`, applies the current pass-through pricing stub, stores the internal offer and raw supplier payload server-side, and returns only the customer-safe `InternalFlightOffer` fields plus partial-result warnings. Supplier codes and result IDs are used for persistence but are stripped from the response.

## Phase 4: Pricing

`PricingEngine` calculates the supplier total, Tixxgo service fee, promotion discount, and customer total using integer paise. `ServiceFeeRule` and `PromotionRule` are pluggable rules; the current defaults are ₹299 and ₹200. Customer totals are floored at zero, and the resulting `PriceBreakdown` is persisted with the offer snapshot. Fare-quote and booking snapshots will reuse the same breakdown in their later phases.

## Phase 5: Fare Revalidation

`POST /api/flights/revalidate` loads the server-side offer, rejects expired offers, asks `SupplierGateway` for a fresh fare, reapplies `PricingEngine`, and stores a `fare_quotes` snapshot. It returns `VALID` when the customer total is unchanged, or `PRICE_CHANGED` with previous/new totals and an acceptance requirement when it differs. `POST /api/flights/quotes/:quoteId/accept` records `accepted_at` after quote expiry and availability checks; booking enforcement consumes this state in Phase 6.

## Phase 6: Traveller and Booking Record

`POST /api/bookings` validates traveller/contact data, locks the quote work inside one database transaction, requires a valid or accepted non-expired quote, generates a random `TXG-######` reference, and inserts the booking, travellers, initial `booking_events` row, and pending payment together. The request is protected by the reusable `Idempotency-Key` middleware: completed duplicates replay the stored response, different bodies conflict, and concurrent requests return `REQUEST_IN_PROGRESS`.

`GET /api/bookings/:idOrReference` maps database rows to a customer-safe view. Supplier codes, supplier result IDs, raw supplier payloads, and internal payment gateway data are kept server-side.

## Phase 7: Payment and Booking State Machine

`POST /api/bookings/:id/payment` creates or replays a mock payment transaction. `POST /api/payments/mock-gateway/callback` locks the payment and booking rows in one transaction, ignores already-terminal callbacks, updates both payment and booking payment status, and records the booking state transition in `booking_events`. Phase 7 stops at `PAYMENT_SUCCESS`; supplier booking is deliberately handed to the Phase 8 orchestrator. Payment failures transition to `PAYMENT_FAILED` and never call the supplier gateway.

## Phase 8: Supplier Booking and Reconciliation

The payment-success handoff calls `BookingOrchestrator.bookWithSupplier`. It locks the booking, creates a supplier attempt before `createBooking`, and sends the booking reference as the supplier client reference. Existing `SUCCESS`, `IN_FLIGHT`, and `UNKNOWN` attempts never create a second supplier booking. Supplier timeouts become `SUPPLIER_BOOKING_UNKNOWN` without refunding; reconciliation uses `getBookingStatus`, confirms an existing PNR, keeps pending results unknown, or treats two consecutive not-found checks as a definitive failure. Definitive failure creates an idempotent refund and notification; retry exhaustion moves the booking to `MANUAL_REVIEW` with payment held.

## Phase 9: Cancellation and Refund

Cancellation preview calls the supplier for a fresh quote and stores a time-limited `QUOTED` snapshot without changing booking state. Confirmation locks the booking and quote, transitions `BOOKING_CONFIRMED` to `CANCELLATION_REQUESTED`, calls the supplier, then transitions to `CANCELLED` and creates one idempotent customer-cancellation refund. The refund formula floors at zero after subtracting the airline charge, configured Tixxgo cancellation fee, and non-refundable service fee. Supplier timeout leaves the booking in `CANCELLATION_REQUESTED` for reconciliation.

## Phase 10: Offer Selection

Search offers are grouped by a SHA-1 itinerary fingerprint plus fare family, baggage, and refundability. `OfferSelector` uses `supplier_stats` to filter unhealthy/low-success suppliers and rank comparable offers by price, success penalty, latency, and margin. The winner retains fallback offer IDs in `flight_offers.fallback_offers`; the internal customer response remains supplier-independent.
