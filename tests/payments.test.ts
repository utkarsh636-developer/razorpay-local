import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Razorpay from 'razorpay';
import { createApp } from '../src/app';
import { useEmulator } from '../src/useEmulator';

let server: Server;
let baseUrl: string;
let rzp: any;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, () => resolve());
  });
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  rzp = useEmulator(
    new Razorpay({ key_id: 'rzp_test_x', key_secret: 'secret' }),
    baseUrl
  );
});

afterAll(() => {
  server.close();
});

async function pay(orderId: string, outcome: 'success' | 'fail') {
  const res = await fetch(`${baseUrl}/_emulator/orders/${orderId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
  return { status: res.status, body: await res.json() };
}

describe('payments', () => {
  it('marks the order paid after a successful payment', async () => {
    const order = await rzp.orders.create({ amount: 50000, currency: 'INR' });
    const { body } = await pay(order.id, 'success');

    const payment = await rzp.payments.fetch(body.payment.id);
    expect(payment.status).toBe('captured');
    expect(payment.order_id).toBe(order.id);

    const updated = await rzp.orders.fetch(order.id);
    expect(updated.status).toBe('paid');
    expect(updated.amount_paid).toBe(50000);
    expect(updated.amount_due).toBe(0);
    expect(updated.attempts).toBe(1);
  });

  it('keeps the order attempted after a failed payment, and allows a retry', async () => {
    const order = await rzp.orders.create({ amount: 20000, currency: 'INR' });

    const failed = await pay(order.id, 'fail');
    expect(failed.body.payment.status).toBe('failed');
    let current = await rzp.orders.fetch(order.id);
    expect(current.status).toBe('attempted');
    expect(current.amount_due).toBe(20000);

    await pay(order.id, 'success');
    current = await rzp.orders.fetch(order.id);
    expect(current.status).toBe('paid');
    expect(current.attempts).toBe(2);
  });

  it('refuses to pay an order twice', async () => {
    const order = await rzp.orders.create({ amount: 10000, currency: 'INR' });
    await pay(order.id, 'success');
    const second = await pay(order.id, 'success');
    expect(second.status).toBe(400);
  });

  it('lists the payments of an order', async () => {
    const order = await rzp.orders.create({ amount: 30000, currency: 'INR' });
    await pay(order.id, 'fail');
    await pay(order.id, 'success');
    const list = await rzp.orders.fetchPayments(order.id);
    expect(list.count).toBe(2);
  });
});