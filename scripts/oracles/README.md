# External parser comparison (oracles)

Optional tooling to compare **usfmtc** (Python, USFM TC) and **usfm3** (npm, Rust/WASM) against repo USFM files.

## One-shot

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
