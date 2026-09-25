# Tixxgo File Flow

This guide shows which files call or depend on which other files during the main customer and operations flows. It follows the actual source layout; the customer web app is `Tixxgo-userside/` and the API is `Tixxgo-serverside/`.

## Application startup and request path

```mermaid
flowchart TD
  UMain[userside/src/main.tsx] --> UApp[userside/src/App.tsx]
  UApp --> Routes[userside/src/routes.tsx]
  Routes --> Pages[userside/src/pages/*]
  Pages --> Client[userside/src/api/apiClient.ts]
  Pages --> Context[userside/src/context/BookingFlowContext.tsx]
  Client -->|HTTP /api| Server[serverside/src/server.ts]
  Server --> App[serverside/src/app.ts]
  App --> Middleware[requestId / JSON / validation / idempotency / error handler]
  App --> Modules[flights, bookings, payments, cancellations, admin routes]
  Modules --> Domain[domain models, errors, state machine]
  Modules --> DB[db/knex.ts]
  DB --> Schema[db/migrations/*]
  Modules --> Gateway[suppliers/gateway/SupplierGateway.ts]
  Gateway --> Registry[suppliers/gateway/SupplierRegistry.ts]
  Registry --> Runtime[suppliers/runtime.ts]
  Runtime --> TBO[suppliers/adapters/tbo/*]
  Runtime --> Mock[suppliers/mock/*]
```

The UI is wired together by `main.tsx` → `App.tsx` → `routes.tsx`. Pages use `apiClient.ts` for HTTP calls and `BookingFlowContext.tsx` for temporary journey state. On the API side, `server.ts` starts the Express app built in `app.ts`; that file creates the supplier and payment runtimes and mounts the module routers.

## Flight search to fare quote

```mermaid
flowchart LR
  SearchPage[userside/pages/SearchPage.tsx] --> API[userside/api/apiClient.ts]
  API --> FlightRoutes[serverside/modules/flights/routes.ts]
  FlightRoutes --> SearchSchema[modules/flights/schema.ts]
  FlightRoutes --> FlightService[modules/flights/service.ts]
  FlightService --> Gateway[suppliers/gateway/SupplierGateway.ts]
  Gateway --> Adapter[adapters/tbo/TboAdapter.ts]
  Adapter --> MockClient[adapters/tbo/tboMockClient.ts]
  MockClient --> Scenarios[suppliers/mock/scenarioController.ts]
  Adapter --> Mapper[adapters/tbo/tboMapper.ts]
  FlightService --> Pricing[modules/pricing/PricingEngine.ts]
  FlightService --> Selector[modules/offers-selection/offerSelector.ts]
  Selector --> Fingerprint[modules/offers-selection/itineraryFingerprint.ts]
  FlightService --> OffersDB[(flight_offers)]
  FlightService --> ResultsPage[userside/pages/ResultsPage.tsx]
  ResultsPage --> Revalidate[userside/pages/RevalidatePage.tsx]
  Revalidate --> FlightRoutes
  FlightRoutes --> RevalidationService[modules/flights/revalidationService.ts]
  RevalidationService --> Gateway
  RevalidationService --> QuotesDB[(fare_quotes)]
```

`FlightService` is the point where supplier offers become customer offers: it prices, selects, persists both normalized and raw supplier data, then returns the normalized result. The TBO mapper and adapter contain supplier-specific details. `FareRevalidationService` uses the saved offer to ask the gateway for a fresh fare and persist a quote. Quote acceptance is handled by the same service and routes.

## Booking, payment, and supplier confirmation

```mermaid
flowchart TD
  Traveller[userside/pages/TravellerPage.tsx] --> Client[userside/api/apiClient.ts]
  Client --> BookingRoutes[serverside/modules/bookings/routes.ts]
  BookingRoutes --> Idempotency[middleware/idempotency.ts]
  BookingRoutes --> BookingSchema[modules/bookings/schema.ts]
  BookingRoutes --> BookingService[modules/bookings/service.ts]
  BookingService --> Quotes[(fare_quotes)]
  BookingService --> BookingTables[(bookings, travellers, payments, booking_events)]
  PaymentPage[userside/pages/PaymentPage.tsx] --> Client
  Client --> PaymentRoutes[modules/payments/routes.ts]
  PaymentRoutes --> PaymentService[modules/payments/service.ts]
  PaymentService --> MockPayment[modules/payments/MockPaymentGateway.ts]
  PaymentService --> StateMachine[domain/bookingStateMachine.ts]
  PaymentService --> Orchestrator[modules/bookings/bookingOrchestrator.ts]
  Orchestrator --> SupplierGateway[suppliers/gateway/SupplierGateway.ts]
  Orchestrator --> Attempts[(supplier_booking_attempts)]
  Orchestrator --> StateMachine
  Orchestrator --> Notifications[modules/notifications/notificationService.ts]
  Confirmation[userside/pages/ConfirmationPage.tsx] --> Client
  Client --> BookingRead[modules/bookings/service.ts]
  BookingRead --> Confirmation
  Reconcile[modules/bookings/reconciliationRoutes.ts] --> Orchestrator
  Job[jobs/reconciliationJob.ts] --> Orchestrator
```

`BookingService` checks quote status/expiry and writes the booking record with travellers and a pending payment. `PaymentService` handles mock gateway creation and callbacks; a successful callback transitions the booking and hands off to `BookingOrchestrator`. The orchestrator owns supplier booking attempts, status resolution, refunds after definitive supplier failure, and notifications. `bookingStateMachine.ts` defines allowed booking status changes and writes audit events. The admin reconciliation endpoint calls the same orchestrator; `jobs/reconciliationJob.ts` is a callable wrapper for a scheduler.

## Cancellation flow

```mermaid
flowchart LR
  CancelRequest[POST /api/bookings/:bookingId/cancel] --> CancelRoutes[modules/cancellations/routes.ts]
  CancelRoutes --> CancelSchema[modules/cancellations/schema.ts]
  CancelRoutes --> CancelService[modules/cancellations/service.ts]
  CancelService --> SupplierGateway[suppliers/gateway/SupplierGateway.ts]
  CancelService --> StateMachine[domain/bookingStateMachine.ts]
  CancelService --> CancelRows[(cancellations)]
  CancelService --> RefundRows[(refunds, payments, bookings)]
  CancelService --> Notifications[modules/notifications/notificationService.ts]
  CancelReconcile[POST /api/admin/reconcile-cancellations] --> CancelRoutes
```

The cancellation route supports a quote preview (`confirm: false`) and confirmation (`confirm: true`). `CancellationService` obtains the supplier charge, calculates and stores an estimate, then on confirmation transitions the booking, calls the supplier, and initiates the payment refund. Reconciliation of a pending supplier cancellation is in the same service.

## Shared infrastructure and persistence

| Concern | Files |
|---|---|
| API setup and routes | `serverside/src/server.ts`, `serverside/src/app.ts` |
| Request validation and errors | `middleware/validate.ts`, `middleware/errorHandler.ts`, `domain/errors.ts` |
| Request IDs and idempotency | `middleware/requestId.ts`, `middleware/idempotency.ts` |
| Database connection and schema | `db/knex.ts`, `db/migrations/*.ts`, `db/seeds/*.ts` |
| Booking status and audit history | `domain/bookingStateMachine.ts`, `booking_events` table |
| Integer money conversion | `utils/money.ts`, `modules/pricing/PricingEngine.ts` |
| Supplier contract and routing | `suppliers/contracts/*`, `suppliers/gateway/*`, `suppliers/runtime.ts` |
| Mock supplier controls | `suppliers/mock/*`, `adapters/tbo/tboMockClient.ts` |
| Customer-facing journey state | `userside/src/context/BookingFlowContext.tsx` |

The initial schema and later migrations define the tables used by these flows: `flight_offers`, `fare_quotes`, `bookings`, `travellers`, `payments`, `supplier_booking_attempts`, `booking_events`, `cancellations`, `refunds`, `idempotency_keys`, `notifications`, and `supplier_stats`.

## Other frontend files

- `ResultsPage.tsx` displays offers and starts revalidation.
- `RevalidatePage.tsx` displays the fresh fare and handles acceptance.
- `TravellerPage.tsx` creates the booking.
- `PaymentPage.tsx` simulates success/failure payment callbacks.
- `ConfirmationPage.tsx` reads booking state and polls while supplier confirmation is pending.
- `types/api.ts` contains the frontend API data shapes; `App.css` and `index.css` provide styling.
- `vite.config.ts` configures the development API proxy; `package.json` defines the frontend scripts.

## Other backend files

- `modules/pricing/pricingRules.ts` defines the service fee and promotion rules used by `PricingEngine.ts`.
- `modules/payments/MockPaymentGateway.ts` simulates payment and refund operations.
- `modules/bookings/reconciliationRoutes.ts` exposes booking reconciliation for the demo.
- `modules/cancellations/schema.ts` validates preview and confirm requests.
- `config/env.ts` and `config/constants.ts` hold runtime configuration and business constants.
- `utils/logger.ts` and `utils/money.ts` provide shared logging and money helpers.
- `adapters/tripjack/TripJackAdapter.ts` is an extension stub implementing the supplier contract.
- `tests/*.test.ts` cover the API app, search validation and flow, pricing, mapper, offer selection, state machine, and related behavior.
