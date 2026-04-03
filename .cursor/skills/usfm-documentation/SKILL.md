---
name: usfm-documentation
description: >-
  Use when working with USFM/USX/USJ marker semantics, document structure, book identification,
  milestones, or validating behavior against the official reference. Points to the USFM latest docs
  and project registry/parser conventions.
---

# USFM official documentation

## Primary reference

- **USFM / USX / USJ (latest):** [https://docs.usfm.bible/usfm/latest/index.html](https://docs.usfm.bible/usfm/latest/index.html) — document structure, book identification (`id`), chapters, paragraphs, milestones, notes, etc.

Use this for questions about what a marker means, how divisions are sequenced, and how identification vs chapter content is organized.

## This repository

- Marker definitions and types: `packages/usfm-parser/src/constants/markers.ts` (merged via `USFMMarkerRegistry`).
- Root book line parsing: `parseBook` in `packages/usfm-parser/src/parser/index.ts` (only markers with registry `styleType: 'book'`, currently `id`).
- Emitting USFM after book identification: `USFMVisitor` in `packages/usfm-adapters/src/usfm/index.ts` uses `isBookIdentificationMarker()` (registry `styleType === 'book'`) so a newline is inserted before the next **non-paragraph** root marker, avoiding absorption into the book line.

When adding a marker that should share `parseBook` at root, set `styleType: 'book'` in `markers.ts` and align visitor/parser tests.
