# `@usfm-tools/usfm-readonly-react`

Read-only **USFM → React** view under **`@usfm-tools`**. It follows the same **segment pipeline** as the conflict UI in this repo’s `usfm-editor-app` (`UsfmChapterDiffView` / `collectSegments`), but **does not** mount ProseMirror `EditorView`.

## Demo app

Vite + React in [`../demo-usfm-readonly`](../demo-usfm-readonly/README.md). From the monorepo root:

```bash
bun install
bun run build --filter=@usfm-tools/usfm-readonly-react
bun run dev --filter=demo-usfm-readonly
```

## Install / build (this package only)

```bash
cd packages/usfm-readonly-react
bun install
bun run build
```

Dependencies `@usfm-tools/parser` and `@usfm-tools/usj-core` resolve via **`workspace:*`** in this monorepo.

## Use in an app

```tsx
import { UsfmReadonlyView } from '@usfm-tools/usfm-readonly-react';
import '@usfm-tools/usfm-readonly-react/styles.css';

const usfm = String.raw`\\id MAT
\\c 1
\\p
\\v 1 Libro de la genealogía de Jesucristo…`;

export function Reader() {
  return (
    <UsfmReadonlyView
      usfm={usfm}
      chapter={1}
      stripAlignment
      aria-label="Mateo capítulo 1"
      onVerseClick={(n) => console.log('verse', n)}
      onWordClick={({ word, verseNum, bookCode }) => console.log({ word, verseNum, bookCode })}
      onSelectionChange={(sel) =>
        sel ? console.log(sel.text, sel.bookCode, sel.chapter, sel.verseStart, sel.verseEnd) : console.log('cleared')
      }
    />
  );
}
```

Use `stripAlignment={false}` when you need alignment milestones preserved in USJ (same flag applies to both `usfm` parsing and `usj` normalization).

### API

| Export | Role |
|--------|------|
| `UsfmReadonlyView` | Renders one `chapter` of `usfm` or `usj`. |
| `stripAlignment` prop | Default strips alignment milestones (`stripAlignments`). Set `stripAlignment={false}` to keep them (or use `parseOptions.stripAlignment` when only parsing from `usfm`). |
| `onWordClick` | Fires on each **word token** (whitespace-split surface in `text` / headings / `\\w`); each token is a `span.usfm-tok` with `data-word-index` (1-based in verse) and `data-occurrence` (1-based repeat count for that exact string in the verse). Payload: `word`, `bookCode`, `chapter`, `verseNum`, `wordIndexInVerse`, `occurrenceInVerse`, `event`. |
| `onSelectionChange` | Debounced; `null` when selection leaves the widget or collapses; otherwise `ScriptureSelectionRef`: `text`, `bookCode`, `chapter`, `verseStart`, `verseEnd`. |
| `scriptureSelectionFromDom` | Helper if you wire selection yourself (pass root `HTMLElement`, book, chapter). |
| `parseUsfmToUsj` | Parse + optional `stripAlignments` (default on). |
| `collectSegments` | Flat `RenderSegment[]` from USJ nodes (advanced layouts). |
| `splitUsjByChapter`, `ChapterSlice` | From `@usfm-tools/usj-core` (re-exported). |

## Bundling (Vite / Rollup)

`@usfm-tools/parser` and `@usfm-tools/usj-core` ship as CommonJS `exports` without reliable ESM named re-exports. This package uses a tiny **`cjsNamed()`** helper (`src/interop.ts`) with `import * as ns` so production bundles (e.g. Vite `build`) resolve correctly.

## Theming

Default CSS lives in `styles.css` (`dist/default.css` after build). For a look closer to **usfm-editor-app**, you can also load styles from `@usfm-tools/editor-themes` in the host app if you depend on that package.

## License

MIT. Segment collection derives from `usfm-editor-app` / `usfm-diff-logic.ts` (same license family in this repo).
