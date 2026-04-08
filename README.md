# USFM-USJ Monorepo

A comprehensive toolkit for working with **USFM** (Unified Standard Format Markers), **USJ** (Unified Scripture JSON), and **USX** (Unified Scripture XML) — the three canonical interchange formats for Bible translation data.

## Table of Contents

- [Packages](#packages)
- [Installation](#installation)
- [Conversions](#conversions)
  - [USFM → USJ](#usfm--usj)
  - [USFM → USFM (normalize / roundtrip)](#usfm--usfm-normalize--roundtrip)
  - [USFM → USX](#usfm--usx)
  - [USJ → USFM](#usj--usfm)
  - [USJ validation](#usj-validation)
  - [Oracle comparison (roundtrip quality)](#oracle-comparison-roundtrip-quality)
- [CLI tools](#cli-tools)
- [Advanced](#advanced)
  - [Parser options](#parser-options)
  - [USFMVisitor options](#usfmvisitor-options)
  - [USXVisitor options](#usxvisitor-options)
  - [Custom visitors](#custom-visitors)
- [Monorepo development](#monorepo-development)

---

## Packages

| Package | npm name | Description |
|---|---|---|
| `packages/usfm-parser` | `@usfm-tools/parser` | Parse USFM text into an AST; export USJ via `toJSON()` |
| `packages/usfm-adapters` | `@usfm-tools/adapters` | Visitor-based converters: USFM, USJ, USX output |
| `packages/usfm-formatter` | `@usfm-tools/formatter` | Low-level USFM marker/whitespace formatting rules |
| `packages/shared-types` | `@usfm-tools/types` | Shared TypeScript interfaces and visitor base classes |
| `packages/usfm-validator` | `@usfm-tools/validator` | USFM linting CLI (`usfm-validate`) |
| `packages/usfm-cli` | `@usfm-tools/cli` | `usfm parse` CLI — parse to USJ |
| `packages/usfm-editor-core` | `@usfm-tools/editor-core` | Document store, alignment layer, chapter slices, structured editing |
| `packages/usfm-editor` | `@usfm-tools/editor` | ProseMirror USJ editor (headless): schema, USJ ↔ PM, alignment helpers |
| `packages/usfm-editor-app` | `@usfm-tools/editor-app` (private) | Browser test app for the editor + alignment tool (`bun run editor-app`) |
| `packages/usj-core` | `@usj-tools/core` | `validateUsjStructure` — structural USJ validation |
| `packages/usj-validator` | `@usj-tools/validator` | Re-exports `validateUsjStructure` |
| `packages/usj-cli` | `@usj-tools/cli` | `usj pretty` / `usj validate` CLIs |

---

## Installation

```bash
# Core parsing + conversion
npm install @usfm-tools/parser @usfm-tools/adapters

# USJ validation
npm install @usj-tools/core

# CLI tools (global)
npm install -g @usfm-tools/cli @usj-tools/cli
```

```bash
# Or with Bun
bun add @usfm-tools/parser @usfm-tools/adapters
```

---

## Conversions

### USFM → USJ

`USFMParser.toJSON()` returns a [USJ](https://docs.usfm.bible/usj/) document — a plain JavaScript object that is the canonical JSON representation of the USFM document.

```typescript
import { USFMParser } from '@usfm-tools/parser';

const usfm = `\\id JON Jonah
\\usfm 3.1
\\h Jonah
\\c 1
\\p
\\v 1 Now the word of the LORD came to Jonah.
\\v 2 Arise, go to Nineveh.`;

const parser = new USFMParser();
const usj = parser.parse(usfm).toJSON();

console.log(JSON.stringify(usj, null, 2));
// {
//   "type": "USJ",
//   "version": "3.1",
//   "content": [
//     { "type": "book", "marker": "id", "code": "JON", "content": ["Jonah"] },
//     { "type": "chapter", "marker": "c", "number": "1", "sid": "JON 1" },
//     { "type": "para", "marker": "p", "content": [
//       { "type": "verse", "marker": "v", "number": "1", "sid": "JON 1:1" },
//       "Now the word of the LORD came to Jonah.",
//       ...
//     ]}
//   ]
// }
```

You can also use the chained load/parse form:

```typescript
const usj = new USFMParser().load(usfm).parse().toJSON();
```

Retrieve the AST nodes instead of USJ:

```typescript
const nodes = parser.parse(usfm).getNodes();
```

---

### USFM → USFM (normalize / roundtrip)

`USFMVisitor` serializes the parsed AST back to USFM text. Use this to normalize formatting, strip extra whitespace, or verify roundtrip fidelity.

```typescript
import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '@usfm-tools/adapters';

const rawUsfm = `\\id  TIT\r\n\\c   1\r\n\\p\r\n\\v 1   Paul, a servant of God.`;

const parser = new USFMParser();
parser.parse(rawUsfm);

const visitor = new USFMVisitor();
parser.visit(visitor);

const normalizedUsfm = visitor.getResult();
console.log(normalizedUsfm);
// \id TIT
// \c 1
// \p
// \v 1 Paul, a servant of God.
```

Controlling whitespace handling:

```typescript
const visitor = new USFMVisitor({
  whitespaceHandling: 'normalize',    // 'preserve' | 'normalize' | 'trim-edges' | 'normalize-and-trim'
  formatterOptions: {
    versesOnNewLine: true,            // always put \v on its own line
  },
});
```

---

### USFM → USX

`USXVisitor` serializes the AST as a USX XML string.

```typescript
import { USFMParser } from '@usfm-tools/parser';
import { USXVisitor } from '@usfm-tools/adapters';

const usfm = `\\id MAT Matthew
\\c 1
\\p
\\v 1 The book of the genealogy of Jesus Christ.`;

const parser = new USFMParser();
parser.parse(usfm);

const visitor = new USXVisitor();
parser.visit(visitor);

const usxXml = visitor.getDocument();
console.log(usxXml);
// <?xml version="1.0" encoding="utf-8"?>
// <usx version="3.1">
//   <book code="MAT" style="id">Matthew</book>
//   <chapter number="1" style="c" sid="MAT 1"/>
//   <para style="p">
//     <verse number="1" style="v" sid="MAT 1:1"/>The book of the genealogy of Jesus Christ.
//   </para>
// </usx>
```

Controlling verse milestone style:

```typescript
const visitor = new USXVisitor({
  verseMilestones: 'explicit',           // 'explicit' (default) | 'minimal'
  inlineBareSectionMilestones: true,     // emit bare \sN as <ms> inline (usfmtc style)
});
```

`'explicit'` emits full `sid`/`eid` milestone pairs for chapters and verses.  
`'minimal'` emits only self-closing verse starts (closer to the usfmtc oracle output).

---

### USJ → USFM

`convertUSJDocumentToUSFM` converts a USJ document object directly to USFM text without needing to re-parse. It automatically emits `\usfm {version}` when the document has a `version` field.

```typescript
import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';

const usj = {
  type: 'USJ',
  version: '3.1',
  content: [
    { type: 'book', marker: 'id', code: 'JON', content: ['Jonah'] },
    { type: 'para', marker: 'h', content: ['Jonah'] },
    { type: 'para', marker: 'toc1', content: ['Jonah'] },
    { type: 'para', marker: 'mt1', content: [] },
  ],
};

const usfm = convertUSJDocumentToUSFM(usj);
console.log(usfm);
// \id JON Jonah
// \usfm 3.1
// \h Jonah
// \toc1 Jonah
// \mt1
```

You can also pass only the `content` array:

```typescript
const usfm = convertUSJDocumentToUSFM({ content: usj.content });
```

Or use `USFMVisitor` directly on individual USJ nodes:

```typescript
import { USFMVisitor } from '@usfm-tools/adapters';

const visitor = new USFMVisitor();
visitor.visitPlainUSJContent(usj.content);
const usfm = visitor.getResult();
```

---

### Full roundtrip: USFM → USJ → USFM

```typescript
import { USFMParser } from '@usfm-tools/parser';
import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';

const original = `\\id JON Jonah
\\usfm 3.1
\\h Jonah
\\c 1
\\p
\\v 1 Now the word of the LORD came to Jonah.`;

const parser = new USFMParser();
const usj = parser.parse(original).toJSON();

const roundtripped = convertUSJDocumentToUSFM(usj);
console.log(roundtripped);
// Output is semantically equivalent to the original
```

---

### USJ validation

`validateUsjStructure` checks that a parsed JSON object conforms to the USJ schema — correct `type` values, required fields, valid node shapes.

```typescript
import { validateUsjStructure } from '@usj-tools/core';

const usj = JSON.parse(rawJson);
const result = validateUsjStructure(usj);

if (!result.ok) {
  for (const error of result.errors) {
    console.error(error);
  }
} else {
  console.log('Valid USJ document');
}
```

---

### Oracle comparison (roundtrip quality)

The oracle functions measure how faithfully a roundtripped document matches the original, without requiring character-for-character equality. Useful for CI quality gates and corpus analysis.

```typescript
import { compareUsjSimilarity } from '@usfm-tools/parser/oracle';
import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '@usfm-tools/adapters';

const parser = new USFMParser();

// Original
const original = parser.parse(usfmText).toJSON();

// Roundtripped
const v = new USFMVisitor();
parser.visit(v);
const roundtripped = new USFMParser().parse(v.getResult()).toJSON();

const result = compareUsjSimilarity(original, roundtripped);
console.log(`Text similarity:      ${(result.textSimilarity * 100).toFixed(1)}%`);
console.log(`Structure similarity: ${(result.structureSimilarity * 100).toFixed(1)}%`);
console.log(`Combined score:       ${(result.score * 100).toFixed(1)}%`);
```

USX oracle comparison:

```typescript
import { compareUsxSimilarity } from '@usfm-tools/parser/oracle';
import { USXVisitor } from '@usfm-tools/adapters';

const v1 = new USXVisitor();
parser.visit(v1);
const originalUsx = v1.getDocument();

const v2 = new USXVisitor();
new USFMParser().parse(roundtrippedUsfm).visit(v2);
const roundtrippedUsx = v2.getDocument();

const result = compareUsxSimilarity(originalUsx, roundtrippedUsx);
console.log(`USX structure: ${(result.structureSimilarity * 100).toFixed(1)}%`);
```

---

## CLI tools

### `usfm parse` — Parse USFM to USJ JSON

```bash
# From a file
usfm parse path/to/book.usfm

# From stdin
cat book.usfm | usfm parse --stdin

# Save to file
usfm parse book.usfm > book.usj.json
```

### `usj pretty` — Pretty-print a USJ file

```bash
usj pretty path/to/doc.usj.json

cat doc.usj.json | usj pretty --stdin
```

### `usj validate` — Validate USJ structure

```bash
usj validate path/to/doc.usj.json

# Quiet mode (no output on success, non-zero exit on failure)
usj validate --quiet doc.usj.json

cat doc.usj.json | usj validate --stdin
```

---

## Advanced

### Parser options

```typescript
const parser = new USFMParser({
  // Register custom markers (type + context rules)
  customMarkers: {
    'x-study': { type: 'paragraph' },
  },

  // Suppress console output; use getLogs() instead
  silentConsole: true,

  // Custom log sinks
  logger: {
    warn: (msg) => myLogger.warn(msg),
    error: (msg) => myLogger.error(msg),
  },
});

parser.parse(usfmText);

// Inspect warnings / errors
for (const log of parser.getLogs()) {
  console.log(`[${log.type}] ${log.message}`);
}
parser.clearLogs();
```

Normalize whitespace before parsing:

```typescript
const normalized = new USFMParser()
  .load(messyUsfm)
  .normalize()
  .getInput(); // returns the cleaned-up USFM string

// Then parse the clean text
const usj = new USFMParser().parse(normalized).toJSON();
```

### USFMVisitor options

```typescript
import { USFMVisitor } from '@usfm-tools/adapters';
import type { WhitespaceHandling } from '@usfm-tools/adapters';

const visitor = new USFMVisitor({
  // How to handle whitespace in text runs
  // 'preserve'           — keep all whitespace as-is
  // 'normalize'          — collapse multiple spaces to one
  // 'trim-edges'         — trim leading/trailing space per paragraph
  // 'normalize-and-trim' — both (default)
  whitespaceHandling: 'normalize-and-trim',

  // Normalize \r\n → \n
  normalizeLineEndings: true,

  // Emit \usfm {version} after \id (normally set automatically from USJ version field)
  usjVersion: '3.1',

  formatterOptions: {
    versesOnNewLine: true,
  },
});
```

### USXVisitor options

```typescript
import { USXVisitor } from '@usfm-tools/adapters';

const visitor = new USXVisitor({
  // 'explicit' — full sid/eid milestone pairs (default)
  // 'minimal'  — self-closing verse starts only
  verseMilestones: 'explicit',

  // true — emit bare \sN paragraphs as inline <ms> milestones (usfmtc style)
  inlineBareSectionMilestones: false,
});
```

### Custom visitors

You can implement `BaseUSFMVisitor<T>` to traverse the AST and produce any output type (plain text, HTML, a custom data model, etc.).

```typescript
import { USFMParser } from '@usfm-tools/parser';
import { BaseUSFMVisitor } from '@usfm-tools/types';
import type {
  ParagraphUSFMNode,
  CharacterUSFMNode,
  TextUSFMNode,
  NoteUSFMNode,
  MilestoneUSFMNode,
} from '@usfm-tools/types';

class PlainTextVisitor implements BaseUSFMVisitor<string> {
  visitParagraph(node: ParagraphUSFMNode): string {
    const children = node.content?.map((c) => (c as any).accept(this)).join('') ?? '';
    return `\n${children}\n`;
  }

  visitCharacter(node: CharacterUSFMNode): string {
    return node.content?.map((c) => (c as any).accept(this)).join('') ?? '';
  }

  visitText(node: TextUSFMNode): string {
    return node.content ?? '';
  }

  visitNote(_node: NoteUSFMNode): string {
    return ''; // skip footnotes
  }

  visitMilestone(_node: MilestoneUSFMNode): string {
    return '';
  }
}

const parser = new USFMParser();
parser.parse(usfmText);

const textVisitor = new PlainTextVisitor();
const lines = parser.visit(textVisitor); // returns T[] — one result per top-level node
console.log(lines.join(''));
```

---

## Monorepo development

Uses **[Bun](https://bun.sh)** workspaces and **[Turborepo](https://turbo.build)**.

```bash
# Install all dependencies
bun install

# Build all packages
bun run build

# Run all tests (CI mode — excludes perf tests)
CI=true bun run test

# Type-check all packages
bun run check-types

# Lint all packages
bun run lint

# Verify example USJ files match parser output
bun run examples:check

# Regenerate example USJ files after intentional parser changes
bun run regenerate:example-usj
```

Running a single package:

```bash
bunx turbo run build --filter=@usfm-tools/parser
bunx turbo run test  --filter=@usfm-tools/adapters
```

### Package structure

```
packages/
  usfm-parser/      @usfm-tools/parser      — parser core + oracle
  usfm-adapters/    @usfm-tools/adapters    — USFMVisitor, USXVisitor, USJVisitor
  usfm-formatter/   @usfm-tools/formatter   — USFMFormatter (formatting rules)
  shared-types/     @usfm-tools/types       — shared interfaces + visitor base
  usfm-validator/   @usfm-tools/validator   — validator CLI
  usfm-cli/         @usfm-tools/cli         — usfm parse CLI
  usfm-editor-core/ @usfm-tools/editor-core — document store + alignment editing
  usfm-editor/      @usfm-tools/editor      — ProseMirror USJ editor (headless)
  usfm-editor-app/  @usfm-tools/editor-app  — browser test app (private)
  usj-core/         @usj-tools/core         — validateUsjStructure
  usj-validator/    @usj-tools/validator    — re-exports usj-core
  usj-cli/          @usj-tools/cli          — usj pretty / validate CLIs
  usfm-playground/  —                       — browser playground (private app)
```

### Further documentation

- [Parsing quickstart](./docs/10-parsing-quickstart.md)
- [Editor core (chapter slices, alignment, `DocumentStore`, ops)](./docs/18-editor-core.md)
- [Alignment layer (unfoldingWord ↔ `editor-core`)](./docs/20-alignment-layer.md)
- [Parser metadata & USFM output buffer](./docs/19-parser-metadata-and-usfm-buffer.md)
- [Oracle comparison guide](./docs/17-oracle-comparison.md)
- [CI and branch protection](./docs/09-ci-and-branch-protection.md)
- [Production readiness](./docs/16-production-readiness.md)
- [GitHub agent workflow](./docs/08-github-agent-workflow.md)
- [Oracle diff reports](./docs/oracle-diffs/SUMMARY.md)
- [Package: @usfm-tools/parser](./packages/usfm-parser/README.md)
- [Package: @usfm-tools/editor-core](./packages/usfm-editor-core/README.md)
- [Package: @usfm-tools/editor (ProseMirror)](./packages/usfm-editor/README.md)

---

## License

MIT — see [LICENSE](./LICENSE) for details.
