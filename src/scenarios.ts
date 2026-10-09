import { buildOrder, buildPayment, now } from './entities';
import { sign } from './webhooks';

export type Options = {
  url: string;
  secret: string;
  orderId?: string;
  paymentId?: string;
  slowMs?: number;
};

export type ScenarioResult = { name: string; passed: boolean; detail: string };

type Sent = { status: number | null; ms: number; error: string | null };

export function isLocalUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(host);
  } catch {
    return false;
  }
}

async function post(url: string, body: string, signature: string | null): Promise<Sent> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== null) headers['X-Razorpay-Signature'] = signature;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5000),
    });
    return { status: res.status, ms: Date.now() - started, error: null };
  } catch (e) {
    return { status: null, ms: Date.now() - started, error: String(e) };
  }
}

// Fresh ids for every scenario, so scenarios don't interfere with each other.
function fresh(o: Options) {
  const at = now();
  const order = buildOrder({ amount: 50000, currency: 'INR' });
  if (o.orderId) order.id = o.orderId;
  order.status = 'paid';
  order.amount_paid = 50000;
  order.amount_due = 0;
  order.attempts = 1;
  const payment = buildPayment(order, 'success');
  if (o.paymentId) payment.id = o.paymentId;
  const wrap = (event: string, contains: string[], payload: object) =>
    JSON.stringify({
      entity: 'event', account_id: 'acc_emulator', event, contains, payload, created_at: at,
    });
  return {
    captured: wrap('payment.captured', ['payment'], { payment: { entity: payment } }),
    paid: wrap('order.paid', ['payment', 'order'], {
      payment: { entity: payment },
      order: { entity: order },
    }),
  };
}

const is2xx = (s: number | null) => s !== null && s >= 200 && s < 300;
const is4xx = (s: number | null) => s !== null && s >= 400 && s < 500;
const show = (r: Sent) =>
  r.status === null ? `no response (${r.error})` : `status ${r.status}`;

type Scenario = {
  name: string;
  run: (o: Options) => Promise<{ passed: boolean; detail: string }>;
};

const scenarios: Scenario[] = [
  {
    name: 'accepts a correctly signed webhook',
    async run(o) {
      const { captured } = fresh(o);
      const r = await post(o.url, captured, sign(captured, o.secret));
      return is2xx(r.status)
        ? { passed: true, detail: show(r) }
        : { passed: false, detail: `expected 2xx, got ${show(r)}` };
    },
  },
  {
    name: 'rejects a tampered signature',
    async run(o) {
      const { captured } = fresh(o);
      const r = await post(o.url, captured, sign(captured, 'not_the_real_secret'));
      if (is4xx(r.status)) return { passed: true, detail: show(r) };
      if (is2xx(r.status)) {
        return { passed: false, detail: `got ${show(r)}: a forged webhook was accepted` };
      }
      return { passed: false, detail: `expected 4xx, got ${show(r)}` };
    },
  },
  {
    name: 'rejects a missing signature',
    async run(o) {
      const { captured } = fresh(o);
      const r = await post(o.url, captured, null);
      if (is4xx(r.status)) return { passed: true, detail: show(r) };
      if (is2xx(r.status)) {
        return { passed: false, detail: `got ${show(r)}: an unsigned webhook was accepted` };
      }
      return { passed: false, detail: `expected 4xx, got ${show(r)}` };
    },
  },
  {
    name: 'rejects a modified body',
    async run(o) {
      const { captured } = fresh(o);
      const signature = sign(captured, o.secret);
      const modified = captured.replace(/"amount":50000/g, '"amount":100');
      const r = await post(o.url, modified, signature);
      if (is4xx(r.status)) return { passed: true, detail: show(r) };
      if (is2xx(r.status)) {
        return { passed: false, detail: `got ${show(r)}: a changed body was accepted` };
      }
      return { passed: false, detail: `expected 4xx, got ${show(r)}` };
    },
  },
  {
    name: 'survives a duplicate delivery',
    async run(o) {
      const { captured } = fresh(o);
      const signature = sign(captured, o.secret);
      const first = await post(o.url, captured, signature);
      const second = await post(o.url, captured, signature);
      const ok = is2xx(first.status) && is2xx(second.status);
      return {
        passed: ok,
        detail: ok
          ? `${show(first)}, then ${show(second)}`
          : `expected 2xx twice, got ${show(first)} then ${show(second)}`,
      };
    },
  },
  {
    name: 'survives out-of-order delivery',
    async run(o) {
      const { captured, paid } = fresh(o);
      const first = await post(o.url, paid, sign(paid, o.secret));
      const second = await post(o.url, captured, sign(captured, o.secret));
      const ok = is2xx(first.status) && is2xx(second.status);
      return {
        passed: ok,
        detail: ok
          ? 'order.paid then payment.captured both accepted'
          : `expected 2xx twice, got ${show(first)} then ${show(second)}`,
      };
    },
  },
  {
    name: 'replies quickly',
    async run(o) {
      const limit = o.slowMs ?? 2000;
      const { captured } = fresh(o);
      const r = await post(o.url, captured, sign(captured, o.secret));
      if (!is2xx(r.status)) {
        return { passed: false, detail: `no valid reply to measure (${show(r)})` };
      }
      return r.ms <= limit
        ? { passed: true, detail: `${r.ms} ms` }
        : { passed: false, detail: `${r.ms} ms, limit is ${limit} ms` };
    },
  },
];

export async function runScenarios(o: Options): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    const r = await s.run(o);
    results.push({ name: s.name, ...r });
  }
  return results;
}