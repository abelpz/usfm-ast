# Editor adapters (`@usfm-tools/editor-adapters`)

This package is the **Layer 5 adapter surface** for editor apps: format helpers, optional Door43/Gitea I/O, browser persistence, and source-text loaders. Core **interfaces** (`GitSyncAdapter`, `JournalRemoteTransport`, `PersistenceAdapter`, …) remain in [`@usfm-tools/editor-core`](../../packages/usfm-editor-core).

## Format helpers (from `@usfm-tools/adapters`)

- **`convertUSJDocumentToUSFM`** — USJ → USFM for export or git commits.
- **`parseUsxToUsjDocument`** / **`usjDocumentToUsx`** — USX XML ↔ USJ.
- **`UsjDocumentRoot`** — type returned by `parseUsxToUsjDocument`.

## Door43 / Gitea (Contents API)

- **`createDcsJournalTransport`** — implements `JournalRemoteTransport`: read/write a journal JSON file in a repo branch. Pair with `JournalMergeSyncEngine` / `HeadlessCollabSession` options from editor-core.
- **`DcsGitSyncAdapter`** — implements `GitSyncAdapter`: commit USFM snapshots, `checkout`, `diffRevisions`, three-way merge via OT (`DocumentStore` + `diffUsjDocuments` in core).
- **`DcsRestProjectSync`** — implements `ProjectSyncAdapter` for whole-repo sync over the Gitea Contents/tree APIs: `getRemoteHeadCommit`, `pullFilesAt(ref)`, and CAS `pushFiles` via `expectedBaseShaByPath` (stale → `{ kind: 'stale' }` instead of overwriting).
- **`mergeProjectMaps` / `mergeUsfmFile`** (`three-way-merge-project.ts`) — per-file three-way merge for local translation projects (USFM via OT; JSON/YAML best-effort; conflicts surfaced as `FileConflict` for the app UI).

Use a personal access token with `repo` scope. Live integration tests live under `packages/usfm-editor-core/tests/door43/` (see repo `.env.door43.example`).

## Browser persistence

- **`IndexedDBPersistenceAdapter`** — `PersistenceAdapter` over IndexedDB (`usfm-editor-ast` database). Suitable for PWAs; not available in Node unless you polyfill `indexedDB` (tests use `fake-indexeddb`).

## Source text (reference panel)

- **`FileSourceTextProvider`** — local `File`: infers USFM / USJ / USX from extension.
- **`DcsSourceTextProvider`** — fetches repo file content via Gitea API; same format inference.

[`ScriptureSession`](../../packages/usfm-editor) and [`@usfm-tools/editor-app`](../../packages/usfm-editor-app) depend on this package so apps can depend on **`@usfm-tools/editor-adapters`** instead of pulling `@usfm-tools/adapters` only for the editor-facing entry points above.

## When to use `@usfm-tools/adapters` instead

Reach for **`@usfm-tools/adapters`** directly when you need visitors (`USFMVisitor`, `USXVisitor`, `HTMLVisitor`, universal USFM, …), formatter buffers, or anything beyond the three functions above.

## Related docs

- [Bidirectional project sync](./29-bidirectional-sync.md) — Tier‑2 pull, three-way merge, CAS push, `journal/*.jsonl`, bundles.
- [Editor UI toolkit](./25-editor-ui-toolkit.md)
- [Marker registry](./24-marker-registry.md)
- [Parsing quickstart](./10-parsing-quickstart.md)
