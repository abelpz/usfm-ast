# `@usfm-tools/usfm-readonly-react`

Read-only **USFM / USJ → React** view under **`@usfm-tools`**. It follows the same **segment pipeline** as the conflict UI in this repo’s `usfm-editor-app` (`UsfmChapterDiffView` / `collectSegments`), but **does not** mount ProseMirror `EditorView`.

## Display gateway text (read-only)

The scripture pane is **read-only** (`contentEditable={false}`; no ProseMirror document).

When **`stripAlignment`** is on, we call **`stripAlignments()`** from `@usfm-tools/usj-core`. You can think of it as producing two things you care about here:

| Piece | Meaning in *this* package |
|-------|---------------------------|
| **Stripped USJ tree** | `\zaln-*` milestones removed and `\w` **unwrapped** into plain strings — the JSON we **render** as gateway scripture text. |
| **`alignments`** | Verse-keyed link groups (original-language ↔ gateway). Surfaced in **`onWordClick`** and selection **`wordTokens`** when present. |

This README and the component API only talk about **`UsjDocument`** plus **`AlignmentMap`**. Lower-level names inside `@usfm-tools/usj-core` / `@usfm-tools/types` stay inside those packages — you do not need them to use this library.

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
bun run test
```

Dependencies `@usfm-tools/parser`, `@usfm-tools/usj-core`, and **`@usfm-tools/types`** (alignment shapes) resolve via **`workspace:*`** in this monorepo.

**Optional peer:** `@usfm-tools/editor-themes` — not required at runtime; install it in your app if you want shared editor CSS (see Theming).

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
      onWordClick={(p) =>
        console.log(p.word, p.verseSid, p.gatewayTokenIndex, p.alignment?.originalWords)
      }
      onSelectionChange={(sel) =>
        sel
          ? console.log(sel.text, sel.wordTokens, sel.verseStart, sel.verseEnd)
          : console.log('cleared')
      }
    />
  );
}
```

Pass **`usj`** instead of **`usfm`** when you already have a `UsjDocument` (from `@usfm-tools/usj-core` or your own pipeline). Provide at most one of `usfm` or `usj`. If neither parses to a document, the component shows a short empty message.

### External chapter navigation

The component is **fully controlled**: set the `chapter` prop to navigate. Use the `onReady` callback to learn which chapters exist — it fires once whenever the document changes and provides everything needed to build prev/next controls without extra parsing or refs.

```tsx
import { useState } from 'react';
import { UsfmReadonlyView } from '@usfm-tools/usfm-readonly-react';

export function NavigableReader({ usfm }: { usfm: string }) {
  const [chapters, setChapters] = useState<readonly number[]>([]);
  const [chapter, setChapter]   = useState(1);

  const idx = chapters.indexOf(chapter);

  return (
    <>
      <UsfmReadonlyView
        usfm={usfm}
        chapter={chapter}
        onReady={({ chapters, bookCode }) => {
          setChapters(chapters);
          setChapter(chapters[0] ?? 1);
          console.log('book:', bookCode, 'chapters:', chapters.length);
        }}
      />

      <nav>
        <button disabled={idx <= 0}               onClick={() => setChapter(chapters[idx - 1])}>
          ‹ Prev
        </button>
        <span>{idx + 1} / {chapters.length}</span>
        <button disabled={idx >= chapters.length - 1} onClick={() => setChapter(chapters[idx + 1])}>
          Next ›
        </button>
      </nav>
    </>
  );
}
```

`onReady` also receives the parsed `usj` document. If you pass it back as the `usj` prop (instead of `usfm`), the component skips the internal parse step on subsequent renders:

```tsx
const [usj, setUsj] = useState<UsjDocument | null>(null);

<UsfmReadonlyView
  usj={usj}
  chapter={chapter}
  onReady={({ usj, chapters }) => {
    setUsj(usj);     // cache parsed doc — no re-parse on chapter change
    setChapters(chapters);
    setChapter(chapters[0] ?? 1);
  }}
/>
```

#### `UsfmReadonlyViewReadyPayload`

| Field | Type | Description |
|-------|------|-------------|
| `usj` | `UsjDocument` | Parsed document — pass back as `usj` prop to avoid re-parsing. |
| `bookCode` | `string` | Book identifier, e.g. `"MAT"`. |
| `chapters` | `readonly number[]` | Ordered chapter numbers (may be non-contiguous for partial files). |
| `chapterCount` | `number` | Same as `chapters.length`. |

### `UsfmReadonlyView` props

| Prop | Description |
|------|-------------|
| `usfm?` | USFM string; parsed with `parseUsfmToUsj` when `usj` is not set. |
| `usj?` | Pre-built USJ. When `stripAlignment` is not `false`, it is passed through **`stripAlignments`** → we render **display-ready gateway USJ** (see **Display gateway text (read-only)** above). |
| `chapter?` | Chapter number to show (default `1`). Fully controlled — update this prop to navigate. |
| `parseOptions?` | Passed into parsing when using `usfm`; currently supports `stripAlignment` (default strip on). |
| `stripAlignment?` | When set, overrides `parseOptions.stripAlignment` for both parse path and `usj` normalization. Default strips alignment milestones (`stripAlignments` from `usj-core`). Use `false` to keep them. |
| `className?` | Wrapper around the outer block. |
| `proseMirrorClassName?` | Class on the scripture root (default `"ProseMirror"`) so `@usfm-tools/editor-themes` selectors match the editor shell. Pass `""` to opt out. This package does not load ProseMirror JS. |
| `aria-label?` | Forwarded to the inner root. |
| `onReady?` | `(UsfmReadonlyViewReadyPayload) => void`. Fired once after each document load. See **External chapter navigation** above. |
| `onVerseClick?` | `(verseNum: string, event) => void` on verse marker clicks. |
| `onWordClick?` | See **Word clicks** below. |
| `onSelectionChange?` | `(ScriptureSelectionRef \| null) => void`. `null` when selection collapses or leaves the widget; otherwise a structured ref after the gesture (mouseup / keyup / touchend). Selection is snapped to full `.usfm-tok` word spans when possible. |
| `getWordDecoration?` | Optional `(WordDecorationInfo) => { className?, style? }` for per-token highlights / underlines (see default.css helpers `usfm-ro-hl` / `usfm-ro-ul`). |

### Word clicks (`onWordClick`)

Fires on clickable **word tokens** (whitespace-split runs in verse text, headings, and `\\w` segments). Each token is a `span.usfm-tok` with:

- `data-word-index` — 1-based index in the verse  
- `data-occurrence` — 1-based repeat count for the same **normalized** identity in the verse  
- `data-word-identity` — normalized identity (trimmed edge punctuation), same as payload `word`  
- `data-verse` — verse number string  
- **`data-verse-sid`** / **`data-gateway-index`** — when `stripAlignment` is on and gateway tokenization succeeds, map this span to **`tokenizeGatewayUsj`** (same rules as `@usfm-tools/editor-core`).

Payload type **`WordClickPayload`**: `word`, **`surface`**, `bookCode`, `chapter`, `verseNum`, **`verseSid`** (e.g. `MAT 1:1`), `wordIndexInVerse`, `occurrenceInVerse`, optional **`gatewayTokenIndex`** (0-based, matches `tokenizeGatewayUsj` for that verse), **`alignment`** (`WordTokenAlignment \| null`: `originalWords`, `alignedGatewayWord`, `alignmentGroupIndex`, …) when milestones were stripped into an `AlignmentMap`, else `null`.

### Selection payload (`ScriptureSelectionRef`)

Returned by `onSelectionChange` (non-null) and by **`scriptureSelectionFromDom`**: `bookCode`, `chapter`, **`text`** (plain text with verse-number nodes excluded), **`verseStart`**, **`verseEnd`**, **`wordTokens`** — ordered list of `{ word, surface, verseNum, wordIndexInVerse, occurrenceInVerse, gatewayTokenIndex?, verseSid?, alignment? }` for each `.usfm-tok[data-verse]` intersecting the snapped range. **`alignment`** is filled by `UsfmReadonlyView` when gateway attributes are present on the DOM.

### Alignment parity (`@usfm-tools/usj-core`)

When **`stripAlignment`** is not `false`, the view runs **`stripAlignments`**, renders the **stripped gateway** tree as plain read-only text, and keeps the **`alignments`** map. Gateway token indices use **`tokenizeGatewayUsj`** + **`transIndexForAlignedWord`** (same as the editor). Helpers: **`parseUsfmToUsjWithAlignments`**, **`verseSidFromParts`**, **`resolveWordTokenAlignment`**, **`buildPieceKeyToGatewayIndex`** (advanced).

Optional last argument to `scriptureSelectionFromDom`: **`ScriptureSelectionFromDomOptions`** — `{ commitExpandedSelection?: boolean }` (default `true`: applies snapped range to `document.getSelection()` so the highlight updates; set `false` to only compute the payload).

### Other exports

| Export | Role |
|--------|------|
| `parseUsfmToUsj(usfm, options?)` | Parse USFM → `UsjDocument \| null`; `ParseUsfmOptions` = `{ stripAlignment? }`. |
| `parseUsfmToUsjWithAlignments` | Same parse plus `alignments` map when stripping (for hosts that do not use `UsfmReadonlyView`). |
| `getUsjChapters(usj)` | Ordered chapter numbers from an already-parsed `UsjDocument`. Use together with `usj` prop to avoid double-parsing. |
| `getUsfmChapters(usfm)` | Parse a USFM string and return its chapter numbers in one call. Useful when you only need the chapter list (not rendering). |
| `collectSegments` | Flat `RenderSegment[]` from chapter nodes (advanced / custom render). Types: `RenderSegment`, `SegmentKind`. |
| `splitUsjByChapter` | Re-export from `@usfm-tools/usj-core`. |
| `ChapterSlice`, `UsjDocument` | Re-exported types from `@usfm-tools/usj-core`. |
| `normalizeWordIdentity` | Same normalization used for clicks and DOM `data-word-identity`. |
| `expandRangeToWordTokenBoundaries` | Grow a `Range` to full `.usfm-tok` boundaries inside `root`. |
| `commitExpandedWordTokenSelection` | Apply expanded range to a `Selection` when it differs from the current range. |
| `selectedPlainTextExcludingVerseNumbers` | Plain text for a range, skipping `.usfm-verse-num` text. |
| `wordTokensIntersectingRange` | Ordered word-token rows intersecting a range. |
| `UsfmReadonlyViewProps`, `UsfmReadonlyViewReadyPayload`, `WordClickPayload`, `ScriptureSelectionWordToken` | TypeScript types for the above. |

## Bundling (Vite / Rollup)

`@usfm-tools/parser` still resolves as CJS in many bundlers without reliable ESM named metadata. **`parseUsfm.ts`** uses a tiny **`cjsNamed()`** helper (`src/interop.ts`) with `import * as ns` for the parser only. **`@usfm-tools/usj-core`** is consumed with normal **named imports** (it ships ESM via `dist/index.mjs`).

## Theming

Default CSS lives in `styles.css` (`dist/default.css` after build). For a look closer to **usfm-editor-app**, depend on **`@usfm-tools/editor-themes`** in your app and load its CSS (optional peer of this package).

## License

MIT. Segment collection derives from `usfm-editor-app` / `usfm-diff-logic.ts` (same license family in this repo).
