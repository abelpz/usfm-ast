import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoPackages = path.resolve(__dirname, '..');

const workspaceSrcAliases = {
  '@usfm-tools/adapters': path.resolve(repoPackages, 'usfm-adapters/src/index.ts'),
  '@usfm-tools/parser': path.resolve(repoPackages, 'usfm-parser/src/index.ts'),
  '@usfm-tools/types': path.resolve(repoPackages, 'shared-types/src/index.ts'),
  /** Before `@usfm-tools/editor` so resolution does not treat `/chrome.css` as under the JS entry. */
  '@usfm-tools/editor/chrome.css': path.resolve(repoPackages, 'usfm-editor/chrome.css'),
  '@usfm-tools/editor': path.resolve(repoPackages, 'usfm-editor/src/index.ts'),
  '@usfm-tools/editor-core': path.resolve(repoPackages, 'usfm-editor-core/src/index.ts'),
  '@usfm-tools/formatter': path.resolve(repoPackages, 'usfm-formatter/src/index.ts'),
} as const;

const workspacePackages = Object.keys(workspaceSrcAliases);

export default defineConfig(({ command }) => {
  const useWorkspaceSource = command === 'serve';

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

  return {
    root: '.',
    resolve: {
      alias: useWorkspaceSource ? { ...workspaceSrcAliases } : {},
      // One copy of ProseMirror packages — without this, Vite can bundle schema from a
      // different `prosemirror-model` than `prosemirror-view`, causing
      // `node.type.spec.toDOM is not a function` and a blank editor.
      dedupe: [...prosemirrorDeps],
    },
    optimizeDeps: useWorkspaceSource
      ? {
          // Source aliases for workspace packages; exclude them from prebundle so edits apply.
          // Exclude every `prosemirror-*` from Vite's dep scan prebundle: if `prosemirror-view` is
          // prebundled while `usfm-editor` (aliased) uses a different `prosemirror-model`
          // instance, rendering throws `node.type.spec.toDOM is not a function` and the editor is blank.
          exclude: [...workspacePackages, ...prosemirrorDeps],
        }
      : {
          include: [
            '@usfm-tools/parser',
            '@usfm-tools/adapters',
            '@usfm-tools/editor',
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
