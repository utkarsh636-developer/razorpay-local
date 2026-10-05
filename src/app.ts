import express from 'express';
import { randomBytes } from 'node:crypto';

type Order = {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  offer_id: null;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: unknown;
  created_at: number;
};

type Payment = {
  id: string;
  entity: 'payment';
  amount: number;
  currency: string;
  status: 'captured' | 'failed';
  order_id: string;
  captured: boolean;
  method: string;
  error_code: string | null;
  error_description: string | null;
  created_at: number;
};

const newId = (prefix: string) => prefix + '_' + randomBytes(7).toString('hex');
const now = () => Math.floor(Date.now() / 1000);

function errorBody(description: string) {
  return {
    error: {
      code: 'BAD_REQUEST_ERROR',
      description,
      source: 'NA',
      step: 'NA',
      reason: 'NA',
      metadata: {},
    },
  };
}

export function createApp() {
  const app = express();
  app.use(express.json());

  const orders = new Map<string, Order>();
  const payments = new Map<string, Payment>();

  // Emulator-only controls (not part of the real Razorpay API, no login needed).
  app.post('/_emulator/orders/:id/pay', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    if (order.status === 'paid') {
      return res.status(400).json({ error: 'order is already paid' });
    }
    const failed = req.body?.outcome === 'fail';

    const payment: Payment = {
      id: newId('pay'),
      entity: 'payment',
      amount: order.amount,
      currency: order.currency,
      status: failed ? 'failed' : 'captured',
      order_id: order.id,
      captured: !failed,
      method: 'card',
      error_code: failed ? 'BAD_REQUEST_ERROR' : null,
      error_description: failed ? 'Payment failed (simulated by emulator)' : null,
      created_at: now(),
    };
    payments.set(payment.id, payment);

    order.attempts += 1;
    if (failed) {
      order.status = 'attempted';
    } else {
      order.amount_paid = order.amount;
      order.amount_due = 0;
      order.status = 'paid';
    }
    res.json({ payment, order });
  });

  // Real Razorpay API: needs a Basic auth header.
  app.use('/v1', (req, res, next) => {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Basic ')) {
      return res.status(401).json(errorBody('Authentication failed'));
    }
    next();
  });

  app.post('/v1/orders', (req, res) => {
    const { amount, currency, receipt, notes } = req.body ?? {};
    if (!Number.isInteger(amount) || amount < 100) {
      return res.status(400).json(errorBody('Invalid amount'));
    }
    if (typeof currency !== 'string') {
      return res.status(400).json(errorBody('The currency field is required.'));
    }
    const order: Order = {
      id: newId('order'),
      entity: 'order',
      amount,
      amount_paid: 0,
      amount_due: amount,
      currency,
      receipt: receipt ?? null,
      offer_id: null,
      status: 'created',
      attempts: 0,
      notes: notes ?? [],
      created_at: now(),
    };
    orders.set(order.id, order);
    res.json(order);
  });

  app.get('/v1/orders/:id/payments', (req, res) => {
    if (!orders.has(req.params.id)) {
      return res.status(400).json(errorBody('The id provided does not exist'));
    }
    const items = [...payments.values()].filter((p) => p.order_id === req.params.id);
    res.json({ entity: 'collection', count: items.length, items });
  });

  app.get('/v1/orders/:id', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) {
      return res.status(400).json(errorBody('The id provided does not exist'));
    }
    res.json(order);
  });

  app.get('/v1/orders', (_req, res) => {
    const items = [...orders.values()];
    res.json({ entity: 'collection', count: items.length, items });
  });

  app.get('/v1/payments/:id', (req, res) => {
    const payment = payments.get(req.params.id);
    if (!payment) {
      return res.status(400).json(errorBody('The id provided does not exist'));
    }
    res.json(payment);
  });

  return app;
}