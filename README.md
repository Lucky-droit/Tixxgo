# Tixxgo

Tixxgo is an online flight and hotel platform. Phase 0 provides the backend foundation.

> **For a complete flow understanding of the codebase, go through [flight_booking_system_architecture.docs](docs/FILE-FLOW.md).**

## Local backend setup

1. Create a Supabase project at [supabase.com](https://supabase.com) and copy its PostgreSQL connection details from **Project Settings > Database**.
2. Use the direct PostgreSQL connection string for local development. Keep the database password private.

3. Install dependencies and configure the backend:

   ```powershell
   cd Tixxgo-serverside
   npm install
   Copy-Item .env.example .env
   ```

   Update `DATABASE_URL` in `.env` with the Supabase PostgreSQL connection string. Keep `DATABASE_SSL=true` for Supabase.

4. Run migrations and start the API:

   ```powershell
   npm run migrate
   npm run dev
   ```

5. Check the API:

   ```powershell
   Invoke-RestMethod http://localhost:3000/health
   ```

6. Start the customer frontend in a second terminal:

   ```powershell
   cd Tixxgo-userside
   npm install
   npm run dev
   ```

   Open `http://localhost:5173/`. Vite proxies `/api` requests to the backend at `http://localhost:3000` during development.

The health response includes database connectivity. `GET /api/dev/error` is a development probe for the standard `AppError` response and is disabled outside development/test environments. The mock supplier scenario can be viewed with `GET /api/dev/mock-supplier/scenario` or changed with `POST /api/dev/mock-supplier/scenario` using `{ "scenario": "NORMAL" }`.

## Adding TripJack

TripJack is intentionally a stub in Phase 2. To add it, implement the `SupplierAdapter` methods and a TripJack mapper inside `src/suppliers/adapters/tripjack/`, register the adapter in `src/suppliers/runtime.ts`, and add `tripjack` to `ENABLED_SUPPLIERS`. No flights, bookings, or payments module should import the adapter directly.

## Supplier booking reconciliation

Phase 8 exposes `POST /api/admin/reconcile` for the demo. Supplier booking attempts are protected by the same `clientReference` (`booking_reference`), an attempt row created before the supplier call, row locks, and the unique `(booking_id, attempt_no)` constraint. `IN_FLIGHT` and `UNKNOWN` attempts are status-checked and never created again. Two consecutive `NOT_FOUND` status checks are treated as a definitive failure and refunded; `PENDING` remains `SUPPLIER_BOOKING_UNKNOWN`, and the retry limit moves the booking to `MANUAL_REVIEW`.

## Cancellation

`POST /api/bookings/:bookingId/cancel` supports a preview with `{ "confirm": false }` and an idempotent confirmation with `{ "confirm": true, "cancellationQuoteId": "..." }`. The estimated refund formula is `max(0, customerTotal - airlineCharge - TixxgoCancellationFee - nonRefundableServiceFee)`. A supplier cancellation timeout remains `CANCELLATION_REQUESTED`; `POST /api/admin/reconcile-cancellations` status-checks it and never assumes cancellation or issues a refund prematurely.

## Offer selection

Phase 10 groups offers by a normalized itinerary and fare product. It selects the best comparable offer using selling price, supplier success rate, latency, and margin; unhealthy suppliers are excluded when a healthy comparable offer exists. The selected offer stores fallback offer IDs in the server-only `flight_offers.fallback_offers` column. Different fare families, baggage, or refundability remain separate customer options.

## Commands

Run these from `Tixxgo-serverside/`:

- `npm run dev` - start the API with `tsx`
- `npm run build` - compile TypeScript
- `npm start` - run the compiled API
- `npm run migrate` - apply Knex migrations
- `npm run migrate:rollback` - roll back the latest migration batch
- `npm run seed` - run Knex seeds
- `npm test` - run unit tests
