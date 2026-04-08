# @usfm-tools/editor

Headless [ProseMirror](https://prosemirror.net/) integration for editing scripture as **USJ** (paragraphs, verses, character styles, milestones, alignment-ready round-trips).

- **Schema** — `doc` → optional `header`, `chapter`+; blocks (`book`, `paragraph`, …); inline `verse`, `note`, `figure`, `milestone_inline`.
- **Serialization** — `usjDocumentToPm` / `pmDocumentToUsj` for USJ ↔ ProseMirror.
- **Alignment** — `stripAndLoad` / `serializeWithAlignments` bridge to `@usfm-tools/editor-core` (`stripAlignments`, `rebuildAlignedUsj`).
- **Docs** — See [`docs/20-alignment-layer.md`](../../docs/20-alignment-layer.md) and [`docs/18-editor-core.md`](../../docs/18-editor-core.md).

## Install

```bash
npm install @usfm-tools/editor @usfm-tools/editor-core @usfm-tools/types
```

Workspace: add the dependency and run `bun run build` at the repo root.

## Usage

```typescript
import { USFMParser } from '@usfm-tools/parser';
import { createUSFMEditorState, createUSFMEditorView, serializeToUSJ } from '@usfm-tools/editor';

const parser = new USFMParser();
parser.parse(`\\id MAT Matthew\n\\c 1\n\\p\n\\v 1 Hello.`);
const usj = parser.toJSON();

const state = createUSFMEditorState(usj);
const view = createUSFMEditorView(document.querySelector('#editor')!, state);

// Later:
const out = serializeToUSJ(view.state);
```

## Chrome (presentation presets)

Control **header label** (`none` | `text` | `icon`), **whether USFM marker glyphs** (`\id`, `\c`, `\h`, …) show in the UI, and **`\id` layout** (book `code` in a dedicated field vs flatter inline). Pass **`chrome`** into `createUSFMEditorState` and the same object into `createUSFMEditorView` so `data-usfm-chrome` / `data-usfm-glyphs` match the node views.

- **`resolveUSFMChrome`**, types **`USFMEditorChrome`**, **`ResolvedUSFMChrome`**
- Presets: **`default`** (verbose), **`minimal`** (content-focused: no header title row, no marker glyphs, split `\id`), **`developer`** (same as default)

Optional CSS: `import '@usfm-tools/editor/chrome.css'` (hides glyphs when `data-usfm-glyphs="false"`, styles for icon header and book-code field).

```typescript
import { createUSFMEditorState, createUSFMEditorView, resolveUSFMChrome } from '@usfm-tools/editor';

const chrome = { preset: 'minimal' as const };
const state = createUSFMEditorState(usj, { chrome });
const view = createUSFMEditorView(el, state, { chrome });
console.log(resolveUSFMChrome(chrome));
```

## License

MIT — see the [repository root LICENSE](../../LICENSE).
