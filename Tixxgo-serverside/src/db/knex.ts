import knex, { type Knex } from 'knex';
import { env } from '../config/env.js';

export const db: Knex = knex({
  client: 'pg',
  connection: {
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false
  },
  pool: { min: env.DB_POOL_MIN, max: env.DB_POOL_MAX }
});
