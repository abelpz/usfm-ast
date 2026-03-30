# API Reference

## Classes

### USFMParser

The main parser class for converting USFM text into an Abstract Syntax Tree (AST).

#### Constructor

```typescript
new USFMParser(options?: USFMParserOptions)
```

**Parameters:**
- `options` (optional): Configuration options for the parser

**Options:**
- `customMarkers?: Record<string, USFMMarkerInfo>` - Custom USFM markers to register
- `positionTracking?: boolean` - Enable position tracking for debugging (default: true in development)

**Example:**
```typescript
// Basic usage
const parser = new USFMParser();

// With custom markers
const parser = new USFMParser({
  customMarkers: {
    'custom': { type: 'character', context: ['text'] }
  }
});

// With debugging enabled
const parser = new USFMParser({
  positionTracking: true
});
```

#### Methods

##### load(input: string): USFMParser

Loads USFM text into the parser for processing.

**Parameters:**
- `input`: The USFM text to be parsed

**Returns:** The parser instance for method chaining

**Example:**
```typescript
const parser = new USFMParser();
parser.load('\\p This is a paragraph.');
```

##### parse(): USFMParser

Parses the loaded USFM text into an AST.

**Returns:** The parser instance for method chaining

**Throws:** Error if infinite loop is detected or parsing fails

**Example:**
```typescript
const parser = new USFMParser();
parser.load(usfmText).parse();
```

##### getNodes(): HydratedUSFMNode[]

Returns the parsed AST nodes.

**Returns:** Array of parsed USFM nodes

**Example:**
```typescript
const ast = parser.getNodes();
console.log(`Parsed ${ast.length} top-level nodes`);
```

##### getInput(): string

Returns the current USFM input text.

**Returns:** The current USFM input text

**Example:**
```typescript
const currentText = parser.getInput();
```

##### normalize(): USFMParser

Normalizes whitespace in the input text according to USFM rules.

**Returns:** The parser instance for method chaining

**Normalization Rules:**
- Converts CRLF/CR line endings to LF
- Collapses multiple whitespace to single spaces
- Ensures proper spacing around markers
- Handles paragraph and verse marker positioning

**Example:**
```typescript
const messy = '\\id  TIT\r\n\\c   1\r\n\\p\r\n\\v 1   Text';
const clean = parser.load(messy).normalize().getInput();
```

##### getLogs(): Array<{type: 'warn' | 'error', message: string}>

Returns parsing warnings and errors.

**Returns:** Array of log entries with type and message

**Example:**
```typescript
const logs = parser.getLogs();
logs.forEach(log => {
  console.log(`${log.type.toUpperCase()}: ${log.message}`);
});
```

##### clearLogs(): void

Clears all warning and error logs.

**Example:**
```typescript
parser.clearLogs();
```

##### visit<T>(visitor: BaseUSFMVisitor<T>): T[]

Applies a visitor to all top-level nodes in the AST.

**Type Parameters:**
- `T`: The return type of the visitor methods

**Parameters:**
- `visitor`: An object implementing the BaseUSFMVisitor interface

**Returns:** Array of results from visiting each node

**Example:**
```typescript
class TextExtractor implements BaseUSFMVisitor<string> {
  visitParagraph(node: ParagraphNode): string { /* ... */ }
  visitCharacter(node: CharacterNode): string { /* ... */ }
  visitText(node: TextNode): string { /* ... */ }
  visitNote(node: NoteNode): string { /* ... */ }
  visitMilestone(node: MilestoneNode): string { /* ... */ }
}

const parser = new USFMParser();
const texts = parser.load(usfm).parse().visit(new TextExtractor());
```

##### visitWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T[]

Applies a visitor with context to all top-level nodes in the AST.

**Type Parameters:**
- `T`: The return type of the visitor methods
- `C`: The type of the context object

**Parameters:**
- `visitor`: An object implementing the USFMVisitorWithContext interface
- `context`: Context object passed to each visitor method

**Returns:** Array of results from visiting each node

## Interfaces

### USFMParserOptions

Configuration options for the USFMParser constructor.

```typescript
interface USFMParserLogger {
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

interface USFMParserOptions {
  customMarkers?: Record<string, USFMMarkerInfo>;
  positionTracking?: boolean;
  silentConsole?: boolean;
  logger?: USFMParserLogger;
}
```

**Properties:**
- `customMarkers` (optional): Custom USFM markers to register with the parser
- `positionTracking` (optional): Enable position tracking for debugging infinite loops
- `silentConsole` (optional): Omit `console` for warnings/errors; use `getLogs()` for programmatic access
- `logger` (optional): Custom warn/error sinks; used instead of `console` for the channels provided

### USFMMarkerInfo

Information about a USFM marker.

```typescript
interface USFMMarkerInfo {
  type: MarkerType;
  role?: string;
  context?: string[];
  defaultAttribute?: string;
}
```

**Properties:**
- `type`: The type of marker (paragraph, character, note, milestone)
- `role` (optional): The role of the marker (content, break, etc.)
- `context` (optional): Valid contexts where the marker can appear
- `defaultAttribute` (optional): Default attribute name for the marker

## Node Types

### ParagraphNode

Represents paragraph markers like `\p`, `\q`, `\m`, etc.

```typescript
interface ParagraphNode {
  type: 'paragraph';
  marker: string;
  content: USFMNode[];
  attributes?: Record<string, string>;
}
```

**Properties:**
- `type`: Always 'paragraph'
- `marker`: The paragraph marker (e.g., 'p', 'q1', 'm')
- `content`: Array of child nodes
- `attributes` (optional): Marker attributes if present

### CharacterNode

Represents character formatting markers like `\bd`, `\it`, `\v`, etc.

```typescript
interface CharacterNode {
  type: 'character';
  marker: string;
  content: USFMNode[];
  attributes?: Record<string, string>;
}
```

**Properties:**
- `type`: Always 'character'
- `marker`: The character marker (e.g., 'bd', 'it', 'v')
- `content`: Array of child nodes
- `attributes` (optional): Marker attributes if present

### TextNode

Represents plain text content.

```typescript
interface TextNode {
  type: 'text';
  content: string;
}
```

**Properties:**
- `type`: Always 'text'
- `content`: The text content

### NoteNode

Represents footnotes and cross-references like `\f`, `\x`.

```typescript
interface NoteNode {
  type: 'note';
  marker: string;
  content: USFMNode[];
  caller?: string;
  attributes?: Record<string, string>;
}
```

**Properties:**
- `type`: Always 'note'
- `marker`: The note marker (e.g., 'f', 'x', 'fe')
- `content`: Array of child nodes
- `caller` (optional): The note caller character
- `attributes` (optional): Marker attributes if present

### MilestoneNode

Represents milestone markers like `\qt-s`, `\qt-e`.

```typescript
interface MilestoneNode {
  type: 'milestone';
  marker: string;
  milestoneType: 'start' | 'end' | 'standalone';
  attributes?: Record<string, string>;
}
```

**Properties:**
- `type`: Always 'milestone'
- `marker`: The milestone marker (e.g., 'qt-s', 'qt-e', 'ts')
- `milestoneType`: Whether it's a start, end, or standalone milestone
- `attributes` (optional): Marker attributes if present

## Enums

### MarkerTypeEnum

Enumeration of USFM marker types.

```typescript
enum MarkerTypeEnum {
  PARAGRAPH = 'paragraph',
  CHARACTER = 'character',
  NOTE = 'note',
  MILESTONE = 'milestone'
}
```

## Error Handling

The parser provides comprehensive error reporting through the logging system:

### Log Types

- **warn**: Non-fatal issues that don't prevent parsing
- **error**: Fatal issues that stop parsing

### Common Warnings

- Unexpected characters outside paragraphs
- Unknown markers (auto-inferred as custom)
- Unclosed character markers
- Missing note callers

### Common Errors

- Infinite loop detection
- Malformed marker syntax
- Invalid position tracking

### Error Context

Each error includes:
- Position information
- Context snippet showing surrounding text
- Pointer indicating exact error location

**Example:**
```
Unexpected character outside a paragraph: 'T'
Context: \id TIT\c 1Text content
                    ^
```

## Performance Considerations

### Memory Usage

- The parser creates a complete AST in memory
- Large texts may require significant memory
- Use streaming or chunking for very large files

### Position Tracking

- Enabled by default in development
- Adds overhead for infinite loop detection
- Disable in production for better performance

### Custom Markers

- Registered markers are cached for performance
- Unknown markers trigger warning but continue parsing
- Pre-register frequently used custom markers

## Best Practices

### Error Handling
```typescript
const parser = new USFMParser();
try {
  const ast = parser.load(usfmText).parse().getNodes();
  
  // Check for warnings
  const logs = parser.getLogs();
  const warnings = logs.filter(log => log.type === 'warn');
  if (warnings.length > 0) {
    console.warn(`${warnings.length} warnings during parsing`);
  }
} catch (error) {
  console.error('Parsing failed:', error.message);
  
  // Get detailed error context
  const logs = parser.getLogs();
  logs.forEach(log => console.error(`${log.type}: ${log.message}`));
}
```

### Large File Processing
```typescript
const parser = new USFMParser({
  positionTracking: false // Disable for better performance
});

// Process in chunks if memory is a concern
const chunkSize = 50000; // characters
const chunks = [];
for (let i = 0; i < largeText.length; i += chunkSize) {
  chunks.push(largeText.slice(i, i + chunkSize));
}
```

### Custom Marker Registration
```typescript
// Register all custom markers upfront
const customMarkers = {
  'org': { type: 'character', context: ['text'] },
  'special': { type: 'paragraph', role: 'content' },
  'custom-note': { type: 'note', context: ['paragraph'] }
};

const parser = new USFMParser({ customMarkers });
``` 