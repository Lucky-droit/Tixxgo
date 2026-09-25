import { z } from 'zod';

export const cancellationRequestSchema = z.discriminatedUnion('confirm', [
  z.object({ confirm: z.literal(false) }),
  z.object({ confirm: z.literal(true), cancellationQuoteId: z.string().uuid() })
]);

export const cancellationParamsSchema = z.object({ bookingId: z.string().uuid() });
export type CancellationRequest = z.infer<typeof cancellationRequestSchema>;
