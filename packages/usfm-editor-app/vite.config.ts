import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoPackages = path.resolve(__dirname, '..');

/**
 * Tauri plugin packages are installed in this package's own node_modules.
 * When Vite processes workspace-aliased source files from `platform-adapters`,
 * it resolves dynamic imports relative to those files' directories — which
 * cannot reach `usfm-editor-app/node_modules`. Explicit aliases fix this by
 * anchoring every `@tauri-apps/*` import to the known install location.
 */
const tauriPluginAliases = {
  '@tauri-apps/api': path.resolve(__dirname, 'node_modules/@tauri-apps/api'),
  '@tauri-apps/plugin-dialog': path.resolve(__dirname, 'node_modules/@tauri-apps/plugin-dialog'),
  '@tauri-apps/plugin-fs': path.resolve(__dirname, 'node_modules/@tauri-apps/plugin-fs'),
  '@tauri-apps/plugin-notification': path.resolve(__dirname, 'node_modules/@tauri-apps/plugin-notification'),
  '@tauri-apps/plugin-shell': path.resolve(__dirname, 'node_modules/@tauri-apps/plugin-shell'),
  '@tauri-apps/plugin-store': path.resolve(__dirname, 'node_modules/@tauri-apps/plugin-store'),
  '@tauri-apps/plugin-updater': path.resolve(__dirname, 'node_modules/@tauri-apps/plugin-updater'),
} as const;

const workspaceSrcAliases = {
  '@usfm-tools/adapters': path.resolve(repoPackages, 'usfm-adapters/src/index.ts'),
  '@usfm-tools/checking': path.resolve(repoPackages, 'usfm-editor-checking/src/index.ts'),
  '@usfm-tools/door43-rest': path.resolve(repoPackages, 'usfm-door43-rest/src/index.ts'),
  '@usfm-tools/editor-adapters': path.resolve(repoPackages, 'usfm-editor-adapters/src/index.ts'),
  '@usfm-tools/parser': path.resolve(repoPackages, 'usfm-parser/src/index.ts'),
  '@usfm-tools/platform-adapters/web': path.resolve(repoPackages, 'platform-adapters/src/web/index.ts'),
  '@usfm-tools/platform-adapters/tauri': path.resolve(repoPackages, 'platform-adapters/src/tauri/index.ts'),
  '@usfm-tools/platform-adapters': path.resolve(repoPackages, 'platform-adapters/src/index.ts'),
  '@usfm-tools/project-formats': path.resolve(repoPackages, 'usfm-editor-project-formats/src/index.ts'),
  '@usfm-tools/types': path.resolve(repoPackages, 'shared-types/src/index.ts'),
  '@usfm-tools/editor/chrome.css': path.resolve(repoPackages, 'usfm-editor/chrome.css'),
  '@usfm-tools/editor-ui/chrome-ui.css': path.resolve(repoPackages, 'usfm-editor-ui/chrome-ui.css'),
  '@usfm-tools/editor-themes/base.css': path.resolve(repoPackages, 'usfm-editor-themes/base.css'),
  '@usfm-tools/editor-themes/markers.css': path.resolve(repoPackages, 'usfm-editor-themes/markers.css'),
  '@usfm-tools/editor': path.resolve(repoPackages, 'usfm-editor/src/index.ts'),
  '@usfm-tools/editor-ui': path.resolve(repoPackages, 'usfm-editor-ui/src/index.ts'),
  '@usfm-tools/editor-core': path.resolve(repoPackages, 'usfm-editor-core/src/index.ts'),
  '@usfm-tools/help-markdown': path.resolve(repoPackages, 'help-markdown/src/index.ts'),
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
        ...tauriPluginAliases,
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
      strictPort: true,
      fs: {
        allow: [repoPackages, path.resolve(repoPackages, '..')],
      },
    },
  };
});
