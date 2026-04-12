# Editor UI toolkit (`@usfm-tools/editor-ui`)

This package holds **browser UI** for the ProseMirror USFM editor: gutter, block menu, marker palette, floating selection bubble, and the sync conflict review panel. It is **not** a full app shell; [`@usfm-tools/editor-app`](../../packages/usfm-editor-app) composes it with layout, file open, and collaboration controls.

## Installation and styles

Add the dependency next to `@usfm-tools/editor` and `@usfm-tools/editor-core`. For USJ/USFM/USX helpers used by sessions and export, add [`@usfm-tools/editor-adapters`](./27-editor-adapters.md). Import the editor document chrome from `@usfm-tools/editor/chrome.css` (and optional theme packages), then add WYSIWYG chrome styles:

```ts
import '@usfm-tools/editor/chrome.css';
import '@usfm-tools/editor-ui/chrome-ui.css';
```

## `ScriptureSession` and `session.markers`

`attachWysiwygChrome` expects a live **`ScriptureSession`**. Marker lists, structural insertions, and section detection use **`session.markers`** (`MarkerRegistry`), not ad hoc calls to `getMarkerChoicesForMode`. That keeps custom registries and modes consistent between the palette, gutter, and bubble.

## Presentation layer

Built-in docs-style labels and icons come from **`createDocsPresentationLayer(registry)`**, which uses `registry.getChoicesForMode` for human-readable names in Basic/Medium modes.

- **`PresentationLayer`**: optional overrides (labels, menu categories, icons, palette copy, gutter handle SVG).
- **`mergePresentationLayer(base, overlay)`**: combine the docs layer with product-specific tweaks.

Pass the merged layer as **`presentation`** in `attachWysiwygChrome` options if you need localization or branding.

## Main APIs

| Export | Role |
| ------ | ---- |
| `attachWysiwygChrome` | Mount gutter, menus, palette, bubble; returns `dispose` and `openMarkerPalette`. |
| `buildWysiwygBubbleContext` | Selection context for showing/hiding bubble actions (e.g. hide inside notes). |
| `readEditorMode` / `writeEditorMode` | `localStorage` helpers for Basic / Medium / Advanced. |
| `mountConflictReview` | Render `SyncResult.conflicts` into a container; optional resolve/dismiss callbacks. |
| `positionFixedLayer`, `virtualRefFromRect` | Floating UI helpers used by the chrome (Floating UI + DOM). |

## Testing

Package tests live under `packages/usfm-editor-ui/tests/` (Jest, jsdom). Run via the package `test` script (builds upstream workspace packages first so types resolve).

## See also

- [Marker registry](./24-marker-registry.md) — pluggable `MarkerRegistry` on `ScriptureSession`.
- [Theming](./26-theming.md) — document chrome variables and `@usfm-tools/editor-themes`.
