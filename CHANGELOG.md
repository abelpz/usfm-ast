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

- `USFMParser` options `silentConsole` and `logger` for production-friendly logging (`getLogs()` unchanged). See [`docs/16-production-readiness.md`](./docs/16-production-readiness.md).
- CI checks: `examples:check` (golden USJ coverage), parser perf budget test.
- Contributor docs: production readiness, issue template for parser mismatches.
- Oracle: `oracles:batch-examples` (curated `examples/usfm-markers`), `oracles:batch-examples-all` (full `**/example.usfm` tree), `oracles:summarize`, [`docs/17-oracle-comparison.md`](./docs/17-oracle-comparison.md). Refreshed `oracle-out/ORACLE_REPORT.md` (metrics depend on local Python/usfmtc).
- Adapter tests: `conversion-roundtrip.test.ts` covers all unique package `fixtures/**/*.usfm` (deduped parser vs adapters); milestone fixture checks USX is well-formed before/after round-trip instead of similarity (until USX/milestone parity improves).
- Docs: upstream parser repos in [`docs/17-oracle-comparison.md`](./docs/17-oracle-comparison.md). Slightly **stricter** default `compareUsjSimilarity` / `compareUsxSimilarity` thresholds and tighter `fixture-matrix` / `conversion-roundtrip` alignment checks.
- **`bun run roundtrip-diff`** — unified diffs for USFM / USJ / USX after one round-trip (`scripts/roundtrip-diff.mjs`, devDependency `diff`). See [`docs/10-parsing-quickstart.md`](./docs/10-parsing-quickstart.md).
- **`USFMOutputBuffer`** (`@usfm-tools/formatter`) with `clear` / `trimEnd` / `getTrailingContext`; **`USFMFormatter`** buffer helpers (`appendTextContentToBuffer`, `appendAttributesToBuffer`, `mergeMarkerIntoBuffer`, `mergeMilestoneIntoBuffer`) for visitor serialization without allocating a new full string on every text/close-marker append.
- **`USFMVisitor`** and **`UniversalUSFMVisitorImpl`** build USFM via `USFMOutputBuffer`; **`USFMOutputBuffer`** re-exported from `@usfm-tools/adapters`.
- **`@usfm-tools/editor-core`** — `DocumentStore`, chapter slicing, alignment strip/rebuild, document diff, OT helpers (`packages/usfm-editor-core`).

### Changed

- (none yet — populate when releasing)

### Fixed

- **`rebuildAlignedUsj` / `rebuildArray`:** nested verse `content` now receives the verse `sid` so `rebuildVerseInlineContent` runs for string siblings (partial alignment rebuild).
