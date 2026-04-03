# @usfm-tools/editor-core

Framework-agnostic helpers for scripture editing: **chapter slices**, **alignment strip/rebuild** (gateway ↔ original language), and shared **types** for structured operations.

This package does not include UI (Slate, ProseMirror, etc.).

## API (initial)

- `splitUsjByChapter` — split a USJ `content` array into chapter-sized slices (header + per `\c` section).
- `stripAlignments` — remove `zaln-s` / `zaln-e` and unwrap `\w` into plain text; extract an `AlignmentMap`.

See source exports in `src/index.ts`.
