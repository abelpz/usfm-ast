# Advanced Features

This guide covers advanced usage patterns and features of the @usfm-tools/formatter package.

## Configuration Options

### Complete Options Reference

```typescript
interface USFMFormatterOptions {
  // Structural formatting choices
  paragraphContentOnNewLine?: boolean;   // Default: false
  versesOnNewLine?: boolean;             // Default: true
  characterMarkersOnNewLine?: boolean;   // Default: false
  noteMarkersOnNewLine?: boolean;        // Default: false
  
  // Line length management
  maxLineLength?: number;                // Default: 0 (unlimited)
  splitLongLines?: boolean;              // Default: false
  
  // Custom marker definitions
  customMarkers?: Record<string, USFMMarkerInfo>;
}

interface USFMMarkerInfo {
  type: 'paragraph' | 'character' | 'note' | 'milestone';
  hasSpecialContent?: boolean;
}
```

### Dynamic Option Updates

```typescript
const formatter = new USFMFormatter();

// Check current configuration
console.log(formatter.getOptions());

// Update specific options
formatter.updateOptions({ 
  versesOnNewLine: false,
  characterMarkersOnNewLine: true 
});

// Options affect all subsequent formatting
let result = formatter.addMarker('\p Text ', 'v').normalizedOutput;
// Now verses will be inline due to versesOnNewLine: false
```

### Configuration Presets

```typescript
// Bible study preset
const studyBibleOptions: USFMFormatterOptions = {
  versesOnNewLine: true,
  paragraphContentOnNewLine: false,
  characterMarkersOnNewLine: false,
  noteMarkersOnNewLine: false,
  customMarkers: {
    'study-note': { type: 'note' },
    'cross-ref': { type: 'note' },
    'commentary': { type: 'note' }
  }
};

// Poetry-focused preset
const poetryOptions: USFMFormatterOptions = {
  versesOnNewLine: false,  // Keep verses inline in poetry
  paragraphContentOnNewLine: true,
  characterMarkersOnNewLine: false,
  customMarkers: {
    'stanza-break': { type: 'paragraph' },
    'refrain': { type: 'paragraph' }
  }
};

// Use presets
const studyFormatter = new USFMFormatter(studyBibleOptions);
const poetryFormatter = new USFMFormatter(poetryOptions);
```

## Custom Marker System

### Marker Type Effects

Different marker types have different formatting behaviors:

```typescript
const formatter = new USFMFormatter({
  customMarkers: {
    'my-para': { type: 'paragraph' },      // Gets newlines before
    'my-char': { type: 'character' },      // Inline by default
    'my-note': { type: 'note' },           // Inline, can contain other markers
    'my-mile': { type: 'milestone' }       // Self-contained, no content
  }
});

// Paragraph markers automatically get structural whitespace
let text = formatter.addMarker('content', 'my-para').normalizedOutput;
// Result: "content\nmy-para "

// Character markers stay inline
text = formatter.addMarker('content', 'my-char').normalizedOutput;
// Result: "content \my-char "

// Note markers are inline but can be configured
text = formatter.addMarker('content', 'my-note').normalizedOutput;
// Result: "content \my-note "
```

### Special Content Markers

Some markers have special content handling:

```typescript
const formatter = new USFMFormatter({
  customMarkers: {
    'verse-ref': { 
      type: 'character',
      hasSpecialContent: true  // Like verse numbers
    }
  }
});

// Special content markers get extra structural spacing
let result = formatter.addMarker('', 'verse-ref').normalizedOutput;
result = formatter.addTextContent(result, '1').normalizedOutput;
// Result: "\verse-ref 1 " (note the extra space after content)
```

### Runtime Marker Management

```typescript
const formatter = new USFMFormatter();

// Add markers during execution
formatter.addCustomMarker('dynamic-marker', { type: 'character' });

// Check if marker was inferred
if (formatter.hasInferredMarkers()) {
  const inferred = formatter.getInferredMarkers();
  console.log('Inferred markers:', inferred);
  
  // Save inferred markers for production use
  const prodFormatter = new USFMFormatter({
    customMarkers: inferred
  });
}

// Clear inferred markers if needed
formatter.clearInferredMarkers();
```

## Advanced Text Processing

### Handling Complex Content

```typescript
const formatter = new USFMFormatter();

// Build complex nested structures
let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 Jesus said to them, ').normalizedOutput;

// Nested quote with emphasis
text = formatter.addMarker(text, 'qt').normalizedOutput;
text = formatter.addTextContent(text, 'Truly I say to you, ').normalizedOutput;

// Emphasis within quote
text = formatter.addMarker(text, 'em').normalizedOutput;
text = formatter.addTextContent(text, 'whoever').normalizedOutput;
text = formatter.addMarker(text, 'em', true).normalizedOutput;

text = formatter.addTextContent(text, ' believes will have eternal life').normalizedOutput;
text = formatter.addMarker(text, 'qt', true).normalizedOutput;

text = formatter.addTextContent(text, '.').normalizedOutput;

console.log(text);
// \p
// \v 1 Jesus said to them, \qt Truly I say to you, \em whoever\em* believes will have eternal life\qt*.
```

### Attribute Management

```typescript
const formatter = new USFMFormatter();

// Multiple attributes
const complexAttributes = {
  lemma: 'believe',
  strong: 'G4100',
  morph: 'V-PAI-3S',
  src: 'UBS5'
};

let text = formatter.addMarker('text ', 'w').normalizedOutput;
text = formatter.addAttributes(text, complexAttributes).normalizedOutput;
text = formatter.addTextContent(text, 'believes').normalizedOutput;
text = formatter.addMarker(text, 'w', true).normalizedOutput;

console.log(text);
// text \w |lemma="believe" strong="G4100" morph="V-PAI-3S" src="UBS5"believes\w*

// Attributes with special characters
const specialAttributes = {
  'x-pronunciation': '/bɪˈliːv/',
  'data-custom': 'value with spaces'
};

text = formatter.addMarker('', 'w').normalizedOutput;
text = formatter.addAttributes(text, specialAttributes).normalizedOutput;
text = formatter.addTextContent(text, 'word').normalizedOutput;
text = formatter.addMarker(text, 'w', true).normalizedOutput;

console.log(text);
// \w |x-pronunciation="/bɪˈliːv/" data-custom="value with spaces"word\w*
```

## Performance Optimization

### Efficient Building Patterns

```typescript
// ✅ Good: Build incrementally
const formatter = new USFMFormatter();
let result = '';
result = formatter.addMarker(result, 'p').normalizedOutput;
result = formatter.addMarker(result, 'v').normalizedOutput;
result = formatter.addTextContent(result, '1 Text').normalizedOutput;

// ✅ Good: Reuse formatter instance
const formatter = new USFMFormatter();
const verses = ['1 First verse', '2 Second verse', '3 Third verse'];
let chapter = formatter.addMarker('', 'p').normalizedOutput;

for (const verse of verses) {
  chapter = formatter.addMarker(chapter, 'v').normalizedOutput;
  chapter = formatter.addTextContent(chapter, verse).normalizedOutput;
}

// ❌ Avoid: Creating new formatter instances
verses.forEach(verse => {
  const newFormatter = new USFMFormatter(); // Wasteful
  // ...
});
```

### Batch Processing

```typescript
interface USFMDocument {
  id: string;
  title: string;
  chapters: Array<{
    number: string;
    verses: Array<{ number: string; text: string; }>;
  }>;
}

function buildDocument(doc: USFMDocument, formatter: USFMFormatter): string {
  let usfm = '';
  
  // Document header
  usfm = formatter.addMarker(usfm, 'id').normalizedOutput;
  usfm = formatter.addTextContent(usfm, doc.id).normalizedOutput;
  
  usfm = formatter.addMarker(usfm, 'mt1').normalizedOutput;
  usfm = formatter.addTextContent(usfm, doc.title).normalizedOutput;
  
  // Process chapters
  for (const chapter of doc.chapters) {
    usfm = formatter.addMarker(usfm, 'c').normalizedOutput;
    usfm = formatter.addTextContent(usfm, chapter.number).normalizedOutput;
    
    usfm = formatter.addMarker(usfm, 'p').normalizedOutput;
    
    // Process verses
    for (const verse of chapter.verses) {
      usfm = formatter.addMarker(usfm, 'v').normalizedOutput;
      usfm = formatter.addTextContent(usfm, `${verse.number} ${verse.text}`).normalizedOutput;
    }
  }
  
  return usfm;
}

// Usage
const formatter = new USFMFormatter();
const documents = [doc1, doc2, doc3]; // Array of documents
const formattedDocs = documents.map(doc => buildDocument(doc, formatter));
```

## Integration Patterns

### With AST/Parser Integration

```typescript
import { USFMFormatter } from '@usfm-tools/formatter';

// Integrate with AST visitors or parsers
class USFMBuilder {
  private result = '';
  
  constructor(private formatter: USFMFormatter) {}
  
  visitMarkerNode(node: MarkerNode) {
    this.result = this.formatter.addMarker(this.result, node.marker, node.isClosing).normalizedOutput;
    
    if (node.attributes) {
      this.result = this.formatter.addAttributes(this.result, node.attributes).normalizedOutput;
    }
    
    return this;
  }
  
  visitTextNode(node: TextNode) {
    this.result = this.formatter.addTextContent(this.result, node.content).normalizedOutput;
    return this;
  }
  
  build() {
    return this.result;
  }
}
```

### Stream Processing

```typescript
import { Transform } from 'stream';

class USFMFormatterStream extends Transform {
  private formatter: USFMFormatter;
  private buffer = '';
  
  constructor(options?: USFMFormatterOptions) {
    super({ objectMode: true });
    this.formatter = new USFMFormatter(options);
  }
  
  _transform(chunk: { type: 'marker' | 'text' | 'attributes', data: any }, _encoding: string, callback: Function) {
    try {
      switch (chunk.type) {
        case 'marker':
          const result = this.formatter.addMarker(this.buffer, chunk.data.marker, chunk.data.isClosing);
          this.buffer = result.normalizedOutput;
          break;
          
        case 'text':
          const textResult = this.formatter.addTextContent(this.buffer, chunk.data);
          this.buffer = textResult.normalizedOutput;
          break;
          
        case 'attributes':
          const attrResult = this.formatter.addAttributes(this.buffer, chunk.data);
          this.buffer = attrResult.normalizedOutput;
          break;
      }
      
      callback();
    } catch (error) {
      callback(error);
    }
  }
  
  _flush(callback: Function) {
    this.push(this.buffer);
    callback();
  }
}

// Usage
const stream = new USFMFormatterStream({ versesOnNewLine: false });
// Pipe data through the stream
```

## Error Handling and Validation

### Robust Error Handling

```typescript
function safeFormatting(formatter: USFMFormatter, operations: Array<{ type: string, data: any }>) {
  let result = '';
  const errors: string[] = [];
  
  for (const op of operations) {
    try {
      switch (op.type) {
        case 'marker':
          const markerResult = formatter.addMarker(result, op.data.marker, op.data.isClosing);
          result = markerResult.normalizedOutput;
          break;
          
        case 'text':
          const textResult = formatter.addTextContent(result, op.data);
          result = textResult.normalizedOutput;
          break;
          
        case 'attributes':
          const attrResult = formatter.addAttributes(result, op.data);
          result = attrResult.normalizedOutput;
          break;
          
        default:
          errors.push(`Unknown operation type: ${op.type}`);
      }
    } catch (error) {
      errors.push(`Error in ${op.type} operation: ${error.message}`);
      // Continue with next operation
    }
  }
  
  return { result, errors };
}
```

### Input Validation

```typescript
function validateAndFormat(formatter: USFMFormatter, marker: string, content?: string) {
  // Validate marker name
  if (!marker || typeof marker !== 'string') {
    throw new Error('Marker must be a non-empty string');
  }
  
  if (!/^[a-zA-Z][a-zA-Z0-9]*\*?$/.test(marker)) {
    throw new Error(`Invalid marker name: ${marker}`);
  }
  
  // Validate content
  if (content !== undefined && typeof content !== 'string') {
    throw new Error('Content must be a string');
  }
  
  // Format safely
  let result = formatter.addMarker('', marker).normalizedOutput;
  if (content) {
    result = formatter.addTextContent(result, content).normalizedOutput;
  }
  
  return result;
}
```

## Testing and Debugging

### Testing Patterns

```typescript
describe('USFMFormatter Advanced Usage', () => {
  let formatter: USFMFormatter;
  
  beforeEach(() => {
    formatter = new USFMFormatter({
      customMarkers: {
        'test-marker': { type: 'character' }
      }
    });
  });
  
  test('should handle complex nested structures', () => {
    let result = '';
    result = formatter.addMarker(result, 'p').normalizedOutput;
    result = formatter.addMarker(result, 'v').normalizedOutput;
    result = formatter.addTextContent(result, '1 Text with ').normalizedOutput;
    result = formatter.addMarker(result, 'test-marker').normalizedOutput;
    result = formatter.addTextContent(result, 'nested').normalizedOutput;
    result = formatter.addMarker(result, 'test-marker', true).normalizedOutput;
    result = formatter.addTextContent(result, ' content.').normalizedOutput;
    
    expect(result).toBe('\\p\n\\v 1 Text with \\test-marker nested\\test-marker* content.');
  });
  
  test('should handle attribute edge cases', () => {
    let result = formatter.addMarker('', 'w').normalizedOutput;
    result = formatter.addAttributes(result, {
      'empty-value': '',
      'with-quotes': 'value "with" quotes',
      'with-pipes': 'value|with|pipes'
    }).normalizedOutput;
    result = formatter.addTextContent(result, 'word').normalizedOutput;
    result = formatter.addMarker(result, 'w', true).normalizedOutput;
    
    expect(result).toContain('empty-value=""');
    expect(result).toContain('with-quotes="value "with" quotes"');
    expect(result).toContain('with-pipes="value|with|pipes"');
  });
});
```

### Debugging Utilities

```typescript
class USFMFormatterDebugger {
  private formatter: USFMFormatter;
  private operations: Array<{ operation: string, input: string, output: string }> = [];
  
  constructor(formatter: USFMFormatter) {
    this.formatter = formatter;
  }
  
  addMarker(currentOutput: string, marker: string, isClosing = false) {
    const result = this.formatter.addMarker(currentOutput, marker, isClosing);
    this.operations.push({
      operation: `addMarker('${marker}', ${isClosing})`,
      input: currentOutput,
      output: result.normalizedOutput
    });
    return result;
  }
  
  addTextContent(currentOutput: string, content: string) {
    const result = this.formatter.addTextContent(currentOutput, content);
    this.operations.push({
      operation: `addTextContent('${content}')`,
      input: currentOutput,
      output: result.normalizedOutput
    });
    return result;
  }
  
  addAttributes(currentOutput: string, attributes: Record<string, string>) {
    const result = this.formatter.addAttributes(currentOutput, attributes);
    this.operations.push({
      operation: `addAttributes(${JSON.stringify(attributes)})`,
      input: currentOutput,
      output: result.normalizedOutput
    });
    return result;
  }
  
  getOperationHistory() {
    return this.operations;
  }
  
  printDebugInfo() {
    console.log('USFM Formatter Operations:');
    this.operations.forEach((op, index) => {
      console.log(`${index + 1}. ${op.operation}`);
      console.log(`   Input:  "${op.input}"`);
      console.log(`   Output: "${op.output}"`);
      console.log();
    });
  }
}

// Usage
const formatter = new USFMFormatter();
const debugger = new USFMFormatterDebugger(formatter);

let result = debugger.addMarker('', 'p').normalizedOutput;
result = debugger.addTextContent(result, 'content').normalizedOutput;

debugger.printDebugInfo();
```

## Migration and Compatibility

### Legacy API Compatibility

If you need to maintain compatibility with older APIs:

```typescript
// Wrapper for legacy normalizeUSFM-style usage
function legacyNormalizeUSFM(input: string, options?: USFMFormatterOptions): string {
  const formatter = new USFMFormatter(options);
  
  // Parse the input and rebuild using the new API
  // This is a simplified example - real implementation would need proper parsing
  const lines = input.split('\n');
  let result = '';
  
  for (const line of lines) {
    if (line.startsWith('\\')) {
      const match = line.match(/^\\(\w+)\s*(.*)/);
      if (match) {
        const [, marker, content] = match;
        result = formatter.addMarker(result, marker).normalizedOutput;
        if (content) {
          result = formatter.addTextContent(result, content).normalizedOutput;
        }
      }
    } else if (line.trim()) {
      result = formatter.addTextContent(result, line).normalizedOutput;
    }
  }
  
  return result;
}
```

This guide covers the advanced features and patterns available in the @usfm-tools/formatter package. For basic usage, see the simple-usage.md guide. 