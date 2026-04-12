import { defineConfig } from 'tsup';

export default defineConfig({
  tsconfig: './tsconfig.tsup.json',
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@usfm-tools/adapters', '@usfm-tools/editor-core', '@usfm-tools/parser'],
});
