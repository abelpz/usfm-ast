# Changelog

All notable changes to published packages in this monorepo are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) per **package** (`packages/*/package.json`).

## Guiding principles

| Change type | Version bump | Examples |
| ----------- | ------------- | -------- |
| **Breaking** | **MAJOR** | `USFMParser.toJSON()` shape change; removed option; renamed export |
| **Additive** | **MINOR** | New parser option; new visitor method; new CLI flag (non-breaking default) |
| **Fixes / docs** | **PATCH** | Bug fix with same output shape; README; types only |

After intentional **`USFMParser` / `toJSON()`** output changes, run `bun run regenerate:example-usj` and commit updated `examples/usfm-markers/**/example.usj`.

## [Unreleased]

### Added

- **`@usfm-tools/relay-server`** (private package): Cloudflare Worker + Durable Object WebSocket relay at `/rooms/:roomId` (`RelayRoom`, hibernation WebSockets, ping/pong auto-response). Deploy with Wrangler; see [`packages/usfm-relay-server/README.md`](./packages/usfm-relay-server/README.md). Vitest pool-worker integration tests run when `RUN_RELAY_POOL_TESTS=1` (set on the **Test** step in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml); `turbo.json` passes it through).
- **`@usfm-tools/editor-core`:** `WebSocketRelayTransport` connects to `relayBase/rooms/:roomId` for Worker routing; offline tests in `tests/collab-offline.test.ts`; optional `tests/collab-online.test.ts` when `RELAY_URL` is set (Node `ws` polyfill).
- **`@usfm-tools/editor-core`:** Offline-first collaboration stack — expanded `transformOpLists` / `transformAgainstPrior` (setText / replaceNode / setAttr / moveNode + index shifts), vector-clock filtering in `createDcsJournalTransport` `pullEntriesSince`, journal `maybeCompactAfterPush` + `hydrateDocumentStore` / folded snapshots, `RealtimeTransport` + `BroadcastChannelTransport`, `WebSocketRelayTransport`, `InProcessRelay` / `InProcessTransport`, `RealtimeSyncEngine`, `CompositeRealtimeTransport`, `HeadlessCollabSession`, `runCollabScenario` (`cli/collab-harness`), `AgentOrchestrator`, `AutoSyncScheduler`, `filterResolvableConflicts`, `DcsGitSyncAdapter` (Gitea Contents API), `JournalMergeSyncEngine.applyRemoteJournalEntry` + push retry on reconnect.
- **`@usfm-tools/editor`:** `createAwarenessPlugin` (throttled selection broadcast); `ScriptureSession` options `headlessSession` and `realtime` (composes `HeadlessCollabSession` + awareness when using `RealtimeSyncEngine`).
- **`@usfm-tools/editor-app`:** `sync-status` pill, **Collaborate** flow (sessionStorage + optional WebSocket relay), `AutoSyncScheduler` on the session; conflict review shows **Base (ancestor)** column when `baseSnapshot` is present.

- **`@usfm-tools/editor`:** `marker-context` helpers — `getEditorSectionAtPos`, `getValidParagraphMarkers`, `canInsertVerseInSection`, `canInsertChapterMarkerInSection` (USFM document divisions: header, book titles, introduction, chapter).
- **`@usfm-tools/editor-app`:** translator-focused shell (grouped toolbar, help popover, chapter chip scroller, reference-text panel polish, alignment labels) and contextual block/marker menus driven by `marker-context`.

- **`@usfm-tools/adapters`:** `usxXmlToUsfm`, `parseUsxToUsjDocument`, `usjDocumentToUsx` (USX ↔ USJ via USFM); `@xmldom/xmldom` dependency for XML parsing.
- **`@usfm-tools/editor`:** chapter-windowed editing — `book_introduction` schema node, readonly `chapter`, `chapterSubsetToPm` / `expandChaptersWithContext`, `ScriptureSession` (store + window + alignments + undo + `loadUSX` / `toUSX`), `ScriptureCollabPlugin`, `applyRemoteContentOperations` (OT via `transformOpLists`), `readonlyChapterGuardPlugin`, `MappedSection` position map helpers.
- **`@usfm-tools/editor-core`:** `DcsSyncEngine` commits via optional `GitSyncAdapter` + `OperationJournal`; editor-core `tsconfig` includes **DOM** lib for `DefaultSyncEngine` browser hooks.
- **`@usfm-tools/editor-app`:** `section-picker`, `alignment-editor`, `conflict-review` modules; main app wired to `ScriptureSession`, USX open/export, sync + conflict panel.
- **`@usfm-tools/editor-core`:** `SourceTextProvider` interface — pluggable read-only reference text (file, DCS, custom API).
- **`@usfm-tools/editor`:** `SourceTextSession` — non-editable ProseMirror view for side-by-side translation reference; syncs chapter window with `ScriptureSession`.
- **`@usfm-tools/editor-app`:** `source-panel` module (`mountSourcePanel`); `source-providers` with `FileSourceTextProvider` (USFM / USJ / USX) and `DcsSourceTextProvider`; "Show source text" toolbar button opens a side-by-side read-only panel.
- `USFMParser` options `silentConsole` and `logger` for production-friendly logging (`getLogs()` unchanged). See [`docs/16-production-readiness.md`](./docs/16-production-readiness.md).
- CI checks: `examples:check` (golden USJ coverage), parser perf budget test.
- Contributor docs: production readiness, issue template for parser mismatches.
- Oracle: `oracles:batch-examples` (curated `examples/usfm-markers`), `oracles:batch-examples-all` (full `**/example.usfm` tree), `oracles:summarize`, [`docs/17-oracle-comparison.md`](./docs/17-oracle-comparison.md). Refreshed `oracle-out/ORACLE_REPORT.md` (metrics depend on local Python/usfmtc).
- Adapter tests: `conversion-roundtrip.test.ts` covers all unique package `fixtures/**/*.usfm` (deduped parser vs adapters); milestone fixture checks USX is well-formed before/after round-trip instead of similarity (until USX/milestone parity improves).
- Docs: upstream parser repos in [`docs/17-oracle-comparison.md`](./docs/17-oracle-comparison.md). Slightly **stricter** default `compareUsjSimilarity` / `compareUsxSimilarity` thresholds and tighter `fixture-matrix` / `conversion-roundtrip` alignment checks.
- **`bun run roundtrip-diff`** — unified diffs for USFM / USJ / USX after one round-trip (`scripts/roundtrip-diff.mjs`, devDependency `diff`). See [`docs/10-parsing-quickstart.md`](./docs/10-parsing-quickstart.md).
- **`USFMOutputBuffer`** (`@usfm-tools/formatter`) with `clear` / `trimEnd` / `getTrailingContext`; **`USFMFormatter`** buffer helpers (`appendTextContentToBuffer`, `appendAttributesToBuffer`, `mergeMarkerIntoBuffer`, `mergeMilestoneIntoBuffer`) for visitor serialization without allocating a new full string on every text/close-marker append.
- **`USFMVisitor`** and **`UniversalUSFMVisitorImpl`** build USFM via `USFMOutputBuffer`; **`USFMOutputBuffer`** re-exported from `@usfm-tools/adapters`.
- **`@usfm-tools/editor-core`** — `DocumentStore`, chapter slicing, alignment strip/rebuild, document diff, OT helpers (`packages/usfm-editor-core`); pluggable persistence (`MemoryPersistenceAdapter`, `IndexedDBPersistenceAdapter`), `OperationJournal`, `JournalMergeSyncEngine`, `createDcsJournalTransport`; **Node-only** filesystem/Git adapters live under **`@usfm-tools/editor-core/node`** (keeps browser bundles free of `fs`).
- Docs: [`docs/18-editor-core.md`](./docs/18-editor-core.md), [`docs/19-parser-metadata-and-usfm-buffer.md`](./docs/19-parser-metadata-and-usfm-buffer.md), [`docs/20-alignment-layer.md`](./docs/20-alignment-layer.md); expanded [`packages/usfm-editor-core/README.md`](./packages/usfm-editor-core/README.md).
- **`@usfm-tools/editor`** — headless ProseMirror schema + USJ ↔ PM serialization, commands, alignment bridge (`packages/usfm-editor`). See [`packages/usfm-editor/README.md`](./packages/usfm-editor/README.md).
- **`@usfm-tools/editor-app`** — private Vite test app: WYSIWYG content editor + minimal word-alignment UI (`packages/usfm-editor-app`). Dev: `bun run editor-app`.
- **`@usfm-tools/editor`:** `insertChapter` / `insertNextChapter`, `nextChapterNumberForSelection` (new `chapter-number` helper); **`Mod-Shift-c`** inserts the next chapter.
- **`@usfm-tools/editor-app`:** toolbar for inserting chapters; **live USFM** textarea under the WYSIWYG (debounced) with **two-way sync** from source (debounced parse + `loadUsfm`); `loadUsfm` returns boolean on failure.
- **`@usfm-tools/editor`:** `markerPaletteKeymap` accepts `MarkerPaletteKeymapOptions` (`triggerKey`, `getTriggerKey`) so the marker palette shortcut is configurable (default `\\`).
- **`@usfm-tools/editor-app`:** overflow menu control and `localStorage` persistence for the marker palette shortcut; help text follows the chosen binding.
- **`@usfm-tools/editor`:** ProseMirror `toDOM` for `header` (aside + “Book identification”), `chapter` (visible `\\c` bar + body), and `book` (`\\id` + code + content) so WYSIWYG matches structure; **editor-app** styles for those regions.
- **`@usfm-tools/editor`:** **`USFMEditorChrome`** / **`resolveUSFMChrome`** (presets `default` | `minimal` | `developer`), **`header`** / **`book`** **NodeViews**, `data-usfm-chrome` + `data-usfm-glyphs` on the ProseMirror root; optional **`chrome.css`** export; split **`\\id`** (book code field + inline remainder).
- **`@usfm-tools/editor`:** USJ `ms` milestones — `milestone_inline` / `block_milestone` (fallback), **`normalizeStandaloneTranslatorMilestones`**, **`insertTranslatorSection`**; **editor-app** marker palette entry “Translator section (`\\ts`)”; **`chrome.css`** styling for inline milestones.
- **`@usfm-tools/editor`:** **`getSimplifiedMarkerChoices`**, **`CONTEXT_AWARE_MARKERS`** / **`ContextAwareMarkerDef`**, **`isBookIntroductionPmEmpty`** (export).
- **`@usfm-tools/editor`:** **`EditorMode`** (`basic` \| `medium` \| `advanced`), **`BASIC_MARKERS`**, **`getMarkerChoicesForMode`** — three-tier marker UI depth.

### Changed

- **`@usfm-tools/editor-app`:** In **Basic** and **Medium** marker modes, block menus, the **`\\`** palette, the gutter marker chip, and the floating selection bubble use **word-processor–style labels** with **[Lucide](https://lucide.dev)** icons (pilcrow, heading, lists, quotes, etc., mapped to common document roles). Verse and chapter actions use a bold **V** / **C**; bold/italic in the bubble use Lucide **Bold** / **Italic**. **Advanced** keeps USFM-oriented text and the previous bubble labels. **`WysiwygBubbleAction`** supports an optional **`toolbarIcon`** for icon-only buttons.
- **`@usfm-tools/editor-app`:** **Basic/Medium** gutter “change style” control is a compact **vertical dots** (Lucide **EllipsisVertical**) like Notion; current style name stays in the tooltip. Selection bubble shows **Verse** / **Chapter** **text** next to the **V** / **C** icons. **Document** / **document-dark** themes: **poetry** (`q`–`q3`) gets italic, muted color, and a left border; **list** (`li` / `li1` / `li2`) gets `::before` bullets. Block menus gain **`max-width`**; **`positionFixedLayer`** **`flip`** fallbacks include **`bottom`** / **`bottom-start`** for the inline bubble.

- **`@usfm-tools/editor`:** Translator-section markers (`\ts`, `\ts-s`, `\ts-e`) render as compact inline chips (not `\\ts` text) with **distinct icons and colors** (standalone pin / start flag / end check); **sequential numeric** labels (`tsSection` / `data-ts-section`, **bold** beside the icon) are assigned in **USJ→PM** order (standalone `\\ts` or one `\\ts-s`…`\\ts-e` pair = one chunk); optional **`sid` / `eid`** remain in **tooltips** only. **`nextTsSection`** / **`TsState`** exported; windowed **`chapterSubsetToPm`** advances the counter through **skipped** chapter bodies so numbering stays document-global. **`translatorSectionVariantFromMarker`** is exported. Size uses **`rem`** so chips stay small next to large book titles. Standalone **block-level** `ms` nodes with those markers are **hoisted into the nearest paragraph** on USJ→ProseMirror (including **book titles** and **introduction**, not only chapter bodies). **`insertTranslatorSection`** inserts a **`milestone_inline`** atom at the caret (inside the current paragraph) instead of a block after the paragraph.
- **`@usfm-tools/editor`:** **Simplified marker palette** — **`CONTEXT_AWARE_MARKERS`** and **`getSimplifiedMarkerChoices`** map a short list of user-facing labels to the correct USFM marker per **`EditorSection`**. **`@usfm-tools/editor-app`:** **Marker mode** selector (**Basic (draft)** / **Medium** / **Advanced**) in the overflow menu; persisted as **`usfm-editor-mode`**; **`data-usfm-mode`** on the ProseMirror root (replaces **`data-usfm-advanced`**). **Basic** — minimal paragraph markers + verse/chapter/split; **Medium** — same friendly list as before; **Advanced** — full **`getValidParagraphMarkers`** list in gutter and **`\\`** palette. **Translator section (`\\ts`)** is omitted from the add menu in Basic. Removed the palette **“All markers”** checkbox and **`usfm-editor-palette-all-markers`**. Legacy **`usfm-editor-advanced-mode`** migrates once to **`advanced`**.
- **`@usfm-tools/editor`:** **`book_introduction`** is **always** created in **`usjDocumentToPm`** (and windowed **`chapterSubsetToPm`**); empty docs use placeholder **`\\is1`** + **`\\ip`** with **`collapsed: true`**. **`bookIntroductionCollapsePlugin`** collapses when empty and the selection is outside; **`isBookIntroductionPmEmpty`** — empty intro **omitted** on USJ export. **`getStructuralInsertions`** no longer includes **`canInsertBookIntroduction`** (intro is structural by default).
- **`@usfm-tools/editor`:** **`usfm-markers.css`** (checked in) is generated from **`packages/usfm-editor/data/usfm.sty`** by **`scripts/generate-marker-css.mjs`** on **`bun run build`**; **`chrome.css`** `@import`s it for Paratext-style paragraph/character typography (`.usfm-para` / `.usfm-char`).

### Fixed

- **`@usfm-tools/editor-app`:** Gutter **+** / **Turn into** / **`\\`** marker palettes and the inline **bubble** use **`@floating-ui/dom`** (`flip` + `shift`) so menus stay within the viewport; block menus also **`max-height`** + scroll, **`max-width`**, and expanded **`flip`** placements so popovers stay on-screen near edges.
- **`@usfm-tools/editor`:** Pressing **Enter** at the **end** of a chapter paragraph no longer inserts a second **`\\id`** line (`book` node with default **`UNK`**). `book` was removed from the generic `block` group and **`header`** content now lists allowed node types explicitly so ProseMirror **`splitBlock`**’s `defaultBlockAt` resolves to **`paragraph`** in chapter bodies.
- **`rebuildAlignedUsj` / `rebuildArray`:** nested verse `content` now receives the verse `sid` so `rebuildVerseInlineContent` runs for string siblings (partial alignment rebuild).
- **CodeQL / hygiene:** `applyOperation` ignores `setAttr` on `__proto__` / `constructor` / `prototype`; `extractXmlTextContent` uses a linear tag scan; oracle `mdTable` escapes backslashes before pipes.
