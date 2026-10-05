import { createHmac, randomBytes } from 'node:crypto';

export type WebhookConfig = { url: string; secret: string };

export type DeliveryRecord = {
  id: string;
  event: string;
  url: string;
  status: number | null;
  error: string | null;
  at: number;
};

export function sign(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export class WebhookDispatcher {
  config: WebhookConfig | null = null;
  log: DeliveryRecord[] = [];

  async send(
    event: string,
    contains: string[],
    payload: Record<string, unknown>
  ) {
    if (!this.config) return;
    const { url, secret } = this.config;
    const id = 'evt_' + randomBytes(7).toString('hex');
    const at = Math.floor(Date.now() / 1000);

    const body = JSON.stringify({
      entity: 'event',
      account_id: 'acc_emulator',
      event,
      contains,
      payload,
      created_at: at,
    });

    const record: DeliveryRecord = { id, event, url, status: null, error: null, at };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Razorpay-Signature': sign(body, secret),
          'X-Razorpay-Event-Id': id,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      record.status = res.status;
    } catch (e) {
      record.error = String(e);
    }
    this.log.push(record);
  }
}