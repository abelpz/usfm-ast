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

## External oracles

To compare **usfmtc** and **usfm3** on a file, see [`scripts/oracles/README.md`](../scripts/oracles/README.md) and `bun run oracles:compare`.
