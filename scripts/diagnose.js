// Usage (from D:\Projects\fake-razorpay):
//   node scripts/diagnose.js razorpay-a
const http = require('http');
const pkg = process.argv[2] || 'razorpay';

let version = 'unknown';
try { version = require(pkg + '/package.json').version; } catch {}

const mod = require(pkg);
const Razorpay = mod.default || mod;

const hits = [];
const server = http.createServer((req, res) => {
  hits.push(req.method + ' ' + req.url);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    id: 'order_x', entity: 'order', status: 'created', amount: 100,
  }));
});

function finish(note) {
  console.log('---');
  console.log('requests my server received:', hits);
  if (hits.length > 0) {
    console.log('VERDICT: request REACHED my fake server.', note || '');
  } else {
    console.log('VERDICT: request did NOT reach my fake server (it went elsewhere or hung).', note || '');
  }
  server.close();
  process.exit(0);
}

server.listen(4002, async () => {
  const rzp = new Razorpay({ key_id: 'rzp_test_x', key_secret: 'secret' });
  const rq = rzp.api && rzp.api.rq;

  console.log('package:', pkg, '| version:', version);
  console.log('api keys:', rzp.api && Object.keys(rzp.api));
  console.log('typeof rq:', typeof rq);
  console.log('typeof rq.defaults:', rq && typeof rq.defaults);
  console.log('rq keys:', rq && Object.keys(rq).slice(0, 15));

  if (rq && rq.defaults) {
    try {
      rq.defaults.baseURL = 'http://localhost:4002';
      console.log('set rq.defaults.baseURL');
    } catch (e) {
      console.log('could not set baseURL:', e.message);
    }
  } else {
    console.log('no rq.defaults found, nothing to set');
  }

  const timer = setTimeout(() => finish('(timed out after 4 seconds)'), 4000);

  try {
    const r = await rzp.orders.create({ amount: 100, currency: 'INR' });
    console.log('result:', r);
  } catch (e) {
    console.log('error:', e && (e.error || e.message || e));
  }
  clearTimeout(timer);
  finish();
});