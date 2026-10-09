import { randomBytes } from 'node:crypto';

export type Order = {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  offer_id: null;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: unknown;
  created_at: number;
};

export type Payment = {
  id: string;
  entity: 'payment';
  amount: number;
  currency: string;
  status: 'captured' | 'failed';
  order_id: string;
  invoice_id: string | null;
  international: boolean;
  method: string;
  amount_refunded: number;
  refund_status: string | null;
  captured: boolean;
  description: string | null;
  card_id: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  email: string | null;
  contact: string | null;
  notes: unknown;
  fee: number;
  tax: number;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  acquirer_data: Record<string, string | null>;
  created_at: number;
};

export const newId = (prefix: string) =>
  prefix + '_' + randomBytes(7).toString('hex');

export const now = () => Math.floor(Date.now() / 1000);

export function buildOrder(input: {
  amount: number;
  currency: string;
  receipt?: string | null;
  notes?: unknown;
}): Order {
  return {
    id: newId('order'),
    entity: 'order',
    amount: input.amount,
    amount_paid: 0,
    amount_due: input.amount,
    currency: input.currency,
    receipt: input.receipt ?? null,
    offer_id: null,
    status: 'created',
    attempts: 0,
    notes: input.notes ?? [],
    created_at: now(),
  };
}

export function buildPayment(order: Order, outcome: 'success' | 'fail'): Payment {
  const failed = outcome === 'fail';
  return {
    id: newId('pay'),
    entity: 'payment',
    amount: order.amount,
    currency: order.currency,
    status: failed ? 'failed' : 'captured',
    order_id: order.id,
    invoice_id: null,
    international: false,
    method: 'card',
    amount_refunded: 0,
    refund_status: null,
    captured: !failed,
    description: null,
    card_id: null,
    bank: null,
    wallet: null,
    vpa: null,
    email: 'test@example.com',
    contact: '+919999999999',
    notes: order.notes ?? [],
    fee: 0,
    tax: 0,
    error_code: failed ? 'BAD_REQUEST_ERROR' : null,
    error_description: failed ? 'Payment failed (simulated by emulator)' : null,
    error_source: failed ? 'customer' : null,
    error_step: failed ? 'payment_authentication' : null,
    error_reason: failed ? 'payment_failed' : null,
    acquirer_data: {},
    created_at: now(),
  };
}
