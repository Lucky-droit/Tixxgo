import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@127.0.0.1:5432/tixxgo'),
  DATABASE_SSL: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  ENABLED_SUPPLIERS: z.string().default('tbo'),
  SUPPLIER_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(0),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.string().default('info')
});

export const env = envSchema.parse(process.env);
