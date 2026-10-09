import { describe, it, expect } from 'vitest';
import { buildOrder, buildPayment } from '../src/entities';

describe('entities', () => {
  it('builds a fresh order', () => {
    const order = buildOrder({ amount: 50000, currency: 'INR' });
    expect(order.id).toMatch(/^order_[0-9a-f]{14}$/);
    expect(order.status).toBe('created');
    expect(order.amount_due).toBe(50000);
  });

  it('builds a captured payment linked to its order', () => {
    const order = buildOrder({ amount: 50000, currency: 'INR' });
    const payment = buildPayment(order, 'success');
    expect(payment.order_id).toBe(order.id);
    expect(payment.amount).toBe(50000);
    expect(payment.captured).toBe(true);
    expect(payment.error_code).toBeNull();
  });

  it('builds a failed payment with error details', () => {
    const order = buildOrder({ amount: 20000, currency: 'INR' });
    const payment = buildPayment(order, 'fail');
    expect(payment.status).toBe('failed');
    expect(payment.captured).toBe(false);
    expect(payment.error_code).toBe('BAD_REQUEST_ERROR');
  });
});
