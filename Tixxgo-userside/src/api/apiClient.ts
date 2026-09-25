import type { AppErrorBody, BookingResponse, BookingView, RevalidationResponse, SearchResponse } from '../types/api';

const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}, idempotent = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (idempotent) headers.set('Idempotency-Key', crypto.randomUUID());
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body as AppErrorBody;
    throw new ApiError(error.error?.code ?? 'REQUEST_FAILED', error.error?.message ?? 'Request failed', error.error?.details ?? {});
  }
  return body as T;
}

export const apiClient = {
  search: (body: unknown) => request<SearchResponse>('/api/flights/search', { method: 'POST', body: JSON.stringify(body) }),
  revalidate: (offerId: string) => request<RevalidationResponse>('/api/flights/revalidate', { method: 'POST', body: JSON.stringify({ offerId }) }),
  acceptQuote: (quoteId: string) => request<{ quoteId: string }>('/api/flights/quotes/' + quoteId + '/accept', { method: 'POST', body: '{}' }, true),
  createBooking: (body: unknown) => request<BookingResponse>('/api/bookings', { method: 'POST', body: JSON.stringify(body) }, true),
  createPayment: (bookingId: string) => request<{ gatewayTxnId: string }>('/api/bookings/' + bookingId + '/payment', { method: 'POST', body: '{}' }, true),
  callbackPayment: (gatewayTxnId: string, status: 'SUCCESS' | 'FAILED') => request('/api/payments/mock-gateway/callback', { method: 'POST', body: JSON.stringify({ gatewayTxnId, status }) }),
  getBooking: (bookingId: string) => request<BookingView>('/api/bookings/' + bookingId),
};
