import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE payments ADD CONSTRAINT payments_gateway_txn_id_unique UNIQUE (gateway_txn_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE payments DROP CONSTRAINT payments_gateway_txn_id_unique');
}
