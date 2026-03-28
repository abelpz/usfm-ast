# External parser comparison (oracles)

Optional tooling to compare **usfmtc** (Python, USFM TC) and **usfm3** (npm, Rust/WASM) against repo USFM files, and to compare **this repo’s** USFM → USJ and USFM → USX against those oracles using **tolerant** similarity (not byte equality).

## Parser + USXVisitor vs oracles (`compare-parser.mjs`)

After `bun run build` at the repo root (needs **`packages/usfm-parser/dist`** and **`packages/usfm-adapters/dist`** — both are built by the default turbo build):

```bash
bun run oracles:parity
# or
node scripts/oracles/compare-parser.mjs packages/usfm-parser/tests/fixtures/usfm/basic.usfm
```

When **usfmtc** is available (Python + `pip install usfmtc`):

1. **USJ:** `USFMParser.prototype.toJSON()` vs usfmtc `outUsj` — text + USJ node-type histogram (`compareUsjSimilarity`).
2. **USX:** `USXVisitor` on the same parse vs usfmtc `outUsx` — text extracted from XML + tag-name histogram (`compareUsxSimilarity`).

Exit **1** if either USJ or USX (vs usfmtc) is below the default thresholds. If usfmtc is missing, the script exits **0** and only prints a short summary (set **`ORACLE_REQUIRE_USFMTC=1`** to fail when usfmtc cannot run).

**Optional third block — USX vs usfm3:** if **`ORACLE_SKIP_USFM3`** is not set, the script runs `dump-usfm3.mjs` and prints **`compareUsxSimilarity(oursUsx, usfm3Usx)`** for information; **exit code** is still driven only by the **usfmtc** USJ+USX checks.

Programmatic API: `@usfm-tools/parser/oracle` exports `compareUsjSimilarity`, `compareUsxSimilarity`, `flattenTextNodes`, `extractXmlTextContent`, etc.

## One-shot (external tools only)

From the repo root (after `bun install`):

```bash
bun run oracles:compare -- packages/usfm-parser/tests/fixtures/usfm/basic.usfm --out ./oracle-out
```

## Requirements

- **usfmtc:** Python 3 with `pip install usfmtc`. If `python` on your PATH is wrong (common on Windows when another app ships Python), set **`PYTHON`** to a full interpreter path (for example Python 3.11 from python.org).
- **usfm3:** Declared as a **root devDependency**; `bun install` installs it for `dump-usfm3.mjs`.

## Outputs

| File                                             | Source                                         |
| ------------------------------------------------ | ---------------------------------------------- |
| `usfmtc.usj.json`, `usfmtc.usx`                  | `usfmtc.readFile` → `outUsj` / `outUsx`        |
| `usfm3.usx`, `usfm3.vref.json`, `usfm3.usj.json` | `usfm3` `parse` → `toUsx` / `toVref` / `toUsj` |

**Note:** Current **npm `usfm3`** releases may return an empty object from **`toUsj()`** while **USX** and **vref** are populated. Prefer **USX** or **vref** when comparing to **usfmtc** until upstream fixes USJ export.
