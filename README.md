# razorpay-local

A local emulator for the Razorpay API. It runs on your machine, speaks the same
HTTP routes as Razorpay for orders and payments, and sends signed webhooks to
your app, so you can test payment flows without the network, test keys or a
browser checkout.

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

## Quick start

### With npx

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

Webhooks are signed with HMAC-SHA256 in the `X-Razorpay-Signature` header, so
`Razorpay.validateWebhookSignature` accepts them. Events sent: `payment.captured`,
`order.paid` and `payment.failed`.

## Chaos options

Send these to `POST /_emulator/webhooks/chaos`:

| Option | Type | Effect |
| --- | --- | --- |
| `duplicate` | integer, 0 to 10 | Sends each event this many extra times, with the same event id. |
| `delayMs` | integer, 0 to 60000 | Waits before delivering, so the webhook arrives after the pay call returns. |
| `drop` | boolean | Never delivers. The log still records the event as dropped. |
| `reverse` | boolean | Delivers `order.paid` before `payment.captured`. |

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
