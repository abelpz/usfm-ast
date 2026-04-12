# @usfm-tools/editor-core

Framework-agnostic helpers for scripture editing: **chapter slices**, **alignment** strip/rebuild (gateway ↔ original language), **`DocumentStore`**, **structured operations**, and **OT-style** transforms. No UI (Slate, ProseMirror, etc.).

## Documentation

**Full guide (APIs, examples):** [`docs/18-editor-core.md`](../../docs/18-editor-core.md)

**Related:** [Parser metadata & USFM buffer](../../docs/19-parser-metadata-and-usfm-buffer.md) · [Parsing quickstart](../../docs/10-parsing-quickstart.md)

## Install

```bash
npm install @usfm-tools/editor-core @usfm-tools/parser @usfm-tools/adapters @usfm-tools/types
```

## Quick example

```typescript
import { DocumentStore } from '@usfm-tools/editor-core';

const store = new DocumentStore({ silentConsole: true });
store.loadUSFM('\\id MAT Matthew\\n\\c 1\\n\\p\\n\\v 1 Hello.');
const { editable, alignments } = store.getEditableChapter(1);
// Edit `editable`, adjust `alignments`, then:
store.updateEditableChapter(1, editable, alignments);
console.log(store.toUSFM());
```

## Exports

See [`src/index.ts`](./src/index.ts) for the browser-safe surface: `splitUsjByChapter`, `ChapterChunker`, `stripAlignments`, `rebuildAlignedUsj`, `reconcileAlignments`, `DocumentStore`, `applyOperation`, `transformOpLists`, `diffUsjDocuments`, verse helpers, word-diff utilities, `StubGitSyncAdapter`, `MemoryPersistenceAdapter`, sync/journal helpers, etc. **IndexedDB persistence, DCS journal transport, and `DcsGitSyncAdapter`** live in [`@usfm-tools/editor-adapters`](../usfm-editor-adapters) (see [`docs/27-editor-adapters.md`](../../docs/27-editor-adapters.md)).

**Node / Electron only:** `FileSystemPersistenceAdapter` and `GitLocalPersistenceAdapter` are exported from **`@usfm-tools/editor-core/node`** so web bundles do not resolve Node built-ins (`fs`, `path`).

## License

MIT — see [repository root LICENSE](../../LICENSE).
