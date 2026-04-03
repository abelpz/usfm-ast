# Parsing and validation quickstart

## Parse USFM to USJ (library)

```typescript
import { USFMParser } from '@usfm-tools/parser';

const parser = new USFMParser();
parser.parse(usfmText);
const usj = parser.toJSON();
```

Build the parser first (`bun run build` or `cd packages/usfm-parser && bun run build`). Workspace packages live under `packages/`.

## Command line

After `bun run build` at the repo root you can use the repo scripts (shortcuts) or call the built CLIs directly:

```bash
# USFM → USJ JSON (stdout). Use "-" or --stdin to read from stdin.
bun run usfm:parse -- path/to/file.usfm
# same as: node packages/usfm-cli/dist/cli.js parse path/to/file.usfm
```

```bash
bun run usfm:validate -- path/to/file.usfm
```

```bash
bun run usj:pretty -- path/to/file.usj.json
```

```bash
# Structural check (root type USJ, version, typed nodes; not a full schema)
bun run usj:validate -- path/to/file.usj.json
```

When published, the same binaries are available as `usfm`, `usfm-validate`, and `usj` via the respective package `bin` fields.

## Examples and goldens

- Marker examples: `examples/usfm-markers/**/example.usfm` and matching `example.usj`.
- Parser fixtures: `packages/usfm-parser/tests/fixtures/usfm/`.
- Regenerate example USJ after intentional parser changes: `bun run regenerate:example-usj` (see [`09-ci-and-branch-protection.md`](./09-ci-and-branch-protection.md)).

## Round-trip diffs (USFM / USJ / USX)

After `bun run build`, see **unified diffs** (original vs after one conversion loop) for each serialized format:

```bash
bun run roundtrip-diff -- packages/usfm-parser/tests/fixtures/usfm/basic.usfm --out ./roundtrip-out
# USJ file: USJ → USFM → parse → USJ
bun run roundtrip-diff -- --usj path/to/example.usj --out ./roundtrip-out
# Optional: extra USX diff with minimal verse milestones (usfmtc-style options)
bun run roundtrip-diff -- path/to/file.usfm --usx-minimal --out ./roundtrip-out
```

Writes `usfm-roundtrip.diff`, `usj-roundtrip.diff`, `usx-roundtrip.diff`, and `SUMMARY.txt` under `--out` (default `./roundtrip-out/`). See `scripts/roundtrip-diff.mjs` header for exact definitions.

## External oracles

To compare **usfmtc** and **usfm3** on a file, see [`scripts/oracles/README.md`](../scripts/oracles/README.md) and `bun run oracles:compare`. For **batch runs**, `PYTHON` setup, and how to read gaps vs official parsers, see [`17-oracle-comparison.md`](./17-oracle-comparison.md).

To compare **`USFMParser` USJ** and **`USXVisitor` USX** with **usfmtc** (tolerant scores), run `bun run build` (parser + adapters) then `bun run oracles:parity` (needs Python + `pip install usfmtc` for a full diff; otherwise the script exits successfully and only summarizes output). See [`scripts/oracles/README.md`](../scripts/oracles/README.md) for `ORACLE_REQUIRE_USFMTC`, `ORACLE_SKIP_USFM3`, and `compare-parser.mjs`.
