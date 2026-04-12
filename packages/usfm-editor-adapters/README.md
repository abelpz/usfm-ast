# `@usfm-tools/editor-adapters`

Editor-facing adapters: format helpers from [`@usfm-tools/adapters`](../usfm-adapters), plus optional **Door43/Gitea** (`createDcsJournalTransport`, `DcsGitSyncAdapter`), **IndexedDB** persistence, and **source-text** providers (`FileSourceTextProvider`, `DcsSourceTextProvider`). Core interfaces (`GitSyncAdapter`, `JournalRemoteTransport`, …) stay in [`@usfm-tools/editor-core`](../usfm-editor-core).

Use **`@usfm-tools/adapters`** when you need visitors, HTML output, or the full API.

See [`docs/27-editor-adapters.md`](../../docs/27-editor-adapters.md) and [`docs/27-adapters.md`](../../docs/27-adapters.md).
