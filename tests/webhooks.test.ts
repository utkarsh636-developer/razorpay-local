import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Razorpay from 'razorpay';
import { createApp } from '../src/app';
import { useEmulator } from '../src/useEmulator';

const SECRET = 'whsec_test';

let emulator: Server;
let receiver: http.Server;
let baseUrl: string;
let rzp: any;
const received: { body: string; signature: string }[] = [];

beforeAll(async () => {
  // A tiny fake "developer server" that records what it receives.
  await new Promise<void>((resolve) => {
    receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({
          body: Buffer.concat(chunks).toString(),
          signature: String(req.headers['x-razorpay-signature']),
        });
        res.statusCode = 200;
        res.end('ok');
      });
    }).listen(0, () => resolve());
  });
  const receiverPort = (receiver.address() as AddressInfo).port;

  await new Promise<void>((resolve) => {
    emulator = createApp().listen(0, () => resolve());
  });
  baseUrl = `http://localhost:${(emulator.address() as AddressInfo).port}`;
  rzp = useEmulator(
    new Razorpay({ key_id: 'rzp_test_x', key_secret: 'secret' }),
    baseUrl
  );

  await fetch(`${baseUrl}/_emulator/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `http://localhost:${receiverPort}/hook`, secret: SECRET }),
  });
});

afterAll(() => {
  emulator.close();
  receiver.close();
});

async function pay(orderId: string, outcome: 'success' | 'fail') {
  const res = await fetch(`${baseUrl}/_emulator/orders/${orderId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
  return res.json();
}

describe('webhooks', () => {
  it('sends payment.captured then order.paid, signed correctly', async () => {
    received.length = 0;
    const order = await rzp.orders.create({ amount: 50000, currency: 'INR' });
    await pay(order.id, 'success');

    const events = received.map((r) => JSON.parse(r.body).event);
    expect(events).toEqual(['payment.captured', 'order.paid']);

    // The real SDK's own check must accept our signatures.
    for (const r of received) {
      expect(
        (Razorpay as any).validateWebhookSignature(r.body, r.signature, SECRET)
      ).toBe(true);
    }
  });

  it('sends payment.failed for a failed payment', async () => {
    received.length = 0;
    const order = await rzp.orders.create({ amount: 20000, currency: 'INR' });
    await pay(order.id, 'fail');
    const events = received.map((r) => JSON.parse(r.body).event);
    expect(events).toEqual(['payment.failed']);
  });

  it('a wrong secret fails the SDK signature check', async () => {
    received.length = 0;
    const order = await rzp.orders.create({ amount: 10000, currency: 'INR' });
    await pay(order.id, 'success');
    expect(
      (Razorpay as any).validateWebhookSignature(
        received[0].body,
        received[0].signature,
        'wrong_secret'
      )
    ).toBe(false);
  });
});