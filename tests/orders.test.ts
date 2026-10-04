import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import Razorpay from 'razorpay';
import { createApp } from '../src/app';
import { useEmulator } from '../src/useEmulator';

let server: Server;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(4001, () => resolve());
  });
});

afterAll(() => {
  server.close();
});

describe('orders', () => {
  const rzp = useEmulator(
    new Razorpay({ key_id: 'rzp_test_x', key_secret: 'secret' }),
    'http://localhost:4001'
  );

  it('creates an order', async () => {
    const order = await rzp.orders.create({ amount: 50000, currency: 'INR' });
    expect(order.status).toBe('created');
    expect(order.amount_due).toBe(50000);
  });

  it('fetches an order', async () => {
    const created = await rzp.orders.create({ amount: 12300, currency: 'INR' });
    const fetched = await rzp.orders.fetch(created.id);
    expect(fetched.id).toBe(created.id);
  });
});