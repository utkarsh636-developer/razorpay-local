import { createApp } from './app';
import { runScenarios, isLocalUrl } from './scenarios';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function usage() {
  console.log(
    'Usage:\n' +
      '  razorpay-local start [--port 4000] [--host 127.0.0.1]\n' +
      '  razorpay-local test --url <webhook url> --secret <webhook secret>\n' +
      '                      [--order-id <id>] [--payment-id <id>] [--allow-remote]'
  );
}

async function main() {
  const command = process.argv[2];

  if (command === 'start') {
    const port = Number(arg('port') ?? 4000);
    const host = arg('host') ?? '127.0.0.1';
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.log('Invalid --port');
      process.exit(2);
    }
    createApp().listen(port, host, () => {
      console.log(`razorpay-local emulator running on http://${host}:${port}`);
    });
    return;
  }

  if (command !== 'test') {
    usage();
    process.exit(2);
  }
  
  const url = arg('url');
  const secret = arg('secret');
  if (!url || !secret) {
    usage();
    process.exit(2);
  }
  if (!isLocalUrl(url) && !process.argv.includes('--allow-remote')) {
    console.log(
      'Refusing to test a non-local URL. This tool sends fake payment events, ' +
        'so run it against a local or test server only. Use --allow-remote to override.'
    );
    process.exit(2);
  }

  console.log(`Testing webhook handler at ${url}\n`);
  const results = await runScenarios({
    url,
    secret,
    orderId: arg('order-id'),
    paymentId: arg('payment-id'),
  });

  for (const r of results) {
    console.log(`${r.passed ? '✓' : '✗'} ${r.name}`);
    if (!r.passed) console.log(`    ${r.detail}`);
  }
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();