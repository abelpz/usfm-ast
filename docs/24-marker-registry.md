# Marker registry (`@usfm-tools/editor`)

## `MarkerRegistry`

Implement:

- `getChoicesForMode(section, mode)` — palette entries for a document section and mode string.
- `getValidParagraphMarkers(section)` — full valid list for the section.
- `canInsertVerse` / `canInsertChapter` — structure guards.
- `getStructuralInsertions` / `getSectionAtPos` — ProseMirror helpers.

## `DefaultMarkerRegistry`

Delegates to `marker-context.ts` (`BASIC_MARKERS`, `CONTEXT_AWARE_MARKERS`, section tables).

## `EditorMode` and `BuiltinEditorMode`

`EditorMode` is `string`. Built-in values are `basic`, `medium`, `advanced` (`BuiltinEditorMode`). Unknown mode strings use the same fallback as before (medium-style simplified list).

## `ScriptureSession`

- `ScriptureSessionOptions.markerRegistry` — optional; default `new DefaultMarkerRegistry()`.
- `session.markers` — the registry instance.
- With `realtime`, options `journalStore`, `remoteTransport`, `mergeStrategy`, and `onConflict` are forwarded to `HeadlessCollabSession`.

`@usfm-tools/editor` re-exports `MergeStrategy`, `OTMergeStrategy`, `JournalStore`, `DefaultJournalStore`, and `JournalRemoteTransport` from `@usfm-tools/editor-core` for convenience.
