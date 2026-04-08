# Alignment layer (unfoldingWord USFM)

This document summarizes how **word-level alignment** is represented in USFM/USJ and how it maps to **`@usfm-tools/editor-core`** types. Authoritative background: [unfoldingWord Developer Guide — Alignment Layer](https://github.com/unfoldingWord/uW-Tools-Collab/blob/main/docs/2-unfoldingword-developer-guide.mdx#alignment-layer).

## USFM markers

Gateway translations (e.g. ULT/UST) align to original-language text (UHB/UGNT) using:

- **`\zaln-s`** — start of an alignment pair; carries metadata for the original-language side.
- **`\zaln-e`** — end of an alignment pair (closes nested `zaln-s` in order).
- **`\w` … `\w*`** — gateway word; occurrence metadata lives on attributes.

Typical shape:

```usfm
\zaln-s |x-strong="G35880" x-lemma="ὁ" x-morph="..." x-occurrence="1" x-occurrences="1" x-content="ὁ"\*\w The|x-occurrence="1" x-occurrences="1"\w*\zaln-e\*
```

Common **`zaln-s`** attributes (as used by `@usfm-tools/editor-core` / USJ):

| Attribute       | Role                                        |
| --------------- | ------------------------------------------- |
| `x-strong`      | Strong’s number (e.g. `G12345`, `H01234`)   |
| `x-lemma`       | Lemma / dictionary form                     |
| `x-morph`       | Morphology (optional)                       |
| `x-content`     | Original-language surface string            |
| `x-occurrence`  | Which occurrence of this lemma in the verse |
| `x-occurrences` | Total occurrences in the verse              |

**`\w`** nodes carry `x-occurrence` / `x-occurrences` for the gateway word.

## Relationship types

Alignments can combine multiple originals and/or multiple gateway words:

1. **1:1** — one original word, one gateway word.
2. **1:N** — one original word, several gateway words (nested `zaln-s` / one `zaln-e` closing after all `\w` words).
3. **N:1** — several original words (nested `\zaln-s`) aligned to one gateway word.
4. **N:M** — multiple originals and multiple gateway words; nesting reflects the bracket structure in USFM.

The developer guide illustrates these with Greek/English examples (e.g. Rom 1:1).

## Mapping to `editor-core` / `@usfm-tools/types`

| Concept                | Type / field                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| One aligned bundle     | `AlignmentGroup`                                                                                   |
| Original-language side | `AlignmentGroup.sources: OriginalWord[]` (one entry per active `\zaln-s` in the nest)              |
| Gateway side           | `AlignmentGroup.targets: AlignedWord[]` (one entry per `\w`)                                       |
| All groups in a verse  | `AlignmentMap[verseSid]` → `AlignmentGroup[]` (verse `sid` matches `UsjVerse.sid`, e.g. `TIT 1:1`) |

`OriginalWord` / `AlignedWord` fields mirror `x-strong`, `x-lemma`, `x-morph`, `x-content`, and occurrence fields.

## Editing pipeline

1. **Strip** — `stripAlignments` / `stripArray` removes `zaln-s` / `zaln-e`, unwraps `\w` into plain text, and fills an `AlignmentMap`.
2. **Edit** — WYSIWYG (e.g. ProseMirror) or `DocumentStore` works on plain USJ-shaped content plus a separate `AlignmentMap`.
3. **Rebuild** — `rebuildAlignedUsj` merges `EditableUSJ` + `AlignmentMap` back into USJ with milestones and `\w` nodes.
4. **Reconcile** — If gateway text changes, `reconcileAlignments` (word diff / LCS) can update groups so stable words keep links.

## Related

- [`docs/18-editor-core.md`](./18-editor-core.md) — `DocumentStore`, strip/rebuild, operations
- Package: [`packages/usfm-editor-core`](../packages/usfm-editor-core/README.md)
- Types: [`packages/shared-types/src/alignment`](../packages/shared-types/src/alignment/index.ts)
