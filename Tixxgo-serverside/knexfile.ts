import 'dotenv/config';
import type { Knex } from 'knex';
import { env } from './src/config/env.js';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: {
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false
    },
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX
    },
    migrations: { directory: './src/db/migrations', extension: 'ts' },
    seeds: { directory: './src/db/seeds', extension: 'ts' }
  },
  test: {
    client: 'pg',
    connection: {
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false
    },
    migrations: { directory: './src/db/migrations', extension: 'ts' },
    seeds: { directory: './src/db/seeds', extension: 'ts' }
  }
};

export default config;
