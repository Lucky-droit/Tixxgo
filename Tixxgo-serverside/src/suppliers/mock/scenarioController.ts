export const mockScenarios = [
  'NORMAL',
  'PRICE_CHANGE',
  'BOOKING_TIMEOUT',
  'BOOKING_TIMEOUT_NOT_CREATED',
  'BOOKING_FAIL',
  'STATUS_CHECK_CONFIRMED',
  'STATUS_CHECK_NOT_FOUND',
  'CANCEL_OK'
] as const;

export type MockScenario = (typeof mockScenarios)[number];

export class ScenarioController {
  private scenario: MockScenario;

  constructor(initialScenario: string | undefined = process.env.MOCK_SUPPLIER_SCENARIO) {
    this.scenario = this.parse(initialScenario ?? 'NORMAL');
  }

  get(): MockScenario {
    return this.scenario;
  }

  set(scenario: string): MockScenario {
    this.scenario = this.parse(scenario);
    return this.scenario;
  }

  private parse(value: string): MockScenario {
    if ((mockScenarios as readonly string[]).includes(value)) {
      return value as MockScenario;
    }
    throw new Error(`Unsupported mock supplier scenario: ${value}`);
  }
}
