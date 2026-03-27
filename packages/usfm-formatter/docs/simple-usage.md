# Simple Usage Guide

This guide covers the basic usage of the @usfm-tools/formatter package with its new simplified API.

## Installation

```bash
npm install @usfm-tools/formatter
```

## Basic Concepts

The formatter provides three core methods for building USFM text:

1. **`addMarker()`** - Adds USFM markers with proper whitespace
2. **`addTextContent()`** - Adds text content with intelligent spacing
3. **`addAttributes()`** - Adds USFM 3.1.1 attributes

## Quick Examples

### Simple Verse

```typescript
import { USFMFormatter } from '@usfm-tools/formatter';

const formatter = new USFMFormatter();

let usfm = formatter.addMarker('', 'p').normalizedOutput;         // "\p "
usfm = formatter.addMarker(usfm, 'v').normalizedOutput;           // "\p\n\v "
usfm = formatter.addTextContent(usfm, '1 Hello world').normalizedOutput; // "\p\n\v 1 Hello world"
```

### With Character Markup

```typescript
const formatter = new USFMFormatter();

let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 The ').normalizedOutput;

// Add emphasis
text = formatter.addMarker(text, 'em').normalizedOutput;
text = formatter.addTextContent(text, 'word').normalizedOutput;
text = formatter.addMarker(text, 'em', true).normalizedOutput; // Closing marker

text = formatter.addTextContent(text, ' was emphasized.').normalizedOutput;

console.log(text);
// \p
// \v 1 The \em word\em* was emphasized.
```

### With Attributes

```typescript
const formatter = new USFMFormatter();

let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 In the beginning was the ').normalizedOutput;

// Word with attributes
text = formatter.addMarker(text, 'w').normalizedOutput;
text = formatter.addAttributes(text, { lemma: 'logos', strong: 'G3056' }).normalizedOutput;
text = formatter.addTextContent(text, 'Word').normalizedOutput;
text = formatter.addMarker(text, 'w', true).normalizedOutput;

console.log(text);
// \p
// \v 1 In the beginning was the \w |lemma="logos" strong="G3056"Word\w*
```

## Building Complete Documents

### Basic Structure

```typescript
const formatter = new USFMFormatter();

// Build document step by step
let usfm = '';

// Book identification
usfm = formatter.addMarker(usfm, 'id').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'GEN Genesis').normalizedOutput;

// Headers
usfm = formatter.addMarker(usfm, 'h').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'Genesis').normalizedOutput;

usfm = formatter.addMarker(usfm, 'mt1').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'The First Book of Moses, called Genesis').normalizedOutput;

// Chapter 1
usfm = formatter.addMarker(usfm, 'c').normalizedOutput;
usfm = formatter.addTextContent(usfm, '1').normalizedOutput;

// First paragraph
usfm = formatter.addMarker(usfm, 'p').normalizedOutput;

// First verse
usfm = formatter.addMarker(usfm, 'v').normalizedOutput;
usfm = formatter.addTextContent(usfm, '1 In the beginning God created the heavens and the earth.').normalizedOutput;

console.log(usfm);
```

Output:
```
\id GEN Genesis
\h Genesis
\mt1 The First Book of Moses, called Genesis
\c 1
\p
\v 1 In the beginning God created the heavens and the earth.
```

## Common Patterns

### Footnotes

```typescript
const formatter = new USFMFormatter();

let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 Jesus').normalizedOutput;

// Start footnote
text = formatter.addMarker(text, 'f').normalizedOutput;
text = formatter.addTextContent(text, '+ ').normalizedOutput;

// Footnote reference
text = formatter.addMarker(text, 'fr').normalizedOutput;
text = formatter.addTextContent(text, '1.1 ').normalizedOutput;

// Footnote text
text = formatter.addMarker(text, 'ft').normalizedOutput;
text = formatter.addTextContent(text, 'Greek: Iesous').normalizedOutput;

// Close footnote
text = formatter.addMarker(text, 'f', true).normalizedOutput;

text = formatter.addTextContent(text, ' spoke').normalizedOutput;

console.log(text);
// \p
// \v 1 Jesus\f + \fr 1.1 \ft Greek: Iesous\f* spoke
```

### Poetry

```typescript
const formatter = new USFMFormatter();

let poem = '';
poem = formatter.addMarker(poem, 'q1').normalizedOutput;
poem = formatter.addTextContent(poem, 'The Lord is my shepherd;').normalizedOutput;

poem = formatter.addMarker(poem, 'q2').normalizedOutput;
poem = formatter.addTextContent(poem, 'I shall not want.').normalizedOutput;

poem = formatter.addMarker(poem, 'q1').normalizedOutput;
poem = formatter.addTextContent(poem, 'He makes me lie down in green pastures.').normalizedOutput;

console.log(poem);
// \q1 The Lord is my shepherd;
// \q2 I shall not want.
// \q1 He makes me lie down in green pastures.
```

### Cross-References

```typescript
const formatter = new USFMFormatter();

let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 In the beginning').normalizedOutput;

// Cross-reference
text = formatter.addMarker(text, 'x').normalizedOutput;
text = formatter.addTextContent(text, '+ ').normalizedOutput;

text = formatter.addMarker(text, 'xo').normalizedOutput;
text = formatter.addTextContent(text, '1.1: ').normalizedOutput;

text = formatter.addMarker(text, 'xt').normalizedOutput;
text = formatter.addTextContent(text, 'Jhn 1.1').normalizedOutput;

text = formatter.addMarker(text, 'x', true).normalizedOutput;

text = formatter.addTextContent(text, ' God created').normalizedOutput;

console.log(text);
// \p
// \v 1 In the beginning\x + \xo 1.1: \xt Jhn 1.1\x* God created
```

## Configuration Options

### Verse Formatting

```typescript
// Default: verses on new lines
const formatter1 = new USFMFormatter();
let result1 = formatter1.addMarker('\\p Text', 'v').normalizedOutput;
console.log(result1); // "\p Text\n\v "

// Inline verses
const formatter2 = new USFMFormatter({ versesOnNewLine: false });
let result2 = formatter2.addMarker('\\p Text ', 'v').normalizedOutput;
console.log(result2); // "\p Text \v "
```

### Paragraph Content

```typescript
// Default: content on same line
const formatter1 = new USFMFormatter();
let result1 = formatter1.addMarker('', 'p').normalizedOutput;
console.log(result1); // "\p "

// Content on new line
const formatter2 = new USFMFormatter({ paragraphContentOnNewLine: true });
let result2 = formatter2.addMarker('', 'p').normalizedOutput;
console.log(result2); // "\p\n"
```

### Character Markers

```typescript
// Default: character markers inline
const formatter1 = new USFMFormatter();
let result1 = formatter1.addMarker('text', 'em').normalizedOutput;
console.log(result1); // "text \em "

// Character markers on new lines
const formatter2 = new USFMFormatter({ characterMarkersOnNewLine: true });
let result2 = formatter2.addMarker('text', 'em').normalizedOutput;
console.log(result2); // "text\n\em "
```

## Custom Markers

### Define Custom Markers

```typescript
const formatter = new USFMFormatter({
  customMarkers: {
    'study-note': { type: 'note' },
    'highlight': { type: 'character' },
    'section-header': { type: 'paragraph' }
  }
});

// Use custom markers
let text = formatter.addMarker('', 'section-header').normalizedOutput;
text = formatter.addTextContent(text, 'Study Notes').normalizedOutput;

text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addTextContent(text, 'This is ').normalizedOutput;

text = formatter.addMarker(text, 'highlight').normalizedOutput;
text = formatter.addTextContent(text, 'highlighted').normalizedOutput;
text = formatter.addMarker(text, 'highlight', true).normalizedOutput;

text = formatter.addTextContent(text, ' text.').normalizedOutput;
```

### Add Markers at Runtime

```typescript
const formatter = new USFMFormatter();
formatter.addCustomMarker('my-special', { type: 'character' });

let text = formatter.addMarker('content', 'my-special').normalizedOutput;
text = formatter.addTextContent(text, 'special text').normalizedOutput;
text = formatter.addMarker(text, 'my-special', true).normalizedOutput;
```

## Helper Functions

### Build Verse Function

```typescript
function buildVerse(formatter: USFMFormatter, start: string, num: string, text: string): string {
  let result = formatter.addMarker(start, 'v').normalizedOutput;
  result = formatter.addTextContent(result, `${num} ${text}`).normalizedOutput;
  return result;
}

// Usage
const formatter = new USFMFormatter();
let chapter = formatter.addMarker('', 'p').normalizedOutput;
chapter = buildVerse(formatter, chapter, '1', 'First verse text');
chapter = buildVerse(formatter, chapter, '2', 'Second verse text');
```

### Build Word with Attributes

```typescript
function buildWord(formatter: USFMFormatter, start: string, word: string, attrs: Record<string, string>): string {
  let result = formatter.addMarker(start, 'w').normalizedOutput;
  result = formatter.addAttributes(result, attrs).normalizedOutput;
  result = formatter.addTextContent(result, word).normalizedOutput;
  result = formatter.addMarker(result, 'w', true).normalizedOutput;
  return result;
}

// Usage
const formatter = new USFMFormatter();
let text = formatter.addTextContent('', 'The ').normalizedOutput;
text = buildWord(formatter, text, 'word', { lemma: 'logos', strong: 'G3056' });
text = formatter.addTextContent(text, ' was spoken.').normalizedOutput;
```

## Builder Pattern

For more complex documents, consider using a builder pattern:

```typescript
class USFMBuilder {
  private output = '';
  
  constructor(private formatter: USFMFormatter) {}
  
  marker(name: string, isClosing = false) {
    this.output = this.formatter.addMarker(this.output, name, isClosing).normalizedOutput;
    return this;
  }
  
  text(content: string) {
    this.output = this.formatter.addTextContent(this.output, content).normalizedOutput;
    return this;
  }
  
  attributes(attrs: Record<string, string>) {
    this.output = this.formatter.addAttributes(this.output, attrs).normalizedOutput;
    return this;
  }
  
  build() {
    return this.output;
  }
}

// Usage
const formatter = new USFMFormatter();
const builder = new USFMBuilder(formatter);

const usfm = builder
  .marker('p')
  .marker('v')
  .text('1 In the beginning was the ')
  .marker('w')
  .attributes({ lemma: 'logos' })
  .text('Word')
  .marker('w', true)
  .text('.')
  .build();

console.log(usfm);
// \p
// \v 1 In the beginning was the \w |lemma="logos"Word\w*.
```

## Best Practices

1. **Always use the result**: Each method returns a `FormatResult` object with `normalizedOutput`
2. **Chain operations**: Build USFM incrementally using the output of previous operations
3. **Define custom markers upfront**: Add custom markers during formatter construction when possible
4. **Use closing markers**: Remember to close character markers with `isClosing: true`
5. **Handle attributes properly**: Add attributes before adding content to markers
6. **Consider builder patterns**: For complex documents, use helper functions or builder patterns

## Common Mistakes

### Forgetting to Use normalizedOutput

```typescript
// ❌ Wrong - not using the result
const formatter = new USFMFormatter();
formatter.addMarker('', 'p');
formatter.addTextContent('', 'content'); // This won't work

// ✅ Correct - using normalizedOutput
const formatter = new USFMFormatter();
let result = formatter.addMarker('', 'p').normalizedOutput;
result = formatter.addTextContent(result, 'content').normalizedOutput;
```

### Forgetting to Close Character Markers

```typescript
// ❌ Wrong - no closing marker
let text = formatter.addMarker('content', 'em').normalizedOutput;
text = formatter.addTextContent(text, 'emphasized').normalizedOutput;
// Missing closing \em*

// ✅ Correct - with closing marker
let text = formatter.addMarker('content', 'em').normalizedOutput;
text = formatter.addTextContent(text, 'emphasized').normalizedOutput;
text = formatter.addMarker(text, 'em', true).normalizedOutput; // \em*
```

### Adding Attributes After Content

```typescript
// ❌ Wrong - attributes after content
let text = formatter.addMarker('', 'w').normalizedOutput;
text = formatter.addTextContent(text, 'word').normalizedOutput;
text = formatter.addAttributes(text, { lemma: 'test' }).normalizedOutput; // Too late

// ✅ Correct - attributes before content
let text = formatter.addMarker('', 'w').normalizedOutput;
text = formatter.addAttributes(text, { lemma: 'test' }).normalizedOutput;
text = formatter.addTextContent(text, 'word').normalizedOutput;
```

This guide covers the essential usage patterns for the @usfm-tools/formatter package. For more advanced features and complete API reference, see the main README.md file. 