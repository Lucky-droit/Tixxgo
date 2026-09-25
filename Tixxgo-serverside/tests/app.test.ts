import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const database = { raw: async () => undefined } as never;
const app = createApp(database);

describe('Phase 0 API foundation', () => {
  it('returns health with database connectivity', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'ok' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('returns the standard error shape for an AppError', async () => {
    const response = await request(app).get('/api/dev/error');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Example validation failure',
        details: { field: 'example' }
      }
    });
  });
});
