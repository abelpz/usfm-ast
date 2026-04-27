import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const usfmReadonlySrc = path.resolve(__dirname, '../usfm-readonly-react');
const usfmParserRoot = path.resolve(__dirname, '../usfm-parser');

/** Resolve installed `@usfm-tools/*` from this app (hoisted). Fallback: sibling package dirs. */
function resolveUsfmToolsPackage(pkg: '@usfm-tools/usj-core' | '@usfm-tools/parser'): string {
  try {
    return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [__dirname] }));
  } catch {
    const sub = pkg === '@usfm-tools/usj-core' ? 'usfm-usj-core' : 'usfm-parser';
    return path.resolve(__dirname, '..', sub);
  }
}

/**
 * @usfm-tools/usj-core and @usfm-tools/parser ship CJS in dist but their
 * package.json "exports"."import" points at those files. Vite can treat them as
 * native ESM and the browser hits `exports is not defined`. Force pre-bundle +
 * interop in dev; Rollup still needs CJS handling for production.
 *
 * **Dev only:** alias `@usfm-tools/usfm-readonly-react` → `src/` so edits apply without
 * rebuilding `dist/`. **Build** must use the real package (`exports` → `dist/`) so
 * `@usfm-tools/*` resolve from the demo app’s `node_modules` tree.
 */
export default defineConfig(({ command }) => {
  const isServe = command === 'serve';

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['@usfm-tools/usj-core', '@usfm-tools/parser'],
      ...(isServe
        ? {
            alias: {
              '@usfm-tools/usj-core': resolveUsfmToolsPackage('@usfm-tools/usj-core'),
              '@usfm-tools/parser': resolveUsfmToolsPackage('@usfm-tools/parser'),
              '@usfm-tools/usfm-readonly-react/styles.css': path.join(usfmReadonlySrc, 'src', 'default.css'),
              '@usfm-tools/usfm-readonly-react': path.join(usfmReadonlySrc, 'src', 'index.ts'),
            },
          }
        : {}),
    },
    server: {
      port: 4180,
      open: true,
      fs: {
        allow: [
          path.resolve(__dirname, '..'),
          usfmReadonlySrc,
          usfmParserRoot,
          resolveUsfmToolsPackage('@usfm-tools/usj-core'),
          resolveUsfmToolsPackage('@usfm-tools/parser'),
          (() => {
            try {
              return path.dirname(
                require.resolve('@usfm-tools/editor-themes/package.json', { paths: [__dirname] }),
              );
            } catch {
              return path.resolve(__dirname, '../usfm-editor-themes');
            }
          })(),
        ],
      },
    },
    optimizeDeps: {
      include: ['@usfm-tools/usj-core', '@usfm-tools/parser'],
      needsInterop: ['@usfm-tools/usj-core', '@usfm-tools/parser'],
    },
    build: {
      commonjsOptions: {
        include: [/node_modules/, /@usfm-tools\/usj-core/, /@usfm-tools\/parser/],
      },
    },
  };
});
