import { defineConfig } from 'tsup';

// Type declarations are emitted by tsc (see tsconfig.build.json), because
// tsup's bundled dts plugin does not work with TypeScript 7.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    target: 'node22',
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    target: 'node22',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
