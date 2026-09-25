import { z } from 'zod';

const travellerSchema = z.object({
  type: z.enum(['ADULT', 'CHILD', 'INFANT']),
  title: z.string().min(2).max(10),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(['M', 'F', 'O']),
  passportNo: z.string().trim().max(100).optional()
});

export const createBookingSchema = z.object({
  quoteId: z.string().uuid(),
  contact: z.object({
    email: z.string().email(),
    phone: z.string().min(7).max(32)
  }),
  travellers: z.array(travellerSchema).min(1).max(9)
});

export const bookingParamsSchema = z.object({ idOrReference: z.string().min(1).max(64) });
export type CreateBookingRequest = z.infer<typeof createBookingSchema>;
