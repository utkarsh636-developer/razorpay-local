import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Razorpay from 'razorpay';
import { runScenarios, isLocalUrl } from '../src/scenarios';

const SECRET = 'whsec_runner';
const servers: http.Server[] = [];

function startReceiver(mode: 'good' | 'bad'): Promise<string> {
  return new Promise((resolve) => {
    const server = http
      .createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          if (mode === 'bad') {
            res.statusCode = 200;
            return res.end('ok');
          }
          const body = Buffer.concat(chunks).toString();
          const sig = String(req.headers['x-razorpay-signature'] ?? '');
          let ok = false;
          try {
            ok = (Razorpay as any).validateWebhookSignature(body, sig, SECRET);
          } catch {
            ok = false;
          }
          res.statusCode = ok ? 200 : 400;
          res.end(ok ? 'ok' : 'bad signature');
        });
      })
      .listen(0, () => {
        servers.push(server);
        resolve(`http://localhost:${(server.address() as AddressInfo).port}/hook`);
      });
  });
}

afterAll(() => {
  servers.forEach((s) => s.close());
});

describe('test runner', () => {
  it('passes every check for a handler that verifies signatures', async () => {
    const url = await startReceiver('good');
    const results = await runScenarios({ url, secret: SECRET });
    for (const r of results) expect(r.passed, `${r.name}: ${r.detail}`).toBe(true);
  });

  it('flags a handler that accepts everything', async () => {
    const url = await startReceiver('bad');
    const results = await runScenarios({ url, secret: SECRET });
    const failed = results.filter((r) => !r.passed).map((r) => r.name);
    expect(failed.sort()).toEqual([
      'rejects a missing signature',
      'rejects a modified body',
      'rejects a tampered signature',
    ]);
  });

  it('only treats local addresses as local', () => {
    expect(isLocalUrl('http://localhost:3000/hook')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:3000/hook')).toBe(true);
    expect(isLocalUrl('https://myshop.com/hook')).toBe(false);
  });
});