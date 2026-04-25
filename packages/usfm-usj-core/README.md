# `@usfm-tools/usj-core`

Browser-safe helpers for **USJ** documents:

- **`splitUsjByChapter`** / **`ChapterSlice`** — split flat `content` at each `\c` marker (chapter `0` = preface).
- **`stripAlignments`** / **`stripArray`** — extract unfoldingWord-style alignments into a map and gateway-language `EditableUSJ`.
- **`UsjDocument`** — minimal `{ type: 'USJ'; version; content }` type.

Used by read-only scripture views and re-exported from **`@usfm-tools/editor-core`** for backwards compatibility.

## Build

```bash
bun install
bun run build
```
