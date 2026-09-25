import { SupplierError } from '../../domain/errors.js';
import { logger } from '../../utils/logger.js';
import type { SupplierAdapter } from '../contracts/SupplierAdapter.js';
import type {
  CancellationQuote,
  InternalSearchRequest,
  SupplierBookingRequest,
  SupplierBookingResult,
  SupplierBookingStatus,
  SupplierCancelResult,
  SupplierFareQuote,
  SupplierOffer,
  SupplierOfferRef
} from '../contracts/supplierTypes.js';
import { SupplierRegistry } from './SupplierRegistry.js';

export interface SupplierSearchResponse {
  offers: SupplierOffer[];
  warnings: Array<{ supplierCode: string; code: string; message: string }>;
}

export class SupplierGateway {
  constructor(
    private readonly registry: SupplierRegistry,
    private readonly timeoutMs = 8_000
  ) {}

  async search(request: InternalSearchRequest): Promise<SupplierSearchResponse> {
    const adapters = this.registry.listEnabled();
    const settled = await Promise.allSettled(adapters.map((adapter) => this.call(adapter, 'searchFlights', () => adapter.searchFlights(request))));
    const offers: SupplierOffer[] = [];
    const warnings: SupplierSearchResponse['warnings'] = [];

    settled.forEach((result, index) => {
      const adapter = adapters[index];
      if (result.status === 'fulfilled') {
        offers.push(...result.value.map((offer) => ({ ...offer, supplierCode: adapter.code })));
      } else {
        const error = this.normalizeError(result.reason);
        warnings.push({ supplierCode: adapter.code, code: error.code, message: error.message });
      }
    });

    return { offers, warnings };
  }

  revalidateFare(adapterCode: string, ref: SupplierOfferRef): Promise<SupplierFareQuote> {
    return this.call(this.registry.get(adapterCode), 'revalidateFare', (adapter) => adapter.revalidateFare(ref));
  }

  createBooking(adapterCode: string, request: SupplierBookingRequest): Promise<SupplierBookingResult> {
    return this.call(this.registry.get(adapterCode), 'createBooking', (adapter) => adapter.createBooking(request));
  }

  getBookingStatus(adapterCode: string, query: { clientReference?: string; supplierBookingRef?: string }): Promise<SupplierBookingStatus> {
    return this.call(this.registry.get(adapterCode), 'getBookingStatus', (adapter) => adapter.getBookingStatus(query));
  }

  getCancellationQuote(adapterCode: string, supplierBookingRef: string): Promise<CancellationQuote> {
    return this.call(this.registry.get(adapterCode), 'getCancellationQuote', (adapter) => adapter.getCancellationQuote(supplierBookingRef));
  }

  cancelBooking(adapterCode: string, supplierBookingRef: string, quoteId: string): Promise<SupplierCancelResult> {
    return this.call(this.registry.get(adapterCode), 'cancelBooking', (adapter) => adapter.cancelBooking(supplierBookingRef, quoteId));
  }

  private async call<T>(adapter: SupplierAdapter, operation: string, action: (adapter: SupplierAdapter) => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await Promise.race([
        action(adapter),
        new Promise<never>((_, reject) => setTimeout(() => reject(new SupplierError('TIMEOUT', `${adapter.code} ${operation} timed out`)), this.timeoutMs))
      ]);
      logger.info({ supplierCode: adapter.code, operation, durationMs: Date.now() - startedAt }, 'Supplier call completed');
      return result;
    } catch (error) {
      const normalized = this.normalizeError(error);
      logger.warn({ supplierCode: adapter.code, operation, durationMs: Date.now() - startedAt, code: normalized.code }, 'Supplier call failed');
      throw normalized;
    }
  }

  private normalizeError(error: unknown): SupplierError {
    if (error instanceof SupplierError) {
      return error;
    }
    if (error instanceof Error) {
      return new SupplierError('UNAVAILABLE', error.message);
    }
    return new SupplierError('UNAVAILABLE', 'Supplier call failed');
  }
}
