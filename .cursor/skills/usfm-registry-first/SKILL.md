# USFM registry-first changes (parser & visitors)

Use this when editing **parsing**, **USFMVisitor**, or **formatting** so behavior stays driven by **`USFMMarkerRegistry`** and `packages/usfm-parser/src/constants/markers.ts`, not ad hoc marker strings in visitor/parser code.

## Source of truth

1. **`markers.ts`** — Marker metadata: `type`, `context` (e.g. `NoteContent`), `styleType` (e.g. `book` for `\id`), `attributes` / `implicitAttributes`, `hasSpecialContent`, roles, etc.
2. **`USFMMarkerRegistry`** (`packages/usfm-parser/src/constants/registry.ts`) — Runtime lookups; used by parser, formatter, and adapters.

Prefer **adding or adjusting marker metadata** over scattering `marker === 'fq'` across files. When a special case is unavoidable, isolate it behind a small helper that reads the registry (see `isBookIdentificationMarker`, `isNoteContentMarkerName`, `stringAttributeKeysForMarker` in `packages/usfm-adapters/src/usfm/index.ts`).

## Visitors (`USFMVisitor`)

- **Marker type / role:** Use `USFMMarkerRegistry.getInstance().getMarkerInfo(marker)` (or helpers that wrap it) instead of hardcoding lists of marker names unless the list is the intentional compatibility surface (e.g. explicit footnote close set — document why and link to USFM round-trip behavior).
- **String attributes on character/milestone nodes:** Use `stringAttributeKeysForMarker(marker)` so declared and implicit string keys match the registry merge rules.
- **Book identification:** Use `styleType === 'book'` (or `isBookIdentificationMarker`) for `\id` line behavior, not raw `'id'` checks scattered everywhere.
- **Note content:** Markers with `context` including `NoteContent` share footnote/cross-ref rules; closing `\\marker*` behavior must account for legacy chaining (`\\fr` then `\\ft` without stars) vs text siblings (explicit close) vs whitespace-only siblings after the **note** in the enclosing paragraph/verse.

## Parsers

- Dispatch on **marker type** from the registry (`paragraph`, `character`, `note`, `milestone`) where possible.
- Avoid new hardcoded marker name lists in `parser/index.ts`; extend `markers.ts` and consume via `markerRegistry.getMarkerInfo`.

## Verification

- After changing **`USFMParser` / `toJSON()`** output: run `bun run regenerate:example-usj` and commit updated `examples/usfm-markers/**/example.usj` when applicable.
- Run `bun run lint`, `bun run check-types`, `bun run build`, and `CI=true bun run test` from the repo root per `AGENTS.md`.

## Related docs

- `docs/10-parsing-quickstart.md` — Parser usage.
- `docs/08-github-agent-workflow.md` — Issue/PR flow.
