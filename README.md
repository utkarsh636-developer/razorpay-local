# razorpay-local

A local emulator for the Razorpay API. It runs on your machine, speaks a
compatible subset of the same HTTP routes as Razorpay for orders and payments,
and sends signed webhooks to your app, so you can test payment flows without
the network, test keys or a browser checkout.

![razorpay-local Demo](./assets/razorpay-local-demo.gif)

> **Payload shape disclaimer.** The payment and order entities emitted by this
> emulator are a **compatible subset** of the real Razorpay schema. Fields that
> are always `null` or empty (such as `acquirer_data`) are present but empty.
> Fields that vary by payment method (card details, UPI VPA, etc.) are not
> simulated. Do not assume exact field-for-field parity with production.

> **Unofficial.** This project is not affiliated with, endorsed by or
> connected to Razorpay.

## The problem

Testing a payment integration against the real Razorpay test mode is slow and
flaky: you need network access and keys, you cannot easily make a payment fail
on demand, and you cannot control webhooks. Webhook handlers are the worst
part. In production, webhooks arrive twice, late, out of order, or not at all,
and almost nobody tests for that.

`razorpay-local` lets you create orders, force a payment to succeed or fail,
and then break the webhook delivery on purpose.

### Why not just use mocks (`vi.mock('razorpay')`)?

When you mock the SDK you are testing your own imagination, not real Razorpay
behaviour. A mock won't catch a wrong amount, a missing auth header, or a
response field your code assumed would always be present. `razorpay-local`
makes the real SDK fire real HTTP requests and receive real JSON responses.

### Why not use the live Razorpay sandbox?

The sandbox is great for a final manual click-through. It is a poor fit for
automated tests:

| | Sandbox | razorpay-local |
| --- | --- | --- |
| Network required | Yes | No |
| API keys required | Yes | No |
| Speed per test | 1 – 3 s | < 5 ms |
| Force a payment failure | Manual only | One API call |
| Duplicate / delayed webhooks | Impossible | Built-in |
| Works in CI/CD offline | No | Yes |

## Quick start

### With npx

Requires **Node.js 22 or newer**.

```bash
npx razorpay-local start
```

The emulator listens on `http://127.0.0.1:4000`. Options:

```bash
npx razorpay-local start --port 4000 --host 127.0.0.1
```

### With Docker

```bash
docker build -t razorpay-local .
docker run --rm -p 4000:4000 razorpay-local
```

Or copy `docker-compose.example.yml` to `docker-compose.yml` and run
`docker compose up`.

## Point the Razorpay SDK at the emulator

```ts
import Razorpay from 'razorpay';
import { useEmulator } from 'razorpay-local';

const rzp = useEmulator(
  new Razorpay({ key_id: 'rzp_test_x', key_secret: 'secret' }),
  'http://localhost:4000'
);
```

`useEmulator` changes the base URL of the SDK's HTTP client. If the SDK
version is not supported it throws, instead of silently calling the real
Razorpay API.

### Adding it to an existing app (no production code changes needed)

If your app initialises the Razorpay client once (e.g. `src/lib/razorpay.ts`),
add just these two lines. Your production code is untouched.

```ts
// src/lib/razorpay.ts
import Razorpay from 'razorpay';
import { useEmulator } from 'razorpay-local'; // [+]

export const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy',
});

// [+] Only active during tests or local dev. Production is never affected.
if (process.env.NODE_ENV === 'test' || process.env.USE_EMULATOR === 'true') {
  useEmulator(rzp, process.env.EMULATOR_URL || 'http://localhost:4000');
}
```

Everything else in your app stays identical. In production `NODE_ENV` is
`'production'`, so `useEmulator` is never called.

## Simulating payments in tests

Once the SDK points at the emulator, trigger a payment with a plain `fetch`
call — no browser, no OTP, no manual clicking:

```ts
import { createApp } from 'razorpay-local';
import { rzp } from '../src/lib/razorpay'; // your app's SDK instance

let server: any;

beforeAll(() => { server = createApp().listen(4000); });
afterAll(() => server.close());

it('marks the order paid after a successful payment', async () => {
  // 1. Your app creates an order as normal.
  const order = await rzp.orders.create({ amount: 50000, currency: 'INR' });
  expect(order.status).toBe('created');

  // 2. Simulate the customer completing payment.
  const res = await fetch(`http://localhost:4000/_emulator/orders/${order.id}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome: 'success' }),
  });
  const { payment } = await res.json();
  expect(payment.status).toBe('captured');

  // 3. Fetch the updated order from the emulator (same call your app makes).
  const updated = await rzp.orders.fetch(order.id);
  expect(updated.status).toBe('paid');
  expect(updated.amount_due).toBe(0);
});

it('keeps the order as attempted after a payment failure', async () => {
  const order = await rzp.orders.create({ amount: 20000, currency: 'INR' });

  const res = await fetch(`http://localhost:4000/_emulator/orders/${order.id}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome: 'fail' }),
  });
  const { payment } = await res.json();
  expect(payment.status).toBe('failed');

  const updated = await rzp.orders.fetch(order.id);
  expect(updated.status).toBe('attempted');
  expect(updated.amount_due).toBe(20000); // still unpaid — customer can retry
});
```

### Webhook events fired automatically

| Outcome | Events fired (in order) |
| --- | --- |
| `success` | `payment.captured`, then `order.paid` |
| `fail` | `payment.failed` |

All events are signed with HMAC-SHA256 in `X-Razorpay-Signature`, so
`Razorpay.validateWebhookSignature` accepts them out of the box.

To receive webhooks in your tests, register your handler URL once:

```ts
await fetch('http://localhost:4000/_emulator/webhooks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'http://localhost:3000/api/razorpay/webhook',
    secret: process.env.RAZORPAY_WEBHOOK_SECRET,
  }),
});
```

## Supported SDK versions

The `razorpay` npm package **2.9.4 and newer**. These versions use Axios, so
the base URL can be redirected. Older versions use `request-promise`, ignore
the redirect, and would send your requests to the real API, so `useEmulator`
refuses them.

## Control routes

These routes belong to the emulator and are not part of the real Razorpay API.
They need no authentication.

| Route | What it does |
| --- | --- |
| `POST /_emulator/orders/:id/pay` | Simulates a payment. Body: `{ "outcome": "success" }` or `{ "outcome": "fail" }`. Updates the order and sends webhooks. |
| `POST /_emulator/webhooks` | Sets where webhooks are sent. Body: `{ "url": "...", "secret": "..." }`. |
| `GET /_emulator/webhooks/log` | Lists every delivery attempt, including dropped ones. |
| `POST /_emulator/webhooks/replay/:id` | Sends a past webhook again (same body, same signature). |
| `POST /_emulator/webhooks/chaos` | Sets chaos options (see below). |
| `POST /_emulator/webhooks/chaos/reset` | Turns all chaos options off. |

The Razorpay routes that exist today: `POST /v1/orders`, `GET /v1/orders`,
`GET /v1/orders/:id`, `GET /v1/orders/:id/payments` and
`GET /v1/payments/:id`. They require a `Basic` authorization header.


## Chaos options

Real-world webhooks are unreliable. Use chaos options to prove your handler
survives before you ship:

```ts
// Send every webhook 2 extra times (3 total) to test idempotency.
await fetch('http://localhost:4000/_emulator/webhooks/chaos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ duplicate: 2 }),
});
```

Send these to `POST /_emulator/webhooks/chaos`:

| Option | Type | Effect |
| --- | --- | --- |
| `duplicate` | integer, 0 to 10 | Sends each event this many extra times, with the same event id. Use this to test that your handler never credits a customer twice. |
| `delayMs` | integer, 0 to 60000 | Waits before delivering, so the webhook arrives after the pay call returns. |
| `drop` | boolean | Never delivers. The log still records the event as dropped. |
| `reverse` | boolean | Delivers `order.paid` before `payment.captured`. |

Reset to normal delivery at any time:

```bash
POST http://localhost:4000/_emulator/webhooks/chaos/reset
```

## Test runner

The test runner fires fake, correctly and incorrectly signed webhooks at your
own webhook handler and tells you which checks it fails:

```bash
npx razorpay-local test --url http://localhost:3000/webhook --secret whsec_123
```

Sample output:

```text
Testing webhook handler at http://localhost:3000/webhook

✓ accepts a correctly signed webhook
✓ rejects a tampered signature
✓ rejects a missing signature
✓ rejects a modified body
✓ survives a duplicate delivery
✓ survives out-of-order delivery
✓ replies quickly

7 passed, 0 failed
```

Optional flags: `--order-id`, `--payment-id`, `--allow-remote`.

> **Warning: never point the test runner at production.** It sends fake
> payment events. By default it refuses any URL that is not local
> (`localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal`). Do not use
> `--allow-remote` against a live system.

## What is not supported yet

- Refunds, customers, subscriptions, invoices, payment links, payouts and
  other Razorpay APIs. Only orders and payments exist.
- Real payment methods. Every simulated payment is a card payment.
- Payment-method-specific fields (`card`, `upi`, `acquirer_data` contents, etc.).
  These objects are present but empty. Handlers that read, for example,
  `payment.acquirer_data.bank_transaction_id` will see `undefined` in tests.
- Order options such as `max_attempts`; there is no retry limit.
- Real key checking. Any `Basic` authorization header is accepted.
- Persistence. All data lives in memory and is lost when the process stops.
- Webhook retries with backoff, like Razorpay does after a failed delivery.
- Razorpay SDK versions older than 2.9.4.

## Development

```bash
npm ci
npm run build
npm test
```

## License

MIT
