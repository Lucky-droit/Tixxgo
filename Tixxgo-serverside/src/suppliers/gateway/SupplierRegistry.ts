import { ConflictError, NotFoundError } from '../../domain/errors.js';
import type { SupplierAdapter } from '../contracts/SupplierAdapter.js';

export class SupplierRegistry {
  private readonly adapters = new Map<string, SupplierAdapter>();

  constructor(adapters: SupplierAdapter[] = [], private readonly enabledCodes?: string[]) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter: SupplierAdapter): void {
    if (this.adapters.has(adapter.code)) {
      throw new ConflictError(`Supplier adapter '${adapter.code}' is already registered`);
    }
    this.adapters.set(adapter.code, adapter);
  }

  remove(code: string): boolean {
    return this.adapters.delete(code);
  }

  get(code: string): SupplierAdapter {
    const adapter = this.adapters.get(code);
    if (!adapter || !this.isEnabled(code)) {
      throw new NotFoundError(`Supplier '${code}' is not enabled`);
    }
    return adapter;
  }

  listEnabled(): SupplierAdapter[] {
    return [...this.adapters.values()].filter((adapter) => this.isEnabled(adapter.code));
  }

  private isEnabled(code: string): boolean {
    return !this.enabledCodes || this.enabledCodes.includes(code);
  }
}
