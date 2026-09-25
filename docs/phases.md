# Tixxgo Assignment — Phased Implementation Plan

Stack: **Node.js + Express (TypeScript) + Supabase PostgreSQL** in `Tixxgo-serverside/`, **React (Vite + TypeScript)** in `Tixxgo-userside/`. No Docker — Supabase provides PostgreSQL.

Global rules, tech choices, folder structure and the status model live in **`AGENTS.md`** (Codex loads it automatically). This file only contains the phases.
How to use: give the AI **one phase at a time**. Do not skip phases — later phases depend on earlier ones.

---

## Phase 0 — Project Setup & Foundations

**Goal:** Running backend skeleton with DB, config, error handling and logging.

**Tasks**
1. In `Tixxgo-serverside/`: `npm init`, TypeScript (strict), `tsx`/`ts-node-dev` for dev, scripts: `dev`, `build`, `start`, `migrate`, `migrate:rollback`, `seed`, `test`. Add `.gitignore` (root) and `.env.example`.
2. Express + TypeScript app (`src/app.ts`, `src/server.ts`) with: request-id middleware, JSON body parsing, central error handler, `zod` validation middleware, `pino` logger.
3. Knex setup with `pg`, migration runner, seed runner. The Supabase PostgreSQL connection string comes from `.env` and is documented in the README.
4. Health-check endpoint `GET /health` that also pings the DB.
5. Standard error format: `{ "error": { "code": "PRICE_CHANGED", "message": "...", "details": {} } }`. Create typed `AppError` subclasses (`ValidationError`, `NotFoundError`, `ConflictError`, `SupplierError`, `InvalidStateTransitionError`).
6. `utils/money.ts`: helpers `toPaise(inr)`, `fromPaise(paise)`, `addMoney`, `subMoney`. All pricing math uses these.
7. Config file with constants: service fee ₹299, promo ₹200, offer TTL (15 min), supplier timeout (e.g. 8s), max status-check retries, Tixxgo cancellation fee.
8. Root `README.md` with local setup steps: create a Supabase project, copy `.env.example` → `.env`, set `DATABASE_URL`, `npm install`, `npm run migrate`, `npm run dev`.

**Acceptance criteria**
- `npm run dev` starts the API; `GET /health` returns 200 with DB connectivity.
- A thrown `AppError` returns the standard error JSON.

---

## Phase 1 — Database Schema & Domain Models

**Goal:** All tables and internal (supplier-independent) types defined up front.

**Tables (Knex migrations)**

| Table | Purpose / key columns |
|---|---|
| `flight_offers` | Server-side store of search results. `id` (UUID = Tixxgo `offerId`), `search_id`, `supplier_code`, `supplier_result_id`, `internal_offer_json`, `raw_supplier_json`, `expires_at`, `created_at`. Index on `expires_at`. |
| `fare_quotes` | Result of revalidation. `id`, `offer_id`, `previous_total`, `revalidated_total`, `supplier_cost_json`, `pricing_json`, `status` (`VALID`/`PRICE_CHANGED`/`UNAVAILABLE`), `accepted_at`, `expires_at`. |
| `bookings` | `id`, `booking_reference` (unique, `TXG-######`), `quote_id`, `offer_id`, `supplier_code`, `supplier_result_id`, `supplier_booking_ref` (PNR, nullable), `flight_snapshot_json`, `contact_email`, `contact_phone`, `supplier_cost_total`, `tixxgo_service_fee`, `tixxgo_discount`, `customer_total`, `currency`, `payment_status`, `booking_status`, `ticketing_status`, `created_at`, `updated_at`. |
| `travellers` | `id`, `booking_id`, `type`, `title`, `first_name`, `last_name`, `dob`, `gender`, `passport_no` (nullable). |
| `payments` | `id`, `booking_id`, `gateway_txn_id`, `amount`, `status`, `idempotency_key`, `raw_gateway_json`, timestamps. Unique on `(booking_id, idempotency_key)`. |
| `supplier_booking_attempts` | **Key table for duplicate prevention.** `id`, `booking_id`, `attempt_no`, `client_reference` (Tixxgo ref sent to supplier), `status` (`IN_FLIGHT/SUCCESS/FAILED/UNKNOWN`), `request_json`, `response_json`, `error_code`, `started_at`, `finished_at`. Unique on `(booking_id, attempt_no)`. |
| `booking_events` | Audit log: `id`, `booking_id`, `from_status`, `to_status`, `event_type`, `payload_json`, `created_at`. |
| `cancellations` | `id`, `booking_id`, `status` (`QUOTED/CANCELLATION_REQUESTED/CANCELLED/REJECTED`), `airline_charge`, `tixxgo_fee`, `estimated_refund`, `quote_json`, `supplier_cancel_ref`, timestamps. |
| `refunds` | `id`, `booking_id`, `payment_id`, `reason` (`SUPPLIER_FAILURE/CUSTOMER_CANCELLATION`), `amount`, `status` (`REFUND_PENDING/REFUNDED/FAILED`), `gateway_refund_id`, `idempotency_key` (unique), timestamps. |
| `idempotency_keys` | `key`, `endpoint`, `request_hash`, `response_status`, `response_body`, `locked_at`, `created_at`. Unique on `(key, endpoint)`. |
| `notifications` | `id`, `booking_id`, `channel` (`EMAIL/SMS` — mocked), `template`, `payload_json`, `status`, `created_at`. |
| `supplier_stats` | (used in Phase 10) `supplier_code`, `booking_success_rate`, `avg_latency_ms`, `margin_percent`, `healthy`. |

**Domain (TypeScript) — internal flight model**
```ts
InternalFlightOffer {
  offerId: string;               // Tixxgo id, NOT supplier id
  segments: [{ airlineCode, airlineName?, flightNumber, origin, destination, departureAt, arrivalAt, durationMinutes }];
  cabinClass: 'ECONOMY'|'PREMIUM_ECONOMY'|'BUSINESS'|'FIRST';
  fareFamily?: string;
  baggage: { checkedKg: number | null; cabinKg?: number | null };
  refundable: boolean;
  price: PriceBreakdown;         // customer-facing, from PricingEngine
  expiresAt: string;
}
PriceBreakdown {
  supplier: { baseFare, taxes, total };
  tixxgo:   { serviceFee, discount };
  customer: { total, currency: 'INR' };
}
```
`supplierCode` and `supplierResultId` live on the **server-side** stored offer only, never in the API response.

**Acceptance criteria**
- `npm run migrate` builds all tables cleanly from scratch; rollback works.
- Types compile and are used across modules.

---

## Phase 2 — Supplier Gateway & Adapter Architecture (Task 8) + Mock Supplier

**Goal:** The plug-in architecture. Built **before** search so everything else depends on the gateway, not on TBO.

**Tasks**
1. Define `SupplierAdapter` interface in `suppliers/contracts/`:
   ```ts
   interface SupplierAdapter {
     readonly code: string;
     searchFlights(req: InternalSearchRequest): Promise<SupplierOffer[]>;      // already mapped to internal shape
     revalidateFare(ref: SupplierOfferRef): Promise<SupplierFareQuote>;
     createBooking(req: SupplierBookingRequest): Promise<SupplierBookingResult>;
     getBookingStatus(query: { clientReference?: string; supplierBookingRef?: string }): Promise<SupplierBookingStatus>;
     getCancellationQuote(supplierBookingRef: string): Promise<CancellationQuote>;
     cancelBooking(supplierBookingRef: string, quoteId: string): Promise<SupplierCancelResult>;
   }
   ```
2. `SupplierRegistry`: registers adapters by code from config (enabled suppliers list).
3. `SupplierGateway`: the **only** entry point the rest of the app uses. Responsibilities: pick adapter(s), fan-out search to all enabled adapters (`Promise.allSettled`, per-supplier timeout), apply per-call timeout, normalise errors into `SupplierError` types (`TIMEOUT`, `UNAVAILABLE`, `REJECTED`, `PRICE_CHANGED`), log every supplier call (request/response/duration).
4. `TboAdapter` + `tboMapper.ts`: maps TBO-shaped mock JSON → internal model (and back for booking requests). All TBO field names stay inside this folder.
5. Mock supplier (`mock/`): in-process service (or tiny separate Express server) returning TBO-shaped JSON for AMD→DEL on 2026-10-15 (2–4 flights, including the sample `TBO001 / AI482 / 5200 + 950`). Add a **scenario controller**, settable via env or `POST /api/dev/mock-supplier/scenario`:
   - `NORMAL`, `PRICE_CHANGE` (revalidate returns base fare 5400 → total 6449), `BOOKING_TIMEOUT` (createBooking hangs but the booking IS created on the supplier side), `BOOKING_TIMEOUT_NOT_CREATED`, `BOOKING_FAIL`, `STATUS_CHECK_CONFIRMED`, `STATUS_CHECK_NOT_FOUND`, `CANCEL_OK`.
   - The mock must be **stateful**: it remembers created bookings by `clientReference`, so status-check works and duplicate creation with the same clientReference returns the existing PNR (or an error), like a real supplier.
6. `TripJackAdapter` stub implementing the same interface (throws `NotImplemented`) + a README note showing exactly what is needed to add it: implement adapter + mapper, register in registry, config flag. **Zero changes** in flights/bookings/payments modules.

**Acceptance criteria**
- Removing/adding an adapter in the registry doesn't change any module outside `suppliers/`.
- Unit test: TBO mapper maps the sample JSON to the internal model correctly.

---

## Phase 3 — Flight Search & Normalisation (Task 1)

**Goal:** `POST /api/flights/search` returns internal, supplier-independent offers with final prices.

**Request**
```json
{ "origin": "AMD", "destination": "DEL", "departureDate": "2026-10-15", "adults": 1, "cabinClass": "ECONOMY" }
```

**Tasks**
1. `zod` schema: IATA codes (3 letters, origin ≠ destination), date not in the past, `adults` 1–9, `cabinClass` enum.
2. `flights/service.ts`: call `SupplierGateway.search()` → for each supplier offer, run `PricingEngine` (Phase 4 — stub it with a pass-through first if needed) → save to `flight_offers` with `expires_at` → return DTOs.
3. **Response DTO** contains only: `offerId`, segments, times, airline/flight number, baggage, refundable, cabin, `price` (customer total + breakdown lines shown to the customer), `expiresAt`. **No** `supplier`, `supplierResultId`, raw fares, or margins.
4. If one supplier fails/times out, return the others' results plus a `warnings` field (partial results).
5. (Prepares Task 9) Results pass through `offerSelector` (Phase 10) — for now identity.

**Acceptance criteria**
- Sample search returns normalised offers; grep of the JSON response finds no "TBO" / supplier ids.
- Invalid input → 400 with the standard error format.

---

## Phase 4 — Pricing Engine (Task 2)

**Goal:** Pure, testable pricing layer with supplier cost, Tixxgo adjustments, and customer price cleanly separated.

**Design**
```
supplierTotal  = baseFare + taxes                    // 5200 + 950 = 6150   (what Tixxgo pays supplier)
tixxgoServiceFee                                     // +299                 (Tixxgo revenue)
tixxgoDiscount                                       // -200                 (Tixxgo-funded promotion)
customerTotal  = supplierTotal + serviceFee - discount = 6249
tixxgoGrossRevenue = serviceFee - discount           // 99 (internal only)
```

**Tasks**
1. `PricingEngine.price(supplierFare, context) → PriceBreakdown`. Rules are pluggable: `ServiceFeeRule`, `PromotionRule` (config-driven; per-supplier markup rule hook for later).
2. All math in paise via `money.ts`; guarantee `customer.total = supplier.total + serviceFee − discount`, never below 0.
3. Persist the breakdown at three points: on the offer, on the fare quote, on the booking (snapshot — later config changes must not alter existing bookings).
4. Internal-only fields (`supplierTotal`, revenue) are stripped by the response mapper; customer sees base fare + taxes + service fee − promo = total.

**Acceptance criteria**
- Unit tests: 5200/950/299/200 → **6249**; revalidated 5400 → **6449**; zero-discount case; discount larger than fee case.

---

## Phase 5 — Fare Revalidation (Task 3)

**Goal:** `POST /api/flights/revalidate` — never assume the search fare is still valid.

**Request:** `{ "offerId": "<uuid>" }`

**Flow**
1. Load offer (404 if not found; `OFFER_EXPIRED` 410 if past `expires_at`).
2. `SupplierGateway.revalidateFare()` using the stored `supplierResultId`.
3. Re-run `PricingEngine` on the fresh supplier fare.
4. Compare with the original displayed total:
   - Same → `{ status: "VALID", quoteId, total }`
   - Different → `{ status: "PRICE_CHANGED", previousTotal: 6249, newTotal: 6449, difference: 200, quoteId, requiresAcceptance: true }`
   - Supplier says gone → `{ status: "UNAVAILABLE" }`
5. Accept endpoint: `POST /api/flights/quotes/:quoteId/accept` → sets `accepted_at`. **Booking creation (Phase 6) is rejected if the quote is `PRICE_CHANGED` and not accepted**, or if the quote has expired (short TTL, e.g. 10 min).

**Acceptance criteria**
- With mock scenario `PRICE_CHANGE`: 6249 → 6449, state `PRICE_CHANGED`, booking blocked until accepted.
- With `NORMAL`: status `VALID`.

---

## Phase 6 — Traveller & Booking Record (Task 4)

**Goal:** Create a booking in `PAYMENT_PENDING` with all required fields stored.

**Endpoint:** `POST /api/bookings` (header `Idempotency-Key` required)
```json
{ "quoteId": "...", "contact": { "email": "...", "phone": "..." },
  "travellers": [{ "type": "ADULT", "title": "MR", "firstName": "...", "lastName": "...", "dob": "1999-01-01", "gender": "M" }] }
```

**Tasks**
1. Validate traveller count matches the search's `adults`; names/DOB rules.
2. Verify quote is `VALID` or (`PRICE_CHANGED` and accepted) and not expired.
3. Generate `TXG-######` reference: random 6 digits with unique-constraint retry (or a DB sequence). Never derive from an incrementing PK that leaks volume.
4. In **one DB transaction**: insert `bookings` (with flight snapshot + price snapshot + supplier ids), `travellers`, first `booking_events` row, `payments` row (PENDING).
5. Idempotency middleware (built here, reused everywhere): same key + same body → return the original response; same key + different body → 409; concurrent duplicate → 409 `REQUEST_IN_PROGRESS`.
6. `GET /api/bookings/:idOrReference` returns the customer-safe booking view.

**Acceptance criteria**
- All fields listed in the assignment are stored (traveller, flight, supplier ref/result ID, TXG ref, supplier + customer price, payment/booking/ticketing status, timestamps).
- Repeating the same request with the same key creates exactly one booking.

---

## Phase 7 — Mock Payment & Booking State Machine (Task 5)

**Goal:** Payment flow + a strict state machine + the "paid but supplier failed" handling.

**Tasks**
1. `domain/bookingStateMachine.ts`: a table of allowed transitions; `transition(booking, toStatus, eventType, payload)` runs inside a transaction with `SELECT … FOR UPDATE`, rejects illegal moves with `InvalidStateTransitionError`, and inserts a `booking_events` row.
2. `MockPaymentGateway`: `createPayment(amount, idempotencyKey)`, `refund(paymentId, amount, idempotencyKey)`, and a simulated webhook. Scenarios: success, failure, delayed-success.
3. Endpoints:
   - `POST /api/bookings/:id/payment` → creates the gateway transaction, returns a mock payment URL/token.
   - `POST /api/payments/mock-gateway/callback` → acts as the gateway webhook (`SUCCESS` / `FAILED`). Must be idempotent (same `gateway_txn_id` processed once).
4. On `SUCCESS`: `PAYMENT_PENDING → PAYMENT_SUCCESS`, `payment_status = SUCCESS`, then trigger the supplier booking step (Phase 8). On `FAILED`: `PAYMENT_FAILED`, booking not sent to supplier.
5. **Design that must be implemented and explained — payment OK, supplier fails/uncertain:**
   - *Idempotency:* payment callback and supplier booking are keyed on `booking_id` / `client_reference`; repeated webhooks are no-ops.
   - *Safe retries:* supplier booking retried only when a status check proves no booking exists.
   - *Reconciliation:* background job (Phase 8) finds bookings stuck in `PAYMENT_SUCCESS`, `SUPPLIER_BOOKING`, or `SUPPLIER_BOOKING_UNKNOWN` and resolves them.
   - *Refund initiation:* on definitive supplier failure → `payment_status = REFUND_PENDING`, create `refunds` row with a unique idempotency key, call gateway refund, then `REFUNDED`.
   - *Customer notification:* `notificationService` writes `notifications` rows (booking confirmed / processing / failed + refund initiated).
   - *Duplicate-booking prevention:* see Phase 8.

**Acceptance criteria**
- Happy path reaches `BOOKING_CONFIRMED` with a PNR stored and `ticketing_status = TICKETED`.
- Illegal transitions are rejected (test: `BOOKING_CONFIRMED → PAYMENT_PENDING`).
- Payment failure never reaches the supplier.

---

## Phase 8 — Supplier Booking, Timeout / UNKNOWN State & Reconciliation (Task 6)

**Goal:** Timeouts never cause a false failure or a duplicate PNR.

**Supplier booking procedure (`bookingOrchestrator.bookWithSupplier(bookingId)`)**
1. Lock booking row; require status `PAYMENT_SUCCESS` (or `SUPPLIER_BOOKING_UNKNOWN` when called by reconciliation).
2. **Before any create call, check for an existing attempt:**
   - Attempt with `SUCCESS` → already booked, just sync state (idempotent).
   - Attempt `IN_FLIGHT`/`UNKNOWN` → do **not** create; run the status check instead.
3. Insert a `supplier_booking_attempts` row (`IN_FLIGHT`) **before** calling the supplier. `client_reference = booking_reference` is sent to the supplier as its unique customer reference. The unique `(booking_id, attempt_no)` key is the DB-level guard against two workers booking simultaneously.
4. Transition `PAYMENT_SUCCESS → SUPPLIER_BOOKING`. Call `gateway.createBooking()` with a timeout.
5. Outcomes:
   - **Success** → store PNR, attempt `SUCCESS`, `BOOKING_CONFIRMED`, ticketing status, send confirmation notification.
   - **Definitive rejection** (supplier explicitly says failed / sold out) → attempt `FAILED` → `SUPPLIER_BOOKING_FAILED` → start refund flow (Phase 7).
   - **Timeout / network error / 5xx / ambiguous** → attempt `UNKNOWN`, booking → `SUPPLIER_BOOKING_UNKNOWN`. **Do not refund, do not rebook.** Send "we're processing your booking" notification.
6. **Status resolution** (`resolveUnknownBooking`): call `getBookingStatus({ clientReference })`:
   - `CONFIRMED` (PNR found) → mark confirmed, store PNR. Never create again.
   - `NOT_FOUND` after a safe delay (e.g. ≥ N minutes and ≥ 2 consecutive not-found checks) → mark attempt `FAILED`; either safe-rebook once with the **same** client_reference, or go to refund. (Choose one and document it.)
   - `PENDING/UNKNOWN` → keep state, retry with exponential backoff.
   - Max retries exhausted → `MANUAL_REVIEW`, alert ops, keep payment held, notify customer.
7. `jobs/reconciliationJob.ts` (interval or `POST /api/admin/reconcile` for the demo): picks up stale `PAYMENT_SUCCESS`, `SUPPLIER_BOOKING`, `SUPPLIER_BOOKING_UNKNOWN` bookings older than X minutes and calls the same orchestrator. Uses `SELECT … FOR UPDATE SKIP LOCKED` so multiple instances don't double-process.

**Duplicate-PNR prevention summary (write this in the README)**
1. `client_reference` idempotency at supplier level.
2. Attempt row created *before* the call + unique constraint.
3. Row lock on booking.
4. Never call `createBooking` when an attempt is `IN_FLIGHT`/`UNKNOWN`/`SUCCESS` — status check first.
5. Idempotent payment webhook.

**Acceptance criteria (demo each with a mock scenario)**
- `BOOKING_TIMEOUT` (supplier created the booking): booking → `SUPPLIER_BOOKING_UNKNOWN` → reconcile → status check finds PNR → `BOOKING_CONFIRMED`; the supplier's created-bookings count is **1**.
- `BOOKING_TIMEOUT_NOT_CREATED`: unknown → status `NOT_FOUND` → safe resolution.
- `BOOKING_FAIL`: failure → refund initiated → `REFUNDED` + notification.
- Calling the orchestrator twice concurrently creates one supplier attempt.

---

## Phase 9 — Cancellation & Refund (Task 7)

**Goal:** Two-step cancellation: preview charges, then confirm.

**Endpoint:** `POST /api/bookings/:bookingId/cancel`
- Step 1 — `{ "confirm": false }` → returns preview only, no changes:
  ```json
  { "cancellationQuoteId": "...", "airlineCharge": 1500, "tixxgoCancellationFee": 250,
    "nonRefundableServiceFee": 299, "estimatedRefund": 4200, "currency": "INR", "expiresAt": "..." }
  ```
- Step 2 — `{ "confirm": true, "cancellationQuoteId": "..." }` → executes.

**Tasks**
1. Load booking; must be `BOOKING_CONFIRMED` (else 409). Refundable flag on fare drives whether charges apply.
2. `gateway.getCancellationQuote(pnr)` → airline/supplier charge. Tixxgo cancellation fee from config. Define the refund formula in code and document it, e.g. `estimatedRefund = customerTotal − airlineCharge − tixxgoCancellationFee − nonRefundable Tixxgo service fee` (floor at 0).
3. On confirm: idempotent; `BOOKING_CONFIRMED → CANCELLATION_REQUESTED` → `gateway.cancelBooking()` → `CANCELLED` → create refund (`REFUND_PENDING`) → gateway refund → `REFUNDED`. Track in `cancellations` + `refunds` + `booking_events`.
4. Handle cancel timeout the same way as booking timeout: stay in `CANCELLATION_REQUESTED`, reconcile via supplier status, never assume.
5. Quote must be re-fetched if expired or if the booking changed.

**Acceptance criteria**
- Preview returns supplier charge, Tixxgo fee, and estimated refund with no state change.
- Confirm walks `CANCELLATION_REQUESTED → CANCELLED → REFUND_PENDING → REFUNDED`, visible in `booking_events`.
- Double-clicking confirm results in a single cancellation and a single refund.

---

## Phase 10 — Multi-Supplier Duplicate Detection & Offer Selection (Task 9)

**Goal:** Design + a small working implementation with unit tests. (Mostly explanation for the interview.)

**Duplicate itinerary detection** — `itineraryFingerprint(offer)`:
- Built from: ordered segments `(carrier, flightNumber, origin, destination, departure time in UTC, arrival time in UTC)` + cabin class. Hash it (sha1). Same fingerprint = same physical itinerary.
- Normalise: marketing vs operating carrier (codeshare), airport/terminal codes, timezone.
- **Fare-product key** = fingerprint + fare family/brand + baggage + refundability + change rules. Only offers with the same fare-product key are directly comparable; different fare families are **shown as distinct options** (e.g. "Saver" vs "Flex"), never silently merged.

**Selection among comparable offers** — `offerSelector.select(group)`, weighted score (configurable):
```
score = w1 * normalisedSellingPrice        (lower better)
      + w2 * (1 - supplierBookingSuccessRate)
      + w3 * supplierLatency/reliability penalty
      - w4 * netMargin (commission + service fee)
      + w5 * fare-quality difference (baggage/refundable)
```
Rules before scoring: drop offers with worse baggage/refundability from the same-price bracket; drop suppliers currently unhealthy (circuit breaker / success rate below threshold).

**Worked example (AI101):** A = 8450, B = 8150. If fare product identical → show B (₹300 cheaper) as the primary offer, **unless** B's booking success rate or margin makes it worse in total expected value (e.g. success 90% vs 99% → expected cost of failures/refunds/support). Keep A as a stored **fallback offer**: if B's revalidate/booking fails, transparently retry with A (revalidate → show price change to customer if any). If baggage/refundability differ, show both as separate fare options.

**Tasks**
1. Implement `itineraryFingerprint` and `offerSelector` with a config-driven `supplier_stats` table (success rate, avg latency, margin %).
2. Store `fallback_offers` reference on the primary offer (server-side only).
3. Unit test with the AI101 example and a different-baggage example.

**Acceptance criteria**
- Test: A 8450 + B 8150 identical product → B selected, A kept as fallback.
- Test: B with different fare family → both shown.
- Test: B unhealthy (low success rate) → A selected.

---

## Phase 11 — Minimal React Customer Journey (Task 10)

**Goal:** Functional UI only — no polish. Lives in `Tixxgo-userside/` (Vite + React + TypeScript + React Router).

**Screens / routes**
1. `/search` — form prefilled AMD → DEL, 2026-10-15, 1 adult, Economy.
2. `/results` — list: airline + flight number, departure/arrival, baggage, refundable badge, final price. "Select" button.
3. `/revalidate` — calls revalidate on select; shows loader; on `PRICE_CHANGED` shows old vs new price with **Accept / Go back**.
4. `/traveller` — form (name, DOB, gender, contact email/phone) with validation.
5. `/payment` — creates booking, shows mock payment page: buttons "Pay (success)", "Pay (fail)".
6. `/confirmation` — shows `TXG-######`, status, and PNR if confirmed; if `SUPPLIER_BOOKING_UNKNOWN`, shows "Processing — we'll email you" and polls `GET /api/bookings/:ref`.

**Tasks**
- Function components + hooks; one `api/apiClient.ts` (fetch wrapper) and one `BookingFlowContext` holding journey state (offerId, quoteId, bookingId).
- `apiClient` handles the standard error format and auto-generates `Idempotency-Key` (`crypto.randomUUID()`) for POSTs that need it.
- Route guards as small wrapper components (e.g. cannot open `/traveller` without an accepted quote).
- Frontend uses only Tixxgo DTOs — nothing supplier-specific. Configure the API base URL via `VITE_API_URL`.

**Acceptance criteria**
- Full journey works end-to-end against the backend in `NORMAL` and `PRICE_CHANGE` scenarios.

---

## Phase 12 — Tests, Documentation & Interview Prep

**Tasks**
1. **Tests:** pricing (6249/6449), mapper, state machine transitions, idempotency middleware, timeout → unknown → resolved (no duplicate PNR), refund flow, offer selection.
2. **Local run experience:** README steps that work from a clean clone (create Supabase project, configure `.env`, migrate, seed, start backend, start frontend). Provide a Postman collection or curl list for every mock scenario.
3. **README must contain:**
   - Architecture diagram (Frontend → Services → Supplier Gateway → Adapters → Suppliers).
   - State diagrams (booking, payment, cancellation).
   - How to run each mock scenario.
   - **Assumptions** (currency INR only, single adult flow, no real payment, refund policy formula, TTLs).
   - **Incomplete areas** (hotels, multi-passenger types, real ticketing/SSR, seat/meal, real auth).
   - **Production changes:** Redis for offer cache + distributed locks, message queue (BullMQ/SQS) instead of a cron job for reconciliation, real payment gateway with signature-verified webhooks, secrets manager, rate limiting, observability (metrics/alerts on UNKNOWN bookings), PII encryption, circuit breakers per supplier, DB read replicas, outbox pattern for notifications, containerisation + CI/CD (not done in this submission).
4. Git: small commits per phase, meaningful messages.

**Be ready to explain (interview checklist)**
- Why the gateway/adapter split makes Supplier #2 a config + one-folder change.
- Why pricing is separate from supplier data and computed in paise.
- Why revalidate is a mandatory step and how quote/offer TTLs work.
- Why a timeout ≠ failure, and the five layers of duplicate-PNR protection.
- What happens on: payment OK + supplier fail; payment OK + supplier unknown; webhook delivered twice; user double-clicks confirm; server crashes mid-booking.
- How offers from two suppliers are deduplicated and ranked.

---

## Task → Phase Map

| Assignment task | Phase |
|---|---|
| 1 Flight search & normalisation | 2, 3 |
| 2 Pricing engine | 4 |
| 3 Fare revalidation | 5 |
| 4 Traveller & booking record | 6 |
| 5 Payment & booking state | 7 |
| 6 Timeout / unknown state | 8 |
| 7 Cancellation & refund | 9 |
| 8 Supplier gateway architecture | 2 |
| 9 Multi-supplier scenario | 10 |
| 10 React journey | 11 |

## Prompt Template for Each Codex Session

```
Read AGENTS.md and docs/PHASES.md.
Implement Phase <N> — <title> only. Propose a short plan first, then build.
Rules: TypeScript, no supplier data leaking outside suppliers/, all state changes via the state machine,
add the unit tests listed in the acceptance criteria, keep commits small.
When done: list files created/changed, how to run it, and how I can demo each acceptance criterion.
```