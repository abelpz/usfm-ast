# @usfm-tools/parser

[![npm version](https://badge.fury.io/js/@usfm-tools%2Fparser.svg)](https://www.npmjs.com/package/@usfm-tools/parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful and flexible parser for USFM (Unified Standard Format Markers) that converts USFM text into an Abstract Syntax Tree (AST). This parser is designed for Bible translation and scripture processing applications.

## 🚀 Features

- **Complete USFM 3.1+ Support** - Handles all standard USFM markers
- **AST Generation** - Creates a structured tree representation of USFM content
- **Whitespace Normalization** - Intelligent formatting and cleanup
- **Custom Marker Support** - Extend with your own USFM markers
- **Error Reporting** - Detailed warnings and error messages with context
- **Performance Optimized** - Built for handling large scripture texts
- **TypeScript Support** - Full type definitions included
- **Visitor Pattern** - Built-in support for AST traversal and transformation

## 📦 Installation

```bash
npm install @usfm-tools/parser
```

```bash
yarn add @usfm-tools/parser
```

```bash
bun add @usfm-tools/parser
```

```bash
pnpm add @usfm-tools/parser
```

## 🎯 Quick Start

### Basic Usage

```typescript
import { USFMParser } from '@usfm-tools/parser';

// Create a parser instance
const parser = new USFMParser();

// Parse USFM text
const usfmText = `\\id TIT
\\c 1
\\p
\\v 1 Paul, a servant of God and an apostle of Jesus Christ.
\\v 2 Grace and peace to you.`;

const ast = parser
  .load(usfmText)
  .parse()
  .getNodes();

console.log(JSON.stringify(ast, null, 2));
```

### With Normalization

```typescript
import { USFMParser } from '@usfm-tools/parser';

const parser = new USFMParser();
const usfmText = `\\id  TIT\r\n\\c   1\r\n\\p\r\n\\v 1   Paul, a servant.`;

// Parse with automatic whitespace normalization
const normalizedText = parser
  .load(usfmText)
  .normalize()
  .getInput();

console.log(normalizedText);
// Output: \id TIT\n\c 1\n\p\n\v 1 Paul, a servant.

const ast = parser.parse().getNodes();
```

## 📚 API Reference

### USFMParser Class

#### Constructor

```typescript
new USFMParser(options?: USFMParserOptions)
```

**Options:**
- `customMarkers?: Record<string, USFMMarkerInfo>` - Custom USFM markers to register
- `positionTracking?: boolean` - Enable position tracking for debugging (default: true in development)

#### Core Methods

##### `.load(input: string): USFMParser`
Loads USFM text into the parser for processing.

```typescript
const parser = new USFMParser();
parser.load('\\p This is a paragraph.');
```

##### `.parse(): USFMParser`
Parses the loaded USFM text into an AST.

```typescript
parser.load(usfmText).parse();
```

##### `.getNodes(): HydratedUSFMNode[]`
Returns the parsed AST nodes.

```typescript
const ast = parser.getNodes();
```

##### `.getInput(): string`
Returns the current USFM input text.

```typescript
const currentText = parser.getInput();
```

##### `.normalize(): USFMParser`
Normalizes whitespace in the input text according to USFM rules.

```typescript
parser.load(usfmText).normalize();
```

##### `.getLogs(): Array<{type: 'warn' | 'error', message: string}>`
Returns parsing warnings and errors.

```typescript
const logs = parser.getLogs();
logs.forEach(log => {
  console.log(`${log.type}: ${log.message}`);
});
```

##### `.clearLogs(): void`
Clears all warning and error logs.

```typescript
parser.clearLogs();
```

## 🏗️ Node Types

The parser generates the following AST node types:

### ParagraphNode
Represents paragraph markers like `\p`, `\q`, `\m`, etc.

```typescript
{
  type: 'paragraph',
  marker: 'p',
  content: [/* child nodes */]
}
```

### CharacterNode
Represents character formatting markers like `\bd`, `\it`, `\v`, etc.

```typescript
{
  type: 'character',
  marker: 'bd',
  content: [/* child nodes */],
  attributes?: { [key: string]: string }
}
```

### TextNode
Represents plain text content.

```typescript
{
  type: 'text',
  content: 'This is text content'
}
```

### NoteNode
Represents footnotes and cross-references like `\f`, `\x`.

```typescript
{
  type: 'note',
  marker: 'f',
  content: [/* child nodes */],
  caller?: string
}
```

### MilestoneNode
Represents milestone markers like `\qt-s`, `\qt-e`.

```typescript
{
  type: 'milestone',
  marker: 'qt-s',
  milestoneType: 'start' | 'end' | 'standalone',
  attributes?: { [key: string]: string }
}
```

## 💡 Examples

### Parsing Different USFM Structures

#### Simple Paragraph
```typescript
const usfm = '\\p This is a simple paragraph.';
const ast = new USFMParser().load(usfm).parse().getNodes();
// Result: [{ type: 'paragraph', marker: 'p', content: [...] }]
```

#### Verses with Character Formatting
```typescript
const usfm = `\\p
\\v 1 In the \\bd beginning\\bd* was the \\it Word\\it*.
\\v 2 And the Word was with God.`;

const ast = new USFMParser().load(usfm).parse().getNodes();
```

#### Footnotes and Cross-references
```typescript
const usfm = `\\p
\\v 1 Paul\\f + \\fr 1:1 \\ft Apostle of Jesus Christ\\f* wrote this letter.
\\v 2 Grace\\x + \\xo 1:2 \\xt Rom 1:7\\x* and peace.`;

const ast = new USFMParser().load(usfm).parse().getNodes();
```

#### Milestone Markers
```typescript
const usfm = `\\p
\\v 1 \\qt-s |sid="qt_MAT_5:3"\\*Blessed are the poor\\qt-e\\* in spirit.`;

const ast = new USFMParser().load(usfm).parse().getNodes();
```

### Custom Markers

```typescript
// Define custom markers
const customMarkers = {
  'custom': {
    type: 'character',
    context: ['text']
  },
  'special': {
    type: 'paragraph',
    role: 'content'
  }
};

const parser = new USFMParser({ customMarkers });

const usfm = `\\special
\\v 1 This has \\custom special formatting\\custom*.`;

const ast = parser.load(usfm).parse().getNodes();
```

### Error Handling

```typescript
const parser = new USFMParser();
const problematicUsfm = `\\p This has a \\missing closing marker`;

const ast = parser.load(problematicUsfm).parse().getNodes();

// Check for warnings and errors
const logs = parser.getLogs();
if (logs.length > 0) {
  console.log('Parsing issues found:');
  logs.forEach(log => {
    console.log(`${log.type.toUpperCase()}: ${log.message}`);
  });
}
```

### Working with Large Texts

```typescript
import fs from 'fs';

// Load a complete book
const bookContent = fs.readFileSync('path/to/book.usfm', 'utf-8');

const parser = new USFMParser({
  positionTracking: true // Enable for debugging large files
});

try {
  const ast = parser
    .load(bookContent)
    .normalize() // Clean up formatting
    .parse()
    .getNodes();
    
  console.log(`Parsed ${ast.length} top-level nodes`);
} catch (error) {
  console.error('Parsing failed:', error.message);
  
  // Get detailed logs
  const logs = parser.getLogs();
  logs.forEach(log => console.error(`${log.type}: ${log.message}`));
}
```

## 🎨 Visitor Pattern

The parser includes built-in support for the visitor pattern to traverse and transform AST nodes:

```typescript
import { BaseUSFMVisitor } from '@usfm-tools/types';

class TextExtractor implements BaseUSFMVisitor<string> {
  visitParagraph(node: ParagraphNode): string {
    return node.content.map(child => child.accept(this)).join('');
  }
  
  visitCharacter(node: CharacterNode): string {
    return node.content.map(child => child.accept(this)).join('');
  }
  
  visitText(node: TextNode): string {
    return node.content;
  }
  
  visitNote(node: NoteNode): string {
    return ''; // Skip notes
  }
  
  visitMilestone(node: MilestoneNode): string {
    return ''; // Skip milestones
  }
}

// Extract plain text from AST
const parser = new USFMParser();
const ast = parser.load(usfmText).parse();
const plainText = ast.visit(new TextExtractor()).join(' ');
```

## 🔧 Advanced Configuration

### Whitespace Normalization Rules

The parser includes intelligent whitespace normalization:

- **Line endings**: Converts CRLF/CR to LF
- **Paragraph markers**: Preceded by newlines, followed by content on same line
- **Verse markers**: Always preceded by newlines
- **Character markers**: Preceded by spaces when inline
- **Multiple whitespace**: Collapsed to single spaces

```typescript
const messy = `\\id  TIT\r\n\r\n\\c   1\r\n\\p\r\n\r\n\\v 1   Text   with   spaces`;
const clean = new USFMParser().load(messy).normalize().getInput();
// Result: clean, properly formatted USFM
```

### Performance Monitoring

```typescript
const parser = new USFMParser({ positionTracking: true });

// For large files, monitor performance
const start = Date.now();
const ast = parser.load(largeUsfmText).parse().getNodes();
const duration = Date.now() - start;

console.log(`Parsed in ${duration}ms`);
console.log(`Generated ${ast.length} nodes`);

// Check for any performance warnings
const logs = parser.getLogs();
const warnings = logs.filter(log => log.type === 'warn');
console.log(`${warnings.length} warnings generated`);
```

## 📋 Supported USFM Markers

The parser supports all standard USFM 3.1+ markers including:

- **Identification**: `\id`, `\usfm`, `\ide`, `\h`, `\toc1-3`
- **Paragraphs**: `\p`, `\m`, `\q1-4`, `\li1-4`, `\b`, `\nb`  
- **Characters**: `\bd`, `\it`, `\sc`, `\bk`, `\pn`, `\w`, `\wj`
- **Verses**: `\v`, `\c`, `\ca`, `\cp`, `\cd`
- **Notes**: `\f`, `\fe`, `\x`, `\fr`, `\ft`, `\fk`, `\fq`, `\fqa`
- **Poetry**: `\q`, `\qa`, `\qc`, `\qd`, `\qm1-4`, `\qr`
- **Lists**: `\li1-4`, `\lim1-4`, `\liv1-4`
- **Tables**: `\tr`, `\th1-5`, `\tc1-5`, `\tcr1-5`, `\thr1-5`
- **Milestones**: `\qt-s/e`, `\ts-s/e`, `\k-s/e`

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/usfm-ast.git
cd usfm-ast

# Install dependencies
bun install

# Build the parser (from repo root)
bun run do -- usfm-parser build

# Run tests
bun run do -- usfm-parser test

# Run performance tests
bun run do -- usfm-parser test:performance
```

You can also use Turborepo filters from the repository root:

```bash
bunx turbo run build --filter=@usfm-tools/parser
bunx turbo run test --filter=@usfm-tools/parser
bunx turbo run test:performance --filter=@usfm-tools/parser
```

## 📄 License

MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🔗 Related Packages

- [`@usfm-tools/types`](../shared-types) - Shared TypeScript definitions
- [`@usfm-tools/adapters`](../usfm-adapters) - Format conversion tools
- [`@usfm-tools/formatter`](../usfm-formatter) - USFM formatting and normalization
- [`@usj-tools/adapters`](../usj-adapters) - USJ conversion utilities

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/usfm-ast/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/usfm-ast/discussions)
- **Documentation**: [Full Documentation](../../docs/)

---

Made with ❤️ for Bible translation and scripture processing.
