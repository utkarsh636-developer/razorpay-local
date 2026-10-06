import http from 'node:http';
import Razorpay from 'razorpay';

const mode = process.argv[2] === 'bad' ? 'bad' : 'good';
const secret = 'whsec_demo';

http
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
        ok = (Razorpay as any).validateWebhookSignature(body, sig, secret);
      } catch {
        ok = false;
      }
      res.statusCode = ok ? 200 : 400;
      res.end(ok ? 'ok' : 'bad signature');
    });
  })
  .listen(3000, () => console.log(`demo receiver (${mode}) on http://localhost:3000`));