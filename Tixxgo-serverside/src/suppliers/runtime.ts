import { env } from '../config/env.js';
import { SupplierGateway } from './gateway/SupplierGateway.js';
import { SupplierRegistry } from './gateway/SupplierRegistry.js';
import { TboAdapter } from './adapters/tbo/TboAdapter.js';
import { TboMockClient } from './adapters/tbo/tboMockClient.js';
import { ScenarioController } from './mock/scenarioController.js';

export function createSupplierRuntime(): {
  gateway: SupplierGateway;
  scenarios: ScenarioController;
  registry: SupplierRegistry;
} {
  const scenarios = new ScenarioController();
  const registry = new SupplierRegistry(
    [new TboAdapter(new TboMockClient(scenarios))],
    env.ENABLED_SUPPLIERS.split(',').map((code) => code.trim()).filter(Boolean)
  );
  return {
    gateway: new SupplierGateway(registry, env.SUPPLIER_TIMEOUT_MS),
    scenarios,
    registry
  };
}
