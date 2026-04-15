# @usfm-tools/project-formats

Parse and summarize **Scripture Burrito** `metadata.json` and **Resource Container** `manifest.yaml`, detect repo layout from root file names, and build `EnhancedProjectSummary` for dashboards (including pragmatic `x-` / `x_` extensions from the enhanced project model).

No network I/O — consumers load bytes from DCS, disk, or elsewhere and call the pure parsers.

## API

- `parseScriptureBurrito`, `listSBBooks`, `isSBIngredientUsfm` — SB metadata + book list
- `parseResourceContainer`, `listRCBooks` — RC manifest + book list
- `detectRepoFormatFromRootEntries` — classify `scripture-burrito` | `resource-container` | `raw-usfm` from root directory entries
- `booksFromDetectedProject` — unified book list from a loaded descriptor
- `summarizeEnhancedProject` — `EnhancedProjectSummary` (alignment dirs, active alignment, checkings paths, provenance-aware book list)
- `projectSourceSummaryFromSb` / `projectSourceSummaryFromRc` — per-book `x-source` / `x_source` provenance maps
- `outdatedBooksBySource` — compare recorded vs catalog versions (string compare)

## Dependencies

- `@usfm-tools/types`
- `js-yaml`
