import { defineConfig } from 'tsup';

export default defineConfig({
  tsconfig: './tsconfig.tsup.json',
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@usfm-tools/editor',
    '@usfm-tools/editor-core',
    'prosemirror-state',
    'prosemirror-view',
    '@floating-ui/dom',
  ],
});
