# Theming the scripture editor (`@usfm-tools/editor-themes`)

## Imports

- **Full chrome** (recommended): `import '@usfm-tools/editor/chrome.css'`
- **Split**: `import '@usfm-tools/editor-themes/base.css'` and `import '@usfm-tools/editor-themes/markers.css'` if you replace marker styling entirely.

## Presets and `data-usfm-theme`

`resolveUSFMChrome()` (from `@usfm-tools/editor` or `@usfm-tools/editor-themes`) merges **presets** (`default`, `minimal`, `developer`) with overrides. The resolved `theme` is applied as `data-usfm-theme` on the ProseMirror root.

Built-in values: `dark`, `document`, `document-dark`. The type also allows **any string** so you can add custom themes:

```ts
const chrome = resolveUSFMChrome({ preset: 'default', theme: 'acme' });
```

Pair that with CSS such as:

```css
.ProseMirror[data-usfm-theme='acme'] {
  --usfm-accent: #c026d3;
  --usfm-bg: #faf5ff;
}
```

See [`packages/usfm-editor-themes/TOKENS.md`](../packages/usfm-editor-themes/TOKENS.md) for token names.

## Regenerating marker CSS

`markers.css` is generated from `packages/usfm-editor-themes/data/usfm.sty`:

```bash
node packages/usfm-editor-themes/scripts/generate.mjs
```

Or from the repo root:

```bash
node scripts/generate-marker-css.mjs
```

The `@usfm-tools/editor-themes` package runs this step in `bun run build`.
