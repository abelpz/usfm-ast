# Oracle comparison (usfmtc, usfm3)

Use this when you want **quantitative** comparison of **`@usfm-tools/parser`** and **`USXVisitor`** against reference stacks, not just our own goldens.

## Prerequisites

| Backend | Purpose | Setup |
| -------- | -------- | ----- |
| **Built JS** | `compare.mjs` loads `packages/usfm-parser/dist` | `bun run build` (or at least `@usfm-tools/parser` + `@usfm-tools/adapters`) |
| **Python `usfmtc`** | USJ + USX from the USFM TC toolchain | `pip install -r scripts/oracles/requirements.txt` using a **real** Python 3.11+ (not Inkscape’s `python`). Set **`PYTHON`** to that `python.exe` if `python` on `PATH` is wrong. |
| **npm `usfm3`** | USX / vref (USJ from npm is often a placeholder) | Root `bun install` (devDependency) |

If `usfmtc` does not run, `ORACLE_STATUS.json` shows `usfmtc.ok: false` and batch tables show **—** for USJ vs usfmtc — but you still get **USX vs npm `usfm3`** metrics from `ORACLE_METRICS.json`.

## Commands

```bash
# Single file → oracle-out/
bun run oracles:compare -- packages/usfm-parser/tests/fixtures/usfm/basic.usfm --out ./oracle-out
bun run oracles:report -- packages/usfm-parser/tests/fixtures/usfm/basic.usfm --out ./oracle-out

# Default batch (10 package fixtures) → oracle-out/batch/
bun run oracles:batch

# Curated examples/usfm-markers (12 files) → oracle-out/batch-examples/
bun run oracles:batch-examples

# Every examples/usfm-markers/**/example.usfm (aligns with fixture-matrix corpus)
bun run oracles:batch-examples-all

# Compact table (USX vs usfm3, and USJ vs usfmtc when available)
bun run oracles:summarize
bun run oracles:summarize oracle-out/batch-examples
bun run oracles:summarize oracle-out/batch-examples-all
```

## What “progress” means here

1. **`usfmtc` available** — You get **USJ** and **USX** similarity vs the same input (official-style pipeline). This is the strongest signal for parity with a **complete** USFM→USJ/USX path.
2. **`usfmtc` missing** — Rely on **`usxVsUsfm3`** in each `ORACLE_METRICS.json` (our explicit `USXVisitor` vs npm `usfm3` USX) and on **internal** tests (`fixture-matrix`, `usfmtc-parity` snapshots for `basic` / `medium`).
3. **npm `usfm3` USJ** — Often a **placeholder**; treat **USX** as the npm comparison surface unless you add a Python USJ path.

## Upstream repositories (fixtures, tests, examples)

Use these sources to **add** USFM cases and to understand how reference tools behave. Prefer **small, licensed** snippets adapted into `examples/usfm-markers/` or `packages/*/tests/fixtures/` rather than copying whole Bibles.

| Project | Role | Links |
| -------- | ----- | ----- |
| **usfmtc** | USFM TC reference implementation (Python); what `scripts/oracles/usfmtc_dump.py` calls | [GitHub: usfm-bible/usfmtc](https://github.com/usfm-bible/usfmtc) · [PyPI](https://pypi.org/project/usfmtc/) |
| **usfm3** | Error-tolerant USFM 3.x (Rust → WASM); what `dump-usfm3.mjs` uses | [GitHub: jcuenod/usfm3](https://github.com/jcuenod/usfm3) · [npm](https://www.npmjs.com/package/usfm3) · [crates.io](https://crates.io/crates/usfm3) |
| **tcdocs** | Committee docs (markers, migration notes) | [GitHub: usfm-bible/tcdocs](https://github.com/usfm-bible/tcdocs) |

Our **`fixture-matrix`** test already walks every `examples/usfm-markers/**/*.usfm` and package fixtures; new upstream-inspired files there are picked up automatically. **`oracles:batch-examples-all`** runs the same example tree through `compare.mjs`.

## Default similarity thresholds (not byte equality)

Oracle scripts use **`compareUsjSimilarity`** and **`compareUsxSimilarity`** (`packages/usfm-parser/src/oracle/`). They are **tolerant** (Dice bigrams, histograms, DOM alignment) but defaults are tuned to be **meaningful**, not rubber-stamps. Pass requires **both** the blended score **and** each sub-metric to clear its floor.

| API | Combined `minScore` | Other floors |
| --- | ------------------- | ------------ |
| **USJ** | **0.84** | text **0.79**, node-type histogram **0.67** |
| **USX** | **0.73** | structure **0.63**, attributes **0.56**, tag histogram **0.52** |

Some **internal** tests use **stricter** explicit options (e.g. `fixture-matrix` USJVisitor vs `toJSON`, conversion round-trips). For a **known** gap, fix the parser or document it; avoid permanently lowering globals without a tracked reason.

## Latest local batch snapshot (2026-03-30, no usfmtc on PATH)

Summarized with `bun run oracles:summarize oracle-out/batch` and `…/batch-examples`:

**Package fixtures (`oracle-out/batch`):** USX vs `usfm3` **passes** default thresholds for all listed files except **`structure/milestones.usfm`** (structure-heavy; verse/chapter/milestone boundaries differ from npm output).

**Example markers (`oracle-out/batch-examples`):** **Fails** default USX vs `usfm3` on:

- **`fig-fig/fig-example-2`** — combined score ~0.72 (default USX `minScore` **0.73**): borderline / figure markup.
- **`periph-periph/periph-example-1`** — structure similarity very low (~0.15); peripheral / front-matter USX shape diverges most.

These are good **backlog targets** for USX alignment (or documented differences), independent of USJ golden files.

## Related

- [`10-parsing-quickstart.md`](./10-parsing-quickstart.md) — parse flow and oracles overview  
- [`09-ci-and-branch-protection.md`](./09-ci-and-branch-protection.md) — CI does not run full oracle batch; run locally or in a dedicated job after installing `usfmtc`  
