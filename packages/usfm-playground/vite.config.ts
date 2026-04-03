import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoPackages = path.resolve(__dirname, '..');

/**
 * Workspace package roots → TypeScript entry (dev only). Lets edits to source trigger HMR without rebuilding `dist`.
 * `vite build` does not use these aliases — run `turbo run build --filter=@usfm-tools/parser` (or root `build`) so
 * `@usfm-tools/parser`’s `dist` matches source before a production playground build.
 */
const workspaceSrcAliases = {
  '@usfm-tools/adapters': path.resolve(repoPackages, 'usfm-adapters/src/index.ts'),
  '@usfm-tools/parser': path.resolve(repoPackages, 'usfm-parser/src/index.ts'),
  '@usfm-tools/formatter': path.resolve(repoPackages, 'usfm-formatter/src/index.ts'),
  '@usfm-tools/types': path.resolve(repoPackages, 'shared-types/src/index.ts'),
} as const;

const workspacePackages = Object.keys(workspaceSrcAliases);

export default defineConfig(({ command }) => {
  const useWorkspaceSource = command === 'serve';

  return {
    root: '.',
    resolve: {
      alias: useWorkspaceSource ? { ...workspaceSrcAliases } : {},
    },
    optimizeDeps: {
      // Dev: do not pre-bundle workspace libs to a single cached chunk — follow aliases to `.ts` so
      // changes invalidate and reload. Keep pre-bundle for CodeMirror only.
      include: useWorkspaceSource
        ? ['@codemirror/view', '@codemirror/state', '@codemirror/language']
        : [
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/language',
            '@usfm-tools/parser',
            '@usfm-tools/adapters',
          ],
      exclude: useWorkspaceSource ? [...workspacePackages] : [],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      port: 5179,
      fs: {
        allow: [repoPackages, path.resolve(repoPackages, '..')],
      },
    },
  };
});
