import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoPackages = path.resolve(__dirname, '..');

const workspaceSrcAliases = {
  '@usfm-tools/adapters': path.resolve(repoPackages, 'usfm-adapters/src/index.ts'),
  '@usfm-tools/editor-adapters': path.resolve(repoPackages, 'usfm-editor-adapters/src/index.ts'),
  '@usfm-tools/parser': path.resolve(repoPackages, 'usfm-parser/src/index.ts'),
  '@usfm-tools/types': path.resolve(repoPackages, 'shared-types/src/index.ts'),
  '@usfm-tools/editor/chrome.css': path.resolve(repoPackages, 'usfm-editor/chrome.css'),
  '@usfm-tools/editor-ui/chrome-ui.css': path.resolve(repoPackages, 'usfm-editor-ui/chrome-ui.css'),
  '@usfm-tools/editor-themes/base.css': path.resolve(repoPackages, 'usfm-editor-themes/base.css'),
  '@usfm-tools/editor-themes/markers.css': path.resolve(repoPackages, 'usfm-editor-themes/markers.css'),
  '@usfm-tools/editor': path.resolve(repoPackages, 'usfm-editor/src/index.ts'),
  '@usfm-tools/editor-ui': path.resolve(repoPackages, 'usfm-editor-ui/src/index.ts'),
  '@usfm-tools/editor-core': path.resolve(repoPackages, 'usfm-editor-core/src/index.ts'),
  '@usfm-tools/formatter': path.resolve(repoPackages, 'usfm-formatter/src/index.ts'),
} as const;

const workspacePackages = Object.keys(workspaceSrcAliases);

const prosemirrorDeps = [
  'prosemirror-model',
  'prosemirror-state',
  'prosemirror-view',
  'prosemirror-transform',
  'prosemirror-commands',
  'prosemirror-keymap',
  'prosemirror-history',
  'prosemirror-inputrules',
] as const;

export default defineConfig(({ command }) => {
  /** Use TS sources for workspace packages in dev and prod so Rollup gets ESM (CJS `dist` lacks static named exports). */
  const useWorkspaceSource = true;

  return {
    root: '.',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        ...(useWorkspaceSource ? workspaceSrcAliases : {}),
      },
      dedupe: [...prosemirrorDeps],
    },
    optimizeDeps:
      command === 'serve'
        ? {
            exclude: [...workspacePackages, ...prosemirrorDeps],
          }
        : {
            include: [
              '@usfm-tools/parser',
              '@usfm-tools/editor-adapters',
              '@usfm-tools/editor',
              '@usfm-tools/editor-themes',
              '@usfm-tools/editor-ui',
              '@usfm-tools/editor-core',
            ],
          },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      port: 5180,
      fs: {
        allow: [repoPackages, path.resolve(repoPackages, '..')],
      },
    },
  };
});
