import express from 'express';
import { WebhookDispatcher } from './webhooks';
import { buildOrder, buildPayment } from './entities';
import type { Order, Payment } from './entities';

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

  const webhooks = new WebhookDispatcher();

  app.post('/_emulator/webhooks', (req, res) => {
    const { url, secret } = req.body ?? {};
    if (typeof url !== 'string' || typeof secret !== 'string') {
      return res.status(400).json({ error: 'url and secret are required' });
    }
    webhooks.config = { url, secret };
    res.json({ ok: true });
  });

  app.get('/_emulator/webhooks/log', (_req, res) => {
    res.json(webhooks.log);
  });

  app.post('/_emulator/webhooks/chaos', (req, res) => {
    const b = req.body ?? {};
    const c = webhooks.chaos;
    if (b.duplicate !== undefined) {
      if (!Number.isInteger(b.duplicate) || b.duplicate < 0 || b.duplicate > 10) {
        return res.status(400).json({ error: 'duplicate must be an integer from 0 to 10' });
      }
      c.duplicate = b.duplicate;
    }
    if (b.delayMs !== undefined) {
      if (!Number.isInteger(b.delayMs) || b.delayMs < 0 || b.delayMs > 60000) {
        return res.status(400).json({ error: 'delayMs must be an integer from 0 to 60000' });
      }
      c.delayMs = b.delayMs;
    }
    if (b.drop !== undefined) c.drop = Boolean(b.drop);
    if (b.reverse !== undefined) c.reverse = Boolean(b.reverse);
    res.json(c);
  });

  app.post('/_emulator/webhooks/chaos/reset', (_req, res) => {
    webhooks.resetChaos();
    res.json(webhooks.chaos);
  });

  app.post('/_emulator/webhooks/replay/:id', async (req, res) => {
    const ok = await webhooks.replay(req.params.id);
    if (!ok) return res.status(404).json({ error: 'unknown event id' });
    res.json({ ok: true });
  });

  // Emulator-only controls (not part of the real Razorpay API, no login needed).
  app.post('/_emulator/orders/:id/pay', async (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    if (order.status === 'paid') {
      return res.status(400).json({ error: 'order is already paid' });
    }
    const failed = req.body?.outcome === 'fail';

    const payment = buildPayment(order, failed ? 'fail' : 'success');
    payments.set(payment.id, payment);

    order.attempts += 1;
    if (failed) {
      order.status = 'attempted';
    } else {
      order.amount_paid = order.amount;
      order.amount_due = 0;
      order.status = 'paid';
    }

    if (failed) {
      await webhooks.sendAll([
        { event: 'payment.failed', contains: ['payment'], payload: { payment: { entity: payment } } },
      ]);
    } else {
      await webhooks.sendAll([
        { event: 'payment.captured', contains: ['payment'], payload: { payment: { entity: payment } } },
        { event: 'order.paid', contains: ['payment', 'order'], payload: { payment: { entity: payment }, order: { entity: order } } },
      ]);
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
    const order = buildOrder({ amount, currency, receipt, notes });
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