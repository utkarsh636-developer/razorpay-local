import { createHmac, randomBytes } from 'node:crypto';

export type WebhookConfig = { url: string; secret: string };

export type ChaosConfig = {
  duplicate: number; // extra copies of each event
  delayMs: number; // wait before delivering
  drop: boolean; // never deliver
  reverse: boolean; // send events in reverse order
};

export type OutEvent = {
  event: string;
  contains: string[];
  payload: Record<string, unknown>;
};

export type DeliveryRecord = {
  id: string;
  event: string;
  url: string;
  attempt: number;
  dropped: boolean;
  status: number | null;
  error: string | null;
  at: number;
};

export function sign(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

const noChaos = (): ChaosConfig => ({
  duplicate: 0,
  delayMs: 0,
  drop: false,
  reverse: false,
});

export class WebhookDispatcher {
  config: WebhookConfig | null = null;
  chaos: ChaosConfig = noChaos();
  log: DeliveryRecord[] = [];
  private bodies = new Map<string, string>();

  resetChaos() {
    this.chaos = noChaos();
  }

  async sendAll(events: OutEvent[]) {
    const config = this.config;
    if (!config) return;
    const ordered = this.chaos.reverse ? [...events].reverse() : events;

    for (const e of ordered) {
      const id = 'evt_' + randomBytes(7).toString('hex');
      const at = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        entity: 'event',
        account_id: 'acc_emulator',
        event: e.event,
        contains: e.contains,
        payload: e.payload,
        created_at: at,
      });
      this.bodies.set(id, body);

      if (this.chaos.drop) {
        this.log.push({
          id, event: e.event, url: config.url, attempt: 0,
          dropped: true, status: null, error: null, at,
        });
        continue;
      }

      const copies = 1 + this.chaos.duplicate;
      const run = async () => {
        for (let attempt = 1; attempt <= copies; attempt++) {
          await this.deliver(id, e.event, attempt);
        }
      };

      if (this.chaos.delayMs > 0) {
        setTimeout(run, this.chaos.delayMs);
      } else {
        await run();
      }
    }
  }

  async replay(id: string) {
    if (!this.bodies.has(id)) return false;
    const previous = this.log.filter((r) => r.id === id);
    const attempt = previous.filter((r) => !r.dropped).length + 1;
    await this.deliver(id, previous[0]?.event ?? 'unknown', attempt);
    return true;
  }

  private async deliver(id: string, event: string, attempt: number) {
    const config = this.config;
    const body = this.bodies.get(id);
    if (!config || !body) return;

    const record: DeliveryRecord = {
      id, event, url: config.url, attempt, dropped: false,
      status: null, error: null, at: Math.floor(Date.now() / 1000),
    };
    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Razorpay-Signature': sign(body, config.secret),
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