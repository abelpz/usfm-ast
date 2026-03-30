# External parser comparison (oracles)

Optional tooling to compare **usfmtc** (Python, USFM TC) and **usfm3** (npm, Rust/WASM) against repo USFM files, and to compare **this repo’s** USFM → USJ and USFM → USX against those oracles using **tolerant** similarity (not byte equality).

## Parser + USXVisitor vs oracles (`compare-parser.mjs`)

After `bun run build` at the repo root (needs **`packages/usfm-parser/dist`** and **`packages/usfm-adapters/dist`** — both are built by the default turbo build):

```bash
bun run oracles:parity
# or
node scripts/oracles/compare-parser.mjs packages/usfm-parser/tests/fixtures/usfm/basic.usfm
```

When **usfmtc** is available (Python 3; the scripts install **`usfmtc`** from `scripts/oracles/requirements.txt` automatically on first run unless **`ORACLE_SKIP_USFMTC_PIP=1`**):

1. **USJ:** `USFMParser.prototype.toJSON()` vs usfmtc `outUsj` — text + USJ node-type histogram (`compareUsjSimilarity`).
2. **USX:** `USXVisitor` vs usfmtc `outUsx` — parsed XML DOM: hierarchy, element names, and attributes (`compareUsxSimilarity`; character data between tags is ignored). For **usfmtc**, the visitor uses `{ verseMilestones: 'minimal', inlineBareSectionMilestones: true }` so output matches typical `outUsx` (no verse/chapter `eid` milestones; bare `\sN` as `<ms x-bare="true"/>` inside the previous paragraph). The **usfm3** comparison still uses the default visitor (explicit milestones, `usx` 3.0), which tracks that toolchain more closely.

### Custom markers

- **usfmtc (Python):** `scripts/oracles/usfmtc_dump.py` only calls `usfmtc.readFile(path)`. There is no hook in this repo to pass a custom marker registry into usfmtc. Non-standard markers are handled however the upstream library implements them; for fair parity, prefer fixtures that use markers both stacks understand, or treat large divergences as expected when comparing to usfmtc.
- **@usfm-tools/parser (Node):** Oracle scripts can supply `customMarkers` per file via `scripts/oracles/fixture-custom-markers.json` (JSON object: keys are repo-relative paths or basenames, values are `USFMParser` `customMarkers` maps). Override the file path with **`ORACLE_CUSTOM_MARKERS_JSON`**. Empty `{}` is the default (no extra markers).

Exit **1** if either USJ or USX (vs usfmtc) is below the default thresholds. If usfmtc is missing, the script exits **0** and only prints a short summary (set **`ORACLE_REQUIRE_USFMTC=1`** to fail when usfmtc cannot run).

**Optional third block — USX vs usfm3:** if **`ORACLE_SKIP_USFM3`** is not set, the script runs `dump-usfm3.mjs` and prints **`compareUsxSimilarity(oursUsx, usfm3Usx)`** for information; **exit code** is still driven only by the **usfmtc** USJ+USX checks.

Programmatic API: `@usfm-tools/parser/oracle` exports `compareUsjSimilarity`, `compareUsxSimilarity`, `flattenTextNodes`, `extractXmlTextContent`, etc.

## One-shot (external tools only)

From the repo root (after `bun install`):

```bash
bun run oracles:compare -- packages/usfm-parser/tests/fixtures/usfm/basic.usfm --out ./oracle-out
```

To refresh artifacts and write **`oracle-out/ORACLE_REPORT.md`** (metrics + USJ type table + qualitative notes):

```bash
bun run oracles:report
# or: node scripts/oracles/generate-report.mjs path/to/file.usfm --out ./oracle-out
#     add --no-refresh to skip re-running compare.mjs
```

Each run also writes **`ORACLE_METRICS.json`** (machine-readable scores) next to the report.

### Batch: multiple complex fixtures

Run compare + report for a **curated list** (basic, medium, complex, BSB Titus, list, milestones, Revelation LSG, alignment, table, jmp):

```bash
bun run oracles:batch
```

Outputs live under **`oracle-out/batch/<slug>/`** plus a summary **`oracle-out/batch/BATCH_REPORT.md`**. Default exit code **0** (survey). Use **`--strict`** to exit **1** if any USJ or USX (vs usfmtc) check fails:

```bash
bun run oracles:batch -- --strict
```

Pass extra USFM paths to include more files:

```bash
node scripts/oracles/oracle-batch.mjs examples/usfm-markers/note-x/x-example-1/example.usfm
```

Curated **`examples/usfm-markers`** only (12 files, see `EXAMPLE_MARKER_FIXTURES` in `oracle-batch.mjs`):

```bash
bun run oracles:batch-examples
# → oracle-out/batch-examples/BATCH_REPORT.md
```

Summarize **USX vs usfm3** (and USJ vs usfmtc when present) for any batch directory:

```bash
bun run oracles:summarize
bun run oracles:summarize oracle-out/batch-examples
```

See also [`docs/17-oracle-comparison.md`](../../docs/17-oracle-comparison.md).

## Requirements

- **usfmtc:** Python 3. If the `usfmtc` module is missing, oracle scripts run `python -m pip install -r scripts/oracles/requirements.txt` once (disable with **`ORACLE_SKIP_USFMTC_PIP=1`**). If `python` on your PATH is wrong (common on Windows when another app ships Python), set **`PYTHON`** or **`python`** (lowercase env) to a full interpreter path (for example Python 3.11 from python.org).
- **usfm3:** Declared as a **root devDependency**; `bun install` installs it for `dump-usfm3.mjs`.

## Outputs

| File                                             | Source                                         |
| ------------------------------------------------ | ---------------------------------------------- |
| `usfmtc.usj.json`, `usfmtc.usx`                  | `usfmtc.readFile` → `outUsj` / `outUsx`        |
| `usfm3.usx`, `usfm3.vref.json`, `usfm3.usj.json` | `usfm3` `parse` → `toUsx` / `toVref` / `toUsj` |

**Note:** Current **npm `usfm3`** releases may return an empty object from **`toUsj()`** while **USX** and **vref** are populated. Prefer **USX** or **vref** when comparing to **usfmtc** until upstream fixes USJ export.
