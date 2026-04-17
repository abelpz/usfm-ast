# Enhanced project format (DCS repos)

This document defines an **enhanced** layout for Door43 / Gitea repositories that extend standard **Scripture Burrito (SB)** and **Resource Container (RC)** projects with:

- **`alignments/`** — external alignment layers (JSON), keyed by source text identity
- **`checking/`** — append-only translation checking records (JSON)
- **`resources/`** (optional) — cached auxiliary resources for offline use

USFM under `ingredients/` (SB) or project paths (RC) is stored **without** inline `\\zaln-s` / `\\zaln-e` milestones when using external alignments; the editor may strip milestones on import and persist alignments under `alignments/`. Round-tripping to upstream aligned USFM re-embeds milestones using existing rebuild logic.

---

## 1. Directory layout

```
project-repo/
├── metadata.json                  # Scripture Burrito manifest (when SB)
├── manifest.yaml                  # Resource Container manifest (when RC; dual-format allowed)
│
├── ingredients/                   # SB: scripture text
│   ├── TIT.usfm
│   └── ...
│
├── alignments/                    # External alignment layers
│   ├── manifest.json              # Index of alignment sources
│   ├── el-x-koine_ugnt/           # Directory per source id (stable key)
│   │   ├── TIT.alignment.json
│   └── ...
│
├── checking/                      # Translation checking (append-only JSON)
│   ├── manifest.json
│   ├── TIT.checking.json
│   └── ...
│
├── resources/                     # Optional bundled helps cache
│   ├── manifest.json
│   └── ...
│
├── LICENSE.md
└── README.md
```

RC-only flat book filenames (e.g. `57-TIT.usfm`) are still valid; enhanced folders live alongside them.

---

## 2. `alignments/manifest.json`

```json
{
  "version": "1",
  "sources": [
    {
      "id": "el-x-koine_ugnt",
      "language": "el-x-koine",
      "identifier": "ugnt",
      "version": "0.34",
      "directory": "el-x-koine_ugnt"
    }
  ]
}
```

- **`directory`** must match the subdirectory name under `alignments/`.
- **`id`** is the canonical key used in app logic and paths.

---

## 3. Per-book alignment files

Path: `alignments/{directory}/{BOOK}.alignment.json` (e.g. `alignments/el-x-koine_ugnt/TIT.alignment.json`).

Content uses the canonical **`AlignmentDocument`** shape from `@usfm-tools/types` / `alignment-io.ts`:

- `format`: `"usfm-alignment"`
- `version`: `"1.0"`
- `translation` / `source` party ids
- `verses`: `AlignmentMap` (verse SIDs → alignment groups)

Serialization: `serializeAlignmentJson` / `parseAlignmentJson` in `packages/usfm-editor-core/src/alignment-io.ts`.

---

## 4. `checking/manifest.json`

```json
{
  "version": "1",
  "schemaVersion": "1",
  "title": "Translation checking"
}
```

---

## 5. Per-book checking files

Path: `checking/{BOOK}.checking.json`.

Append-only array of records. To “edit” a comment, append a new entry with `supersedes` pointing at the prior `id`.

```json
{
  "meta": { "book": "TIT", "schemaVersion": "1" },
  "entries": [
    {
      "id": "uuid",
      "type": "comment",
      "ref": "TIT 1:1",
      "author": "user@example.com",
      "timestamp": "2026-04-12T10:00:00Z",
      "body": "Consider alternative rendering...",
      "resolved": false,
      "supersedes": null
    },
    {
      "id": "uuid2",
      "type": "decision",
      "ref": "TIT 1:1",
      "author": "reviewer@example.com",
      "timestamp": "2026-04-12T11:00:00Z",
      "status": "approved",
      "note": "Rendering is accurate.",
      "supersedes": null
    }
  ]
}
```

Types: `CheckingBookFile`, `CheckingEntry*` in `packages/usfm-editor-core/src/project-format.ts` and `checking-store.ts`.

---

## 6. Scripture Burrito conformance (`metadata.json`)

Declare ingredients with JSON MIME types and custom roles (SB allows extended roles):

| Path | mimeType | role |
|------|----------|------|
| `ingredients/TIT.usfm` | `text/x-usfm` | (default) |
| `alignments/el-x-koine_ugnt/TIT.alignment.json` | `application/json` | `x-alignment` |
| `checking/TIT.checking.json` | `application/json` | `x-checking` |
| `alignments/manifest.json` | `application/json` | `x-alignment-manifest` |
| `checking/manifest.json` | `application/json` | `x-checking-manifest` |

Use `scope` where applicable so validators know which books are covered.

Optional root extension (already used in tooling): `x-checkingConfig` may point at `checking/` for UI defaults:

```json
"x-checkingConfig": {
  "path": "checking/",
  "stagesFile": "checking/stages.json"
}
```

---

## 7. Resource Container conformance (`manifest.yaml`)

RC 0.2 ignores unknown keys. Add a top-level **`extensions`** block (some tooling also accepts `x_extensions`):

```yaml
extensions:
  alignments:
    sources:
      - identifier: ugnt
        language: el-x-koine
        path: ./alignments/el-x-koine_ugnt/
  checking:
    schema_version: "1"
    path: ./checking/
```

The editor’s RC parser maps `x_extensions` ↔ `extensions` pragmatically where needed.

---

## 8. Git conventions

- Prefer **append-only** updates to `checking/*.json` so diffs grow at the end of `entries`.
- Optional **`.gitattributes`**:

  ```
  checking/*.json merge=union
  ```

  so parallel appends merge more cleanly.

---

## 9. Detection

A repo is treated as **enhanced** when **both** of these exist at the repo root (for the current ref):

- `alignments/manifest.json`
- `checking/manifest.json`

See `probeEnhancedLayout` in `@usfm-tools/project-formats` and `loadDcsProjectDescriptor` in the editor app.

---

## 10. Related code

| Area | Location |
|------|----------|
| TypeScript types | `packages/usfm-editor-core/src/project-format.ts` |
| External alignment I/O | `packages/usfm-editor-core/src/alignment-io-external.ts` |
| Checking store | `packages/usfm-editor-core/src/checking-store.ts` |
| DCS sync (extra paths) | `packages/usfm-editor-core/src/sync/dcs-sync-plugin.ts`, `packages/usfm-editor-adapters/src/dcs-git-sync-adapter.ts` |
| Scaffold / create | `packages/usfm-editor-app/src/lib/project-create.ts`, `packages/usfm-editor-project-formats/src/scaffold-enhanced-project.ts` |
