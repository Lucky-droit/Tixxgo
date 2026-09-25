# Tixxgo Assignment — Global Context

**Product:** Tixxgo is an online flight/hotel platform. It owns its platform and integrates one supplier (TBO) via API today; a second supplier (TripJack) will be added in ~12 months without rewriting the customer-facing platform. No live TBO API is available, so all supplier calls go to a **mock supplier**.

## Repo layout
```
Tixxgo/                          ← repo root (git)
  AGENTS.md                      ← this file
  README.md                      ← assumptions, prod changes, how to run
  docs/
    PHASES.md                    ← phased implementation plan
    CODEFLOW.md                  ← living code-flow doc (see "Code flow doc" below)
  .agents/skills/                ← Codex skills
  Tixxgo-serverside/             ← backend: Node + Express + TypeScript (starts EMPTY, scaffold in Phase 0)
  Tixxgo-userside/               ← frontend: React + TypeScript (starts EMPTY, scaffold in Phase 11)
```
Both app folders start empty. Scaffold them from scratch; do not assume any existing code.

## Tech choices
- Backend (`Tixxgo-serverside/`): Node 20, Express, **TypeScript** (strict mode), `zod` (validation), `knex` + `pg` (queries + migrations), `pino` (logging), `vitest` or `jest` (tests). Dev run with `tsx`/`ts-node-dev`, build with `tsc`.
- DB: Supabase PostgreSQL. Cache: none required (Redis optional, skip).
- API: REST / JSON. **No Docker** — Supabase provides PostgreSQL; the connection string comes from `.env` (provide `.env.example`). Setup and run steps go in `README.md`.
- Frontend (`Tixxgo-userside/`): **React** (Vite + TypeScript, React Router, function components + hooks, one API client module). Plain CSS is fine. Visual polish is not required.

## Non-negotiable rules
1. **Never expose supplier responses to the frontend.** Supplier data is converted into the Tixxgo internal model. Raw supplier payloads are stored server-side only.
2. **Supplier cost, Tixxgo fees/discounts, and customer price are always separate fields.**
3. **Never trust the search fare at booking time** — always revalidate.
4. **A supplier timeout is NOT a failure.** It is an UNKNOWN state that must be resolved by checking supplier status.
5. **Every state-changing operation is idempotent** (idempotency key + DB constraints + row locks).
6. **Money is computed in integer paise** internally (avoid float errors) and stored as `DECIMAL(12,2)` INR.
7. **All state changes go through a state machine** and are written to an audit table (`booking_events`).
8. Only the supplier gateway knows supplier-specific things. Code outside `suppliers/` must never import an adapter directly.

## Target structure inside the two app folders
```
Tixxgo-serverside/
  package.json  tsconfig.json  .env.example
  src/
    app.ts  server.ts
    config/                 env, constants (fees, promo, timeouts)
    db/                     knex.ts, migrations/, seeds/
    domain/                 models (Flight, Money, Booking), state machines, errors
    suppliers/
      gateway/              SupplierGateway.ts, SupplierRegistry.ts
      contracts/            SupplierAdapter.ts (interface), supplier DTO types
      adapters/tbo/         TboAdapter.ts, tboMapper.ts, tboMockClient.ts
      adapters/tripjack/    TripJackAdapter.ts (stub only, shows extensibility)
      mock/                 mockSupplierServer.ts + scenario controller
    modules/
      flights/              routes, controller, service, offerStore
      pricing/              PricingEngine.ts, pricingRules.ts
      bookings/             routes, controller, service, repository
      payments/             MockPaymentGateway.ts, paymentService.ts
      cancellations/        cancellationService.ts
      notifications/        notificationService.ts (writes to DB / logs)
      offers-selection/     itineraryFingerprint.ts, offerSelector.ts (Task 9)
    jobs/                   reconciliationJob.ts
    middleware/             idempotency.ts, errorHandler.ts, validate.ts, requestId.ts
    utils/                  money.ts, ids.ts, time.ts
  tests/

Tixxgo-userside/
  package.json  tsconfig.json  vite.config.ts
  src/
    api/                    apiClient.ts (fetch wrapper, error format, Idempotency-Key)
    pages/                  SearchPage, ResultsPage, RevalidatePage, TravellerPage, PaymentPage, ConfirmationPage
    context/                BookingFlowContext.tsx (offerId, quoteId, bookingId)
    components/  types/
    routes.tsx
```

## Status model (three separate columns on `bookings`)
- `booking_status`: `INITIATED → PAYMENT_PENDING → PAYMENT_SUCCESS → SUPPLIER_BOOKING → BOOKING_CONFIRMED`
  - Failure branches: `PAYMENT_FAILED`, `SUPPLIER_BOOKING_UNKNOWN` (a.k.a. PROCESSING), `SUPPLIER_BOOKING_FAILED`, `MANUAL_REVIEW`
  - Cancellation branch: `CANCELLATION_REQUESTED → CANCELLED`
- `payment_status`: `PENDING | SUCCESS | FAILED | REFUND_PENDING | REFUNDED`
- `ticketing_status`: `NOT_TICKETED | TICKETING_PENDING | TICKETED | TICKETING_FAILED`

## Code flow doc
Before finishing any task that makes a MAJOR change, update `docs/CODEFLOW.md` using the `$update-codeflow` skill.
Major = new/changed endpoint, DB table or column, state or transition, supplier adapter contract, payment/refund/cancel flow, or a design decision.

## Working rules for the AI agent
- Work on **one phase at a time** (from `docs/PHASES.md`); do not build ahead of the requested phase.
- Run backend commands from `Tixxgo-serverside/` and frontend commands from `Tixxgo-userside/`.
- Keep commits small, one logical change each, message format `phase-N: <what>`.
- Add the unit tests listed in the phase's acceptance criteria; run them before finishing.
- When done, report: files created/changed, how to run, and how to demo each acceptance criterion.
- Do not add Dockerfiles or docker-compose. Document assumptions in `README.md` as you go. Do not silently change the rules above.