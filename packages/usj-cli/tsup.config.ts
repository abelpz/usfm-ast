import { defineConfig } from 'tsup';

export default defineConfig([
  {
    tsconfig: './tsconfig.tsup.json',
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
  },
  {
    tsconfig: './tsconfig.tsup.json',
    entry: ['src/cli.ts'],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
    external: ['@usj-tools/core'],
  },
]);
