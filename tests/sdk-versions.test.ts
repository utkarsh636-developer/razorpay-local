import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { useEmulator } from '../src/useEmulator';

const require = createRequire(import.meta.url);
const packages = ['razorpay-a', 'razorpay-b', 'razorpay-c'];

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server.close();
});

describe.each(packages)('SDK %s', (pkg) => {
  it('creates and fetches an order', async () => {
    const mod = require(pkg);
    const Razorpay = mod.default ?? mod;
    const rzp = useEmulator(
      new Razorpay({ key_id: 'rzp_test_x', key_secret: 'secret' }),
      baseUrl
    );

    const created = await rzp.orders.create({ amount: 50000, currency: 'INR' });
    expect(created.status).toBe('created');

    const fetched = await rzp.orders.fetch(created.id);
    expect(fetched.amount_due).toBe(50000);
  });
});