# Changelog

All notable changes to `@usfm-tools/ptxprint-driver` are documented here.

## [0.2.1] — 2026-04-29

### Added

- **Full PTXprint CLI pass-through** — all remaining useful PTXprint flags are now exposed in `RenderOptions` and forwarded verbatim to the executable:
  - `fontPaths?: string[]` → `-f` (repeatable font search directories)
  - `pdfVersion?: number` → `-V` (e.g. `14` for PDF 1.4, `17` for PDF 1.7)
  - `xetexTimeoutSec?: number` → `--timeout` (XeTeX-level; distinct from the Node spawn `timeoutMs`)
  - `xetexRuns?: number` → `-R` (max XeTeX re-runs)
  - `quiet?: boolean` → `-q` (suppress splash)
  - `noInternet?: boolean` → `-N` (offline reproducible builds)
  - `ptxDefine?: Record<string,string>` → `-D` (repeatable component=value)
  - `debugMode?: boolean` → `--debug`
  - `logLevel?: string` → `-l`
  - `logFile?: string` → `--logfile`
  - `macrosDir?: string` → `-m`
  - `extras?: string` → `-z`
- Unit tests (`tests/runPtxprint.test.ts`) verifying the args array built for each new option, including multi-book `-b` joining and per-flag presence/absence.
- `@usfm-tools/ptxprint-cli` package: zero-dependency Node.js CLI (`usfm2pdf`) exposing all `RenderOptions` as flags plus the new PTXprint pass-through flags, with built-in `tit`/`jhn` fixtures for smoke testing.

## [0.2.0] — 2026-04-29

### Added

- **Multi-book PDF** via `usfmsToPdf(inputs, opts)`. Accepts an array of USFM/USJ/USX inputs and produces a single combined PDF. PTXprint output is named `<FIRST>-<SECOND>-…_ptxp.pdf`.
- **`cfgOverrides`** (`PtxprintCfgSections`) on `RenderOptions`: arbitrary `ptxprint.cfg` sections merged after typed defaults. Driver-managed keys (`project/id`, `book`, `bookscope`, `booklist`, `document/ifmainbodytext`) are re-applied last and cannot be overridden.
- **New typed `RenderOptions` fields**:
  - Typography: `fontSizePt`, `lineSpacingPt`, `justify`, `hyphenate`
  - Margins: `marginsMm`, `topMarginMm`, `bottomMarginMm`, `headerRuleMm`
  - Page numbers: `pageNumbers` (`'none'` | `'footer-center'` | `'header-center'` | `'header-outer'`), `startPageNum`
  - Layout: `mirrorMargins`
  - Content toggles: `footnotes`, `crossRefs`, `sectionHeads`, `chapterNumbers`, `verseNumbers`
- **`PTXPRINT_BODY_FONT` environment variable** for process-level font override (takes precedence over `fontFamily` in options).
- **Bundled DejaVu Serif** (`vendor/fonts/DejaVuSerif.ttf`) as the default body font — no system font required for basic rendering.
- New low-level exports: `usfmsToPdf`, `scaffoldProject`, `BookEntry`, `ScaffoldMultiBookArgs`, `mergeCfgOverrides`, `PtxprintCfgSections`.
- Integration tests for multi-book output and `cfgOverrides` (gated behind `PTXPRINT_INTEGRATION=1`).

### Fixed

- **`pgsperspread` crash** (`TypeError: int() argument must be a string … not 'NoneType'`): added a complete `[finishing]` section with safe defaults.
- **`ifmainbodytext` missing**: PTXprint was stripping all verse content when this key was absent; it is now always set to `True`.
- **`ValueError: Not a boolean: %`**: footer keys `ifftrtitlepagenum` and `ifprintconfigname` were emitted as `%`; changed to `False`.
- **Multi-book PDF not found**: the `-b` CLI argument now passes a space-separated list of all book codes (e.g. `-b "JHN GEN"`) so PTXprint enters multi-book mode and names the PDF correctly.
- **Font loading**: removed `--nofontcache` from the PTXprint invocation; added bold/italic/bolditalic font declarations using XeTeX `embolden`/`slant` features to prevent "font not loadable" errors when only a regular face is available.

### Changed

- `buildPtxprintCfg` refactored to a three-phase Map-based merge: typed defaults → `cfgOverrides` → protected project keys.
- `ptxprintCfg.ts` uses `reorderSections()` to emit a consistent section order.
- `marginUnitInches` is now `@deprecated`; use `marginsMm` instead.

## [0.1.0] — initial release

- `usfmToPdf`, `diglotToPdf`, basic scaffold and run pipeline.
- USFM / USJ / USX polymorphic input via `@usfm-tools/adapters`.
