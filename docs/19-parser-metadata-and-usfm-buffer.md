# Parser metadata and USFM output buffer

Two implementation-focused topics: **non-JSON parse metadata** on AST nodes (stable ids, optional **source spans**), and **incremental USFM serialization** via **`USFMOutputBuffer`** used by visitors.

## Parser node metadata (`@usfm-tools/parser`)

During parsing, the AST can carry **non-enumerable** fields used for tooling and round-tripping:

- **`_nodeId`** — stable numeric id per node (assigned in `finalizeParsedTree`).
- **`_sourceSpan`** — `{ start, end }` UTF-16 code unit offsets into the original USFM string when **`sourcePositions`** is enabled.

They are **not** visible to `JSON.stringify` / typical `toJSON()` USJ output, so USJ documents stay spec-clean. Read them with the public helpers:

```typescript
import {
  USFMParser,
  getParserNodeId,
  getParserSourceSpan,
} from '@usfm-tools/parser';

const parser = new USFMParser({ sourcePositions: true });
parser.parse(usfmText);
const nodes = parser.getNodes();
const first = nodes[0];
if (first && typeof first === 'object') {
  console.log(getParserNodeId(first));
  console.log(getParserSourceSpan(first)); // { start, end } | undefined
}
```

### Advanced: `finalizeParsedTree` / `propagateSourceSpans`

Library authors integrating custom pipelines can import **`finalizeParsedTree`** and **`propagateSourceSpans`** from `@usfm-tools/parser` (re-exported from the parser module) to align metadata with your tree lifecycle. Most apps only need **`USFMParser`** + **`getParserNodeId`** / **`getParserSourceSpan`**.

### Types

**`SourceSpan`**, **`ParserNodeMeta`**, **`RootSourceSpanMap`** (WeakMap from root to span maps) are exported for typing.

## `USFMOutputBuffer` (`@usfm-tools/formatter`)

**`USFMFormatter`** can append to a **`USFMOutputBuffer`** instead of building a single giant string for every token. The buffer:

- Stores **append-only** string fragments.
- Exposes **`getTrailingContext(maxChars)`** so formatting rules can scan **recent** output without copying the full document (bounded lookback).
- Supports **`clear`**, **`trimEnd`**, etc., for visitor resets.

**`USFMVisitor`** (and **Universal USFM** visitor) in **`@usfm-tools/adapters`** serialize through this path for large documents.

Typical usage is **internal** to the formatter/visitors. If you implement a **custom** visitor that still wants bounded backward context, obtain a **`USFMFormatter`** and use its buffer helpers (`appendTextContentToBuffer`, `mergeMarkerIntoBuffer`, … — see `packages/usfm-formatter/src/formatters/Formatter.ts`).

```typescript
// Most users: rely on USFMVisitor from @usfm-tools/adapters (buffer-backed by default).
import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '@usfm-tools/adapters';

const parser = new USFMParser();
parser.parse(usfmText);
const visitor = new USFMVisitor();
parser.visit(visitor);
const usfm = visitor.getResult();
```

**Re-export:** `USFMOutputBuffer` is re-exported from **`@usfm-tools/adapters`** for convenience.

## Related

- [Parsing quickstart](./10-parsing-quickstart.md)  
- [Editor core](./18-editor-core.md)  
- [`CHANGELOG.md`](../CHANGELOG.md) — notable API additions  
