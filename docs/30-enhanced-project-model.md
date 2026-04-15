# Enhanced Translation Project Model

This document specifies the **Enhanced Translation Project**: a Door43/Git repository layout and metadata extensions that build on **Scripture Burrito (SB)** and **Resource Container (RC)** while adding separate alignment storage, in-repo checking/review artifacts, optional bundled translation helps, and project-level extensions.

## Goals

- **Dual-layer alignments**: USFM may embed the *active* alignment (`\zaln-s` / `\zaln-e`); the `alignments/` directory holds *all* alignment sets (e.g. per gateway language) for swap/extract/strip/merge workflows.
- **Per-book source provenance**: Record which source resource and version each book was translated against (`x_source` on RC projects; pragmatic `x-source` on SB ingredients).
- **Checking / review**: Stages, sessions, checklists, comments (with optional `selectedText`, cross-verse ranges), and decisions under `checkings/`.
- **Git history for checkings**: Journal-style JSON (self-describing) plus **git tags** on stage completion (`checking/{stageId}/{sessionId}`); batch commits for DCS sync.
- **Translation helps (Plan 3)**: Single reference panel with annotated source text, TWL/TN preloaded per chapter, TW/TA modals—see roadmap in the implementation plan.

## Directory layout (SB-first, RC compatible)

```
metadata.json              # SB (preferred)
manifest.yaml              # RC (optional, backward compat)
ingredients/*.usfm          # SB scripture paths
*.usfm                     # RC root USFM (legacy)
alignments/
  {sourceLanguage}/
    {BOOK}.alignment.json
  README.md
checkings/
  stages.json
  checklist-templates/*.json
  sessions/*.json
  checklists/{sessionId}/*.json
  comments/{BOOK}.comments.json
  decisions/{BOOK}.decisions.json
  README.md
resources/                  # optional cache for helps (tw, tn, tq, ta, custom)
extensions/
  checking/*.js             # optional developer extensions
```

## Scripture Burrito extensions (pragmatic)

- **Schema-valid**: register alignment/checking JSON as ingredients with `role` values matching `x-` token pattern, e.g. `x-alignment`, `x-checkingComments`.
- **Pragmatic (not strictly SB-schema)**: root `x-activeAlignment`, `x-checkingConfig`; per-ingredient `x-source` arrays for provenance. DCS and most consumers tolerate extra keys; document and preserve them.

## Resource Container extensions (pragmatic)

- `x_source` on each `projects[]` entry (YAML underscore convention).
- Top-level `x_extensions` for `alignments`, `checkings`, `resources` paths and active alignment map.

## Alignment directory JSON

Use the existing **`AlignmentDocument`** shape from `@usfm-tools/types` / `alignment-io` (`format: usfm-alignment`, `verses` keyed by verse SIDs such as `GEN 1:1`). Track which file is active via manifest `x-activeAlignment` / `x_extensions.alignments.active`.

Operations: **extract** (embedded → file), **strip** (remove milestones from USFM), **merge** (file → embedded), **swap** (strip + merge).

## Checking data (summary)

- **`stages.json`**: ordered `ReviewStage` definitions; optional `defaultChecklists` per stage.
- **Sessions**: `stageId`, reviewers, scope books.
- **Checklists**: templates + instantiated files with items (`scripture-range` | `term` | `custom`), statuses, assignees, comments.
- **Comments / decisions**: `ScriptureRef` (`start` + optional `end` for ranges); optional `selectedText` with `verseSnapshots`; `stageId`; `resolveTextReference` states: `exact` | `relocated` | `approximate` | `stale` (computed at display time).

## Packages (architecture)

| Package | Responsibility |
|---------|------------------|
| `@usfm-tools/types` | Shared interfaces: project, checking, helps |
| `@usfm-tools/project-formats` | Parse SB/RC, detect format, unified project view |
| `@usfm-tools/checking` | Checking domain logic + extension API |
| `@usfm-tools/editor-core` | Alignment directory I/O (USFM ↔ AlignmentDocument) |
| `@usfm-tools/editor-adapters` | DCS sync, resource loaders / QuoteMatcher (Plan 3); `DcsRestProjectSync` (Contents API) for local project → Door43 |
| `@usfm-tools/editor-app` | UI, wizards, panels; local project dashboard links a repo via `ProjectMeta.syncConfig` and auto-pushes from the editor |

## References

- Scripture Burrito: https://docs.burrito.bible/
- RC manifest: https://resource-container.readthedocs.io/
- CCR v2 workflow context: `uW-Tools-Collab` docs under `docs/6-enhanced-project-format/`
