# Editor core extensibility (sync, journal, conflicts)

`@usfm-tools/editor-core` supports pluggable merge behavior, journal persistence layout, a custom sync engine, and automatic conflict resolution hooks.

## `MergeStrategy`

Implement `merge(localPending, remoteOps)` to produce `{ serverPrime, clientPrime }` for content-layer journal entries. Inputs are **content-only** (alignment ops are stripped). The default is `OTMergeStrategy` (uses `transformOpLists`). Inject via `RealtimeSyncEngine` / `JournalMergeSyncEngine` context or `HeadlessCollabSessionOptions.mergeStrategy`.

## `JournalStore` and `DefaultJournalStore`

`OperationJournal` accepts a `JournalStore`, a `PersistenceAdapter` (wrapped by `DefaultJournalStore`), or `undefined` (in-memory). Keys used by `DefaultJournalStore`: `journal/entries.json`, `journal/vector.json`, `journal/meta.json`, `snapshots/<id>.json`.

## Custom `SyncEngine`

Pass `HeadlessCollabSessionOptions.syncEngine` to bypass the default `RealtimeSyncEngine`. `connect()` / `disconnect()` only call realtime APIs when the engine is a `RealtimeSyncEngine` instance.

## `onConflict`

`JournalMergeSyncEngine` context and `HeadlessCollabSessionOptions` accept  
`onConflict?: (c: ChapterConflict) => 'accept-local' | 'accept-remote' | 'manual'`.  
When applying merged server ops throws, the callback runs. `'accept-local'` discards the remote merge attempt and returns pending locals; `'accept-remote'` applies raw remote content ops; `'manual'` surfaces the conflict as today.

## Re-exports

`MergeStrategy`, `OTMergeStrategy`, `JournalStore`, `DefaultJournalStore`, and `MemoryJournalStore` are exported from `@usfm-tools/editor-core`.

## See also

- [Editor SDK package map](./28-editor-sdk-overview.md)
