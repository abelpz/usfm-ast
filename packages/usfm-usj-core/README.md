# `@usfm-tools/usj-core`

Browser-safe helpers for **USJ** documents:

- **`splitUsjByChapter`** / **`ChapterSlice`** — split flat `content` at each `\c` marker (chapter `0` = preface).
- **`stripAlignments`** / **`stripArray`** — extract unfoldingWord-style alignments into a map and gateway-language `EditableUSJ`.
- **What a verse reaches** — `walkVerseStretches` is the one rule for which text is a verse's: up to the next `\v` and no further than its chapter, without headings, labels or notes, and with what a chapter has before its first verse (a psalm title) as verse 0 of it (`chapterFrontSid`, `PSA 3:0`). See [`docs/20-alignment-layer.md`](../../docs/20-alignment-layer.md).
- **Gateway tokens (shared with the editor)** — `findVerseInlineNodes`, `collectVerseInlineNodes`, `collectVerseTextsFromContent`, `tokenizeWords`, `normalizeWordForAlignmentMatch`, `alignmentWordSurfacesEqual`, `tokenizeGatewayUsj` / **`GatewayWordToken`**, `occurrenceStats`, **`transIndexForAlignedWord`** (map `AlignmentGroup.targets` to verse tokens).
- **`UsjDocument`** — minimal `{ type: 'USJ'; version; content }` type.

Used by read-only scripture views and re-exported from **`@usfm-tools/editor-core`** for backwards compatibility.

## Build

```bash
bun install
bun run build
```
