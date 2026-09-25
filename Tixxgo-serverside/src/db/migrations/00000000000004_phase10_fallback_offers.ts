import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('flight_offers', (table) => {
    table.jsonb('fallback_offers');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('flight_offers', (table) => {
    table.dropColumn('fallback_offers');
  });
}
