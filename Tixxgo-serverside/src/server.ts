import { createApp } from './app.js';
import { env } from './config/env.js';
import { db } from './db/knex.js';
import { logger } from './utils/logger.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Tixxgo API listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void db.destroy();
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
