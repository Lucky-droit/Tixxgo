import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('flight_offers', (table) => {
    table.integer('adult_count').unsigned().notNullable().defaultTo(1);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('flight_offers', (table) => {
    table.dropColumn('adult_count');
  });
}
