# Editor SDK overview (layered packages)

The scripture editor stack is split so apps can depend only on what they need. Lower layers avoid UI; higher layers add chrome and sample wiring.

| Package | Role |
| ------- | ---- |
| [`@usfm-tools/types`](../../packages/shared-types) | Shared USJ / alignment TypeScript types. |
| [`@usfm-tools/parser`](../../packages/usfm-parser) | USFM → USJ (`USFMParser`, `toJSON()`). |
| [`@usfm-tools/adapters`](../../packages/usfm-adapters) | Full visitors, USJ ↔ USFM, USX round-trips. |
| [`@usfm-tools/editor-adapters`](../../packages/usfm-editor-adapters) | Narrow re-exports for editor workflows ([details](./27-editor-adapters.md)). |
| [`@usfm-tools/editor-core`](../../packages/usfm-editor-core) | Chapter-scoped USJ, operations, sync, collab — **no ProseMirror** ([intro](./18-editor-core.md), [extensibility](./23-editor-core-extensibility.md)). |
| [`@usfm-tools/editor-themes`](../../packages/usfm-editor-themes) | Chrome tokens, `markers.css`, theme helpers ([theming](./26-theming.md)). |
| [`@usfm-tools/editor`](../../packages/usfm-editor) | ProseMirror schema, `ScriptureSession`, plugins ([marker registry](./24-marker-registry.md)). |
| [`@usfm-tools/editor-ui`](../../packages/usfm-editor-ui) | WYSIWYG gutter, palette, bubble, conflict panel ([toolkit](./25-editor-ui-toolkit.md)). |
| [`@usfm-tools/editor-app`](../../packages/usfm-editor-app) | Private demo shell (private package in-repo). |

**Tests:** `turbo run test` runs **`^build`** (dependency builds) before each package’s tests. Root **`bun run test:integration`** (and CI after full build) runs [`tests/integration`](../tests/README.md).

**Formatting:** Prettier / ESLint apply to `packages/*`; follow existing import and export style when extending a layer.
