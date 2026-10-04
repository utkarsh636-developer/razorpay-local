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

  // For now: just require a Basic auth header. Real key checking comes later.
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
      id: 'order_' + randomBytes(7).toString('hex'),
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
      created_at: Math.floor(Date.now() / 1000),
    };
    orders.set(order.id, order);
    res.json(order);
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

  return app;
}