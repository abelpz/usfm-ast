# Bidirectional project sync (local translation projects)

Local translation projects (resource-container in IndexedDB) sync to Door43 through **`syncLocalProjectWithDcs`** in `@usfm-tools/editor-app`: pull Tier‑2 (book branch) → three-way merge with IndexedDB → CAS push to the working branch, with retry on stale blob SHAs.

## Transport (`@usfm-tools/editor-adapters`)

- **`DcsRestProjectSync`** — `getRemoteHeadCommit`, `pullFilesAt(ref)`, `pushFiles` with `expectedBaseShaByPath` (returns `{ kind: 'stale', staleByPath }` instead of overwriting).
- Text extensions include **`.jsonl`** so `journal/*.jsonl` participates in listing and push.

## Merge (`mergeProjectMaps` / `mergeFileContent`)

- **USFM** — OT via `diffUsjDocuments` + `transformOpLists`; overlapping non-auto-resolvable edits become **`FileConflict`** (per file, chapter indices when applicable).
- **`journal/<BOOK>.jsonl`** — dedicated merge: union of **`JournalEntry`** rows by `id` with standard 3-way rules; vector clocks are merged with per-replica `max`.
- **JSON / YAML** — best-effort object merge; otherwise text conflict.

## Operation journal in the repo

- **`ProjectBookJournalStore`** implements **`JournalStore`**: persists **`OperationJournal`** to **`journal/<BOOK>.jsonl`** (header line + one JSON entry per line) and folded snapshots under **`journal/snapshots/<BOOK>/<id>.json`**.
- **`EditorPage`** wires **`ProjectBookJournalStore`** into **`HeadlessCollabSession`** so OT survives restarts and is included in the same git sync as USFM and `.sync` sidecars.

## Metadata

- **`.sync/<BOOK>.json`** — `ProjectDocSyncSidecar` (`docId`, `baseCommit`, `baseBlobSha`, …) updated on debounced save (see `sync-sidecar.ts`).

## Offline bundles

- **`exportProjectBundle` / `importProjectBundle`** — zip of project files under `files/` (includes **`journal/<BOOK>.jsonl`** when stored). Optional legacy root **`journal/project.jsonl`**; **`OperationJournal.serializeForExport`** / **`loadFromExport`** use the same JSONL line format as repo files.

## UI

- **`SyncConflictDialog`** — resolve **`FileConflict`** (ours / theirs).
- **`SyncStatusPill`** — **conflict** state when file conflicts exist or a PR merge is blocked.

## CAS and deletes

- **`buildExpectedBaseShasForPush`** includes paths that were previously synced but are absent locally so a remote delete is checked against the expected blob SHA; delete failures (409/422) surface as **stale** when CAS is enabled.
