import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { useEmulator } from '../src/useEmulator';

const require = createRequire(import.meta.url);

const supported = ['rzp-294', 'razorpay-c']; // 2.9.4 and 2.9.8
const unsupported = ['razorpay-a', 'razorpay-d', 'razorpay-b', 'rzp-293']; // 2.0.7, 2.8.6, 2.9.0, 2.9.3

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, () => resolve());
  });
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

function load(pkg: string) {
  const mod = require(pkg);
  const Razorpay = mod.default ?? mod;
  return new Razorpay({ key_id: 'rzp_test_x', key_secret: 'secret' });
}

describe.each(supported)('supported SDK %s', (pkg) => {
  it('creates and fetches an order from the emulator', async () => {
    const rzp = useEmulator(load(pkg), baseUrl);
    const created = await rzp.orders.create({ amount: 50000, currency: 'INR' });
    // Our server makes ids like order_ + 14 lowercase hex characters.
    expect(created.id).toMatch(/^order_[0-9a-f]{14}$/);
    const fetched = await rzp.orders.fetch(created.id);
    expect(fetched.amount_due).toBe(50000);
  });
});

describe.each(unsupported)('unsupported SDK %s', (pkg) => {
  it('fails loudly instead of calling the real Razorpay', () => {
    expect(() => useEmulator(load(pkg), baseUrl)).toThrow(/unsupported/);
  });
});