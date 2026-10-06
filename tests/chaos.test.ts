import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Razorpay from 'razorpay';
import { createApp } from '../src/app';
import { useEmulator } from '../src/useEmulator';

const SECRET = 'whsec_chaos';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let emulator: Server;
let receiver: http.Server;
let baseUrl: string;
let rzp: any;
const received: { body: string; signature: string; eventId: string }[] = [];

async function post(path: string, body: unknown) {
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function payNewOrder() {
  const order = await rzp.orders.create({ amount: 50000, currency: 'INR' });
  await post(`/_emulator/orders/${order.id}/pay`, { outcome: 'success' });
  return order;
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({
          body: Buffer.concat(chunks).toString(),
          signature: String(req.headers['x-razorpay-signature']),
          eventId: String(req.headers['x-razorpay-event-id']),
        });
        res.end('ok');
      });
    }).listen(0, () => resolve());
  });
  const receiverPort = (receiver.address() as AddressInfo).port;

  await new Promise<void>((resolve) => {
    emulator = createApp().listen(0, () => resolve());
  });
  baseUrl = `http://localhost:${(emulator.address() as AddressInfo).port}`;
  rzp = useEmulator(new Razorpay({ key_id: 'rzp_test_x', key_secret: 'secret' }), baseUrl);

  await post('/_emulator/webhooks', {
    url: `http://localhost:${receiverPort}/hook`,
    secret: SECRET,
  });
});

beforeEach(async () => {
  received.length = 0;
  await post('/_emulator/webhooks/chaos/reset', {});
});

afterAll(() => {
  emulator.close();
  receiver.close();
});

describe('chaos controls', () => {
  it('duplicates: each event arrives 3 times with the same event id', async () => {
    await post('/_emulator/webhooks/chaos', { duplicate: 2 });
    await payNewOrder();
    expect(received).toHaveLength(6);
    expect(new Set(received.map((r) => r.eventId)).size).toBe(2);
  });

  it('reverse: order.paid arrives before payment.captured', async () => {
    await post('/_emulator/webhooks/chaos', { reverse: true });
    await payNewOrder();
    const events = received.map((r) => JSON.parse(r.body).event);
    expect(events).toEqual(['order.paid', 'payment.captured']);
  });

  it('drop: nothing is delivered, and the log says so', async () => {
    await post('/_emulator/webhooks/chaos', { drop: true });
    await payNewOrder();
    expect(received).toHaveLength(0);
    const log = await (await fetch(baseUrl + '/_emulator/webhooks/log')).json();
    expect(log.some((l: any) => l.dropped && l.event === 'payment.captured')).toBe(true);
  });

  it('delay: webhooks arrive after the pay call has returned', async () => {
    await post('/_emulator/webhooks/chaos', { delayMs: 300 });
    await payNewOrder();
    expect(received).toHaveLength(0);
    await sleep(800);
    expect(received).toHaveLength(2);
  });

  it('replay: re-sends the same signed webhook', async () => {
    await payNewOrder();
    expect(received).toHaveLength(2);

    const log = await (await fetch(baseUrl + '/_emulator/webhooks/log')).json();
    const entry = [...log].reverse().find((l: any) => l.event === 'payment.captured' && !l.dropped);
    await post(`/_emulator/webhooks/replay/${entry.id}`, {});

    expect(received).toHaveLength(3);
    expect(received[2].body).toBe(received[0].body);
    expect(
      (Razorpay as any).validateWebhookSignature(received[2].body, received[2].signature, SECRET)
    ).toBe(true);
  });

  it('rejects invalid chaos settings', async () => {
    const res = await fetch(baseUrl + '/_emulator/webhooks/chaos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duplicate: 99 }),
    });
    expect(res.status).toBe(400);
  });
});