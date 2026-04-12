# Editor core (`@usfm-tools/editor-core`)

Framework-agnostic helpers for **chapter-scoped USJ**, **alignment** (gateway ↔ original-language milestones), **structured operations**, and a small **document store** API. There is **no UI** (no Slate/ProseMirror); wire these primitives into your editor.

**Package:** `packages/usfm-editor-core` · **npm:** `@usfm-tools/editor-core`

## Install

```bash
npm install @usfm-tools/parser @usfm-tools/adapters @usfm-tools/types @usfm-tools/editor-core
```

Workspace: add the dependency and run `bun run build` at the repo root so workspace packages resolve.

Apps on `@usfm-tools/editor` often add [`@usfm-tools/editor-adapters`](./27-editor-adapters.md) for the USJ/USFM/USX helpers sessions use, while keeping `@usfm-tools/adapters` for full visitors when needed.

**Node-only persistence:** import `FileSystemPersistenceAdapter` and `GitLocalPersistenceAdapter` from **`@usfm-tools/editor-core/node`** (they use `fs` / `path`; the default package entry stays browser-safe).

## Concepts

| Concept           | Role                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chapter slice** | Header + nodes for one `\c` (or book header before chapter 1).                                                                                                                          |
| **Editable USJ**  | USJ with `zaln-*` / `\w` alignment stripped to plain text; alignments live in a separate **`AlignmentMap`**.                                                                            |
| **`NodePath`**    | `{ chapter: number; indices: number[] }` — indices into the chapter slice’s `content` array (nested for verse/paragraph children).                                                      |
| **`Operation`**   | Content ops (`insertNode`, `setText`, …) or alignment ops (`alignWord`, …). `DocumentStore.applyOperations` applies **content** ops only; alignment updates use **`updateAlignments`**. |

## Chapter slicing

Split a full book USJ into per-chapter pieces for lazy loading or isolated editing.

```typescript
import { splitUsjByChapter, chapterSliceToUsjDocument } from '@usfm-tools/editor-core';

const usj = {
  type: 'USJ',
  version: '3.1',
  content: [
    /* book, markers, \\c 1 … */
  ],
};

const slices = splitUsjByChapter(usj);
for (const s of slices) {
  console.log(s.chapter, s.nodes.length);
  const mini = chapterSliceToUsjDocument(s); // single-chapter USJ-shaped doc
}
```

Use **`ChapterChunker`** if you need incremental chunking while streaming or building documents (see `src/chapter-chunker.ts`).

## `DocumentStore` (high level)

Loads USFM/USJ, exposes chapters, editable slices, merge-back, USFM export, and structural diff.

```typescript
import { DocumentStore } from '@usfm-tools/editor-core';

const store = new DocumentStore({ silentConsole: true });
store.loadUSFM(String.raw`\id MAT Matthew
\c 1
\p
\v 1 In the beginning.`);

const ch1 = store.getChapter(1);
const { editable, alignments } = store.getEditableChapter(1);

// After your UI edits `editable` and/or `alignments`:
store.updateEditableChapter(1, editable, alignments);

// Serialize one chapter or whole book
const usfmOne = store.toUSFM(1);
const usfmBook = store.toUSFM();

// Content operations (paths must use the correct chapter number)
store.applyOperations([
  {
    type: 'setText',
    path: { chapter: 1, indices: [0, 0, 1] },
    text: 'Hello',
  },
]);

// Compare two loaded documents
const other = new DocumentStore();
other.loadUSJ(store.getFullUSJ());
const ops = store.diff(other);
```

**Listeners:** `store.onChange((ops, chapter) => { … })` runs after updates that emit changes (see `document-store.ts`).

## Alignment strip and rebuild

**Strip** removes `zaln-s` / `zaln-e` wrappers and normalizes `\w` … `\w*` into editable text while returning an **`AlignmentMap`** (verse-keyed).

**Rebuild** merges an `EditableUSJ` + `AlignmentMap` back into aligned USJ nodes (`rebuildAlignedUsj`).

Lower-level imports:

```typescript
import { stripAlignments, rebuildAlignedUsj, reconcileAlignments } from '@usfm-tools/editor-core';

const { editable, alignments } = stripAlignments(usjDocument);
// … edit …
const merged = rebuildAlignedUsj(editable, alignments);
```

Use **`reconcileAlignments`** when gateway text changes but you want to preserve or adjust alignment groups (see tests in `alignment-reconcile.test.ts`).

## Operations and OT

- **`applyOperation` / `applyOperations`** — mutate a **mutable** `content` array (chapter root) for content ops. Alignment ops are no-ops here by design.
- **`invertOperation` / `invertOps`** — undo metadata when present (`oldText`, `removedNode`, …).
- **`composeOps`**, **`transformOpLists`** — sequence composition and operational-transform–style index fixing for concurrent edits in the **same chapter** (see `ot-transform.ts`).

```typescript
import { applyOperations, invertOps, transformOpLists, composeOps } from '@usfm-tools/editor-core';

const content: unknown[] = [
  /* chapter slice nodes */
];
const batch = [
  {
    type: 'insertNode',
    path: { chapter: 1, indices: [0] },
    node: { type: 'para', marker: 'p', content: [] },
  },
];
applyOperations(content, batch);
const undo = invertOps(batch);
```

## Verse addressing

```typescript
import { usfmRefToVerseSid, findVerseInlineNodes } from '@usfm-tools/editor-core';

const sid = usfmRefToVerseSid('MAT', { chapter: 1, verse: 1 });
const nodes = findVerseInlineNodes(usj.content, sid!);
```

## Word-level diff (alignment hints)

**`tokenizeWords`**, **`lcsWordAlignment`**, etc., help build suggested alignments between two strings (see `word-diff.ts` and `word-diff` tests).

## Git / sync placeholder

**`StubGitSyncAdapter`** implements **`GitSyncAdapter`** with safe defaults for apps that will plug in real git later (`git-sync-adapter.ts`).

## Related

- [Parsing quickstart](./10-parsing-quickstart.md) — `USFMParser`, CLIs
- [Alignment layer](./20-alignment-layer.md) — `\zaln` / `\w` ↔ `AlignmentMap`
- [Production readiness](./16-production-readiness.md) — logging, semver
- [Parser metadata & USFM buffer](./19-parser-metadata-and-usfm-buffer.md) — source spans, visitor output buffer
- Package README: [`packages/usfm-editor-core/README.md`](../packages/usfm-editor-core/README.md)
- ProseMirror UI adapter: [`packages/usfm-editor/README.md`](../packages/usfm-editor/README.md) (`@usfm-tools/editor`)
