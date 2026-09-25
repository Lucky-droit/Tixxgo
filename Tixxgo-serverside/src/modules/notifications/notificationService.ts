import type { Knex } from 'knex';

export class NotificationService {
  constructor(private readonly database: Knex) {}

  async send(bookingId: string, template: string, payload: Record<string, unknown>): Promise<void> {
    await this.database('notifications').insert({
      id: crypto.randomUUID(),
      booking_id: bookingId,
      channel: 'EMAIL',
      template,
      payload_json: JSON.stringify(payload),
      status: 'PENDING',
      created_at: new Date()
    });
  }
}
