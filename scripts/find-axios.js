const names = ['razorpay-b', 'rzp-291', 'rzp-292', 'rzp-293', 'rzp-294', 'rzp-295', 'razorpay-c'];
for (const n of names) {
  const version = require(n + '/package.json').version;
  const mod = require(n);
  const R = mod.default || mod;
  const rzp = new R({ key_id: 'x', key_secret: 'y' });
  const rq = rzp.api && rzp.api.rq;
  const axios =
    rq && typeof rq.getUri === 'function' && rq.defaults && typeof rq.defaults === 'object';
  console.log(version, axios ? 'AXIOS (supported)' : 'old client (unsupported)');
}