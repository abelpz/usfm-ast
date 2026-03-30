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
- Oracle: `oracles:batch-examples` (curated `examples/usfm-markers`), `oracles:summarize`, [`docs/17-oracle-comparison.md`](./docs/17-oracle-comparison.md). Refreshed `oracle-out/ORACLE_REPORT.md` (metrics depend on local Python/usfmtc).

### Changed

- (none yet — populate when releasing)
