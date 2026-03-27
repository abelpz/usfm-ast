# @usfm-tools/formatter

A clean, efficient USFM formatter for building properly formatted USFM text. This package provides a simple API for adding markers, content, and attributes while automatically handling whitespace and structural formatting according to USFM 3.1.1 specifications.

## Installation

```bash
npm install @usfm-tools/formatter
```

## Quick Start

```typescript
import { USFMFormatter } from '@usfm-tools/formatter';

const formatter = new USFMFormatter();

// Build USFM step by step
let result = formatter.addMarker('', 'id');                    // "\id "
result = formatter.addTextContent(result.normalizedOutput, 'GEN Genesis');  // "\id GEN Genesis"
result = formatter.addMarker(result.normalizedOutput, 'c');                 // "\id GEN Genesis\n\c "
result = formatter.addTextContent(result.normalizedOutput, '1');            // "\id GEN Genesis\n\c 1"
result = formatter.addMarker(result.normalizedOutput, 'p');                 // "\id GEN Genesis\n\c 1\n\p "
result = formatter.addMarker(result.normalizedOutput, 'v');                 // "\id GEN Genesis\n\c 1\n\p\n\v "
result = formatter.addTextContent(result.normalizedOutput, '1 In the beginning'); // Final USFM

console.log(result.normalizedOutput);
// Output: \id GEN Genesis\n\c 1\n\p\n\v 1 In the beginning
```

## Core API

The formatter provides three core methods for building USFM:

### `addMarker(currentOutput, marker, isClosing?)`

Adds a USFM marker with proper structural whitespace.

```typescript
const formatter = new USFMFormatter();

// Add opening markers
formatter.addMarker('', 'p');              // "\p "
formatter.addMarker('content', 'w');       // "content \w "

// Add closing markers
formatter.addMarker('content', 'w', true); // "content\w*"
```

**Parameters:**
- `currentOutput`: The current USFM string being built
- `marker`: The marker name (without backslash)
- `isClosing`: Optional boolean for closing markers (default: false)

**Returns:** `FormatResult` with `normalizedOutput` property

### `addTextContent(currentOutput, textContent)`

Adds text content with intelligent spacing based on the preceding marker.

```typescript
const formatter = new USFMFormatter();

let result = formatter.addMarker('', 'v');
result = formatter.addTextContent(result.normalizedOutput, '1 Verse text');
// Result: "\v 1 Verse text"

// Handles special content like verse numbers
result = formatter.addTextContent('\v ', '1');
// Result: "\v 1 " (adds structural space after verse number)
```

**Parameters:**
- `currentOutput`: The current USFM string being built
- `textContent`: The text content to add

**Returns:** `FormatResult` with `normalizedOutput` property

### `addAttributes(currentOutput, attributes)`

Adds USFM 3.1.1 attributes with proper `|` separator syntax.

```typescript
const formatter = new USFMFormatter();

formatter.addAttributes('\w gracious', { lemma: 'grace' });
// Result: "\w gracious|lemma=\"grace\""

formatter.addAttributes('\w gracious', { 
  lemma: 'grace', 
  strong: 'H1234,G5485' 
});
// Result: "\w gracious|lemma=\"grace\" strong=\"H1234,G5485\""
```

**Parameters:**
- `currentOutput`: The current USFM string being built  
- `attributes`: Object with attribute key-value pairs

**Returns:** `FormatResult` with `normalizedOutput` property

### `addMilestone(currentOutput, marker, attributes?)`

Adds a self-closing milestone marker with proper formatting. Milestone markers are commonly used for alignment, quotations, and other structural annotations.

```typescript
const formatter = new USFMFormatter();

// Milestone without attributes
formatter.addMilestone('text', 'zaln-s');
// Result: "text \zaln-s\*"

// Milestone with attributes
formatter.addMilestone('text', 'zaln-s', { 
  who: 'Jesus', 
  occurrence: '1' 
});
// Result: "text \zaln-s |who=\"Jesus\" occurrence=\"1\"\*"

// Common alignment markers
formatter.addMilestone('', 'zaln-s', { 
  'x-morph': 'He,Np',
  'x-occurrence': '1',
  'x-occurrences': '1'
});
// Result: "\zaln-s |x-morph=\"He,Np\" x-occurrence=\"1\" x-occurrences=\"1\"\*"

formatter.addMilestone('content', 'zaln-e');
// Result: "content \zaln-e\*"
```

**Parameters:**
- `currentOutput`: The current USFM string being built
- `marker`: The milestone marker name (without backslash or asterisk)  
- `attributes`: Optional object with attribute key-value pairs

**Returns:** `FormatResult` with `normalizedOutput` property

## Complete Examples

### Basic Bible Text

```typescript
const formatter = new USFMFormatter();

let usfm = '';
usfm = formatter.addMarker(usfm, 'id').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'MAT Matthew').normalizedOutput;
usfm = formatter.addMarker(usfm, 'c').normalizedOutput;
usfm = formatter.addTextContent(usfm, '1').normalizedOutput;
usfm = formatter.addMarker(usfm, 'p').normalizedOutput;
usfm = formatter.addMarker(usfm, 'v').normalizedOutput;
usfm = formatter.addTextContent(usfm, '1 The book of the genealogy of Jesus Christ').normalizedOutput;

console.log(usfm);
// \id MAT Matthew
// \c 1
// \p
// \v 1 The book of the genealogy of Jesus Christ
```

### Character Markers with Attributes

```typescript
const formatter = new USFMFormatter();

let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 In the beginning was the ').normalizedOutput;

// Add word marker with attributes
text = formatter.addMarker(text, 'w').normalizedOutput;
text = formatter.addAttributes(text, { 
  lemma: 'logos', 
  strong: 'G3056' 
}).normalizedOutput;
text = formatter.addTextContent(text, 'Word').normalizedOutput;
text = formatter.addMarker(text, 'w', true).normalizedOutput; // Close marker

text = formatter.addTextContent(text, '.').normalizedOutput;

console.log(text);
// \p
// \v 1 In the beginning was the \w |lemma="logos" strong="G3056"Word\w*.
```

### Footnotes and Cross-References

```typescript
const formatter = new USFMFormatter();

let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 Jesus').normalizedOutput;

// Add footnote
text = formatter.addMarker(text, 'f').normalizedOutput;
text = formatter.addTextContent(text, '+ ').normalizedOutput;
text = formatter.addMarker(text, 'fr').normalizedOutput;
text = formatter.addTextContent(text, '1.1 ').normalizedOutput;
text = formatter.addMarker(text, 'ft').normalizedOutput;
text = formatter.addTextContent(text, 'Greek: Iesous').normalizedOutput;
text = formatter.addMarker(text, 'f', true).normalizedOutput; // Close footnote

text = formatter.addTextContent(text, ' said').normalizedOutput;

console.log(text);
// \p
// \v 1 Jesus\f + \fr 1.1 \ft Greek: Iesous\f* said
```

### Milestone Markers for Alignment

```typescript
const formatter = new USFMFormatter();

let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 In the beginning was the ').normalizedOutput;

// Add alignment milestone for "Word"
text = formatter.addMilestone(text, 'zaln-s', {
  'x-morph': 'Gr,N,,,,,NMS,',
  'x-occurrence': '1',
  'x-occurrences': '1',
  'x-content': 'λόγος'
}).normalizedOutput;

text = formatter.addTextContent(text, 'Word').normalizedOutput;

// Close alignment
text = formatter.addMilestone(text, 'zaln-e').normalizedOutput;

text = formatter.addTextContent(text, ', and the Word was with God.').normalizedOutput;

console.log(text);
// \p
// \v 1 In the beginning was the \zaln-s |x-morph="Gr,N,,,,,NMS," x-occurrence="1" x-occurrences="1" x-content="λόγος"\*Word\zaln-e\*, and the Word was with God.
```

## Configuration Options

```typescript
const formatter = new USFMFormatter({
  // Structural formatting choices
  paragraphContentOnNewLine: false,   // Content after \p on same line (default)
  versesOnNewLine: true,              // \v markers on new lines (default)
  characterMarkersOnNewLine: false,   // \w markers inline (default)
  noteMarkersOnNewLine: false,        // \f markers inline (default)
  
  // Granular marker control (takes precedence over broad categories above)
  markersOnNewLine: ['w', 'wj', 'qt'], // Specific markers that should start on new lines
  markersInline: ['bd', 'it', 'em'],   // Specific markers that should be inline
  
  // Category-wide overrides (takes precedence over broad categories, but not specific arrays)
  allCharacterMarkersOnNewLine: false, // All character markers on new lines
  allNoteMarkersOnNewLine: false,      // All note markers on new lines
  allNonParagraphMarkersOnNewLine: false, // All non-paragraph markers on new lines
  
  // Line length management
  maxLineLength: 0,                   // No line length limit (default)
  splitLongLines: false,              // Don't split long lines (default)
  
  // Custom marker definitions
  customMarkers: {
    'custom-para': { type: 'paragraph' },
    'custom-char': { type: 'character' }
  }
});
```

## Granular Marker Control

The formatter provides three levels of control for marker line formatting, with a clear priority order:

### Priority 1: Specific Marker Arrays (Highest Priority)

```typescript
const formatter = new USFMFormatter({
  // Only these specific markers will start on new lines
  markersOnNewLine: ['w', 'wj', 'qt'],
  
  // These specific markers will always be inline
  markersInline: ['bd', 'it', 'em', 'sup']
});

let text = '';
text = formatter.addMarker(text, 'p').normalizedOutput;
text = formatter.addMarker(text, 'v').normalizedOutput;
text = formatter.addTextContent(text, '1 Jesus said, ').normalizedOutput;

// \qt is in markersOnNewLine, so it goes on new line
text = formatter.addMarker(text, 'qt').normalizedOutput;
text = formatter.addTextContent(text, 'Follow me').normalizedOutput;
text = formatter.addMarker(text, 'qt', true).normalizedOutput;

text = formatter.addTextContent(text, '. The ').normalizedOutput;

// \w is in markersOnNewLine, so it goes on new line
text = formatter.addMarker(text, 'w').normalizedOutput;
text = formatter.addAttributes(text, { lemma: 'logos' }).normalizedOutput;
text = formatter.addTextContent(text, 'word').normalizedOutput;
text = formatter.addMarker(text, 'w', true).normalizedOutput;

text = formatter.addTextContent(text, ' was ').normalizedOutput;

// \bd is in markersInline, so it stays inline regardless of other settings
text = formatter.addMarker(text, 'bd').normalizedOutput;
text = formatter.addTextContent(text, 'bold').normalizedOutput;
text = formatter.addMarker(text, 'bd', true).normalizedOutput;

console.log(text);
// Output:
// \p
// \v 1 Jesus said, 
// \qt Follow me\qt*. The 
// \w |lemma="logos"word\w* was \bd bold\bd*
```

### Priority 2: Category-Wide Overrides

```typescript
// All character markers on new lines (but specific arrays override this)
const formatter = new USFMFormatter({
  allCharacterMarkersOnNewLine: true,  // All character markers on new lines
  markersInline: ['bd', 'it'],         // Except these - they stay inline
});

// All note markers on new lines
const noteFormatter = new USFMFormatter({
  allNoteMarkersOnNewLine: true,       // All \f, \x, etc. on new lines
  markersInline: ['fe']                // Except \fe - it stays inline
});

// All non-paragraph markers on new lines (very structured)
const structuredFormatter = new USFMFormatter({
  allNonParagraphMarkersOnNewLine: true, // Everything except \p, \q, \m, etc.
  markersInline: ['sup', 'i']            // Except these specific ones
});
```

### Priority 3: Broad Categories (Lowest Priority)

```typescript
// Traditional broad category control
const formatter = new USFMFormatter({
  characterMarkersOnNewLine: true,     // All character markers on new lines
  noteMarkersOnNewLine: false,         // All note markers inline
  // These are overridden by more specific settings above
});
```

### Complete Example: Fine-Grained Control

```typescript
// Complex formatting rules for a study Bible
const studyBibleFormatter = new USFMFormatter({
  // Specific word study markers on new lines for clarity
  markersOnNewLine: ['w', 'wj', 'wg', 'wh'],
  
  // Common formatting markers stay inline for readability
  markersInline: ['bd', 'it', 'em', 'sup', 'ord'],
  
  // All footnotes and cross-references on new lines for study
  allNoteMarkersOnNewLine: true,
  
  // But endnotes stay inline
  markersInline: ['fe', 'ef'], // This overrides allNoteMarkersOnNewLine for these specific markers
  
  // Custom study markers
  customMarkers: {
    'study-note': { type: 'note' },
    'cross-ref': { type: 'note' },
    'word-study': { type: 'character' }
  }
});

// Example usage
let bible = '';
bible = studyBibleFormatter.addMarker(bible, 'p').normalizedOutput;
bible = studyBibleFormatter.addMarker(bible, 'v').normalizedOutput;
bible = studyBibleFormatter.addTextContent(bible, '1 In the beginning was the ').normalizedOutput;

// \w is in markersOnNewLine
bible = studyBibleFormatter.addMarker(bible, 'w').normalizedOutput;
bible = studyBibleFormatter.addAttributes(bible, { lemma: 'logos', strong: 'G3056' }).normalizedOutput;
bible = studyBibleFormatter.addTextContent(bible, 'Word').normalizedOutput;
bible = studyBibleFormatter.addMarker(bible, 'w', true).normalizedOutput;

bible = studyBibleFormatter.addTextContent(bible, ', and the Word was ').normalizedOutput;

// \bd is in markersInline
bible = studyBibleFormatter.addMarker(bible, 'bd').normalizedOutput;
bible = studyBibleFormatter.addTextContent(bible, 'God').normalizedOutput;
bible = studyBibleFormatter.addMarker(bible, 'bd', true).normalizedOutput;

// \f is a note marker, allNoteMarkersOnNewLine is true, so it goes on new line
bible = studyBibleFormatter.addMarker(bible, 'f').normalizedOutput;
bible = studyBibleFormatter.addTextContent(bible, '+ ').normalizedOutput;
bible = studyBibleFormatter.addMarker(bible, 'fr').normalizedOutput;
bible = studyBibleFormatter.addTextContent(bible, '1.1 ').normalizedOutput;
bible = studyBibleFormatter.addMarker(bible, 'ft').normalizedOutput;
bible = studyBibleFormatter.addTextContent(bible, 'Greek: Theos').normalizedOutput;
bible = studyBibleFormatter.addMarker(bible, 'f', true).normalizedOutput;

bible = studyBibleFormatter.addTextContent(bible, '.').normalizedOutput;

console.log(bible);
// Output:
// \p
// \v 1 In the beginning was the 
// \w |lemma="logos" strong="G3056"Word\w*, and the Word was \bd God\bd*
// \f + \fr 1.1 \ft Greek: Theos\f*.
```

### Dynamic Rule Updates

You can change the rules at runtime for different document sections:

```typescript
const formatter = new USFMFormatter();

// Start with minimal formatting
let document = buildIntroduction(formatter);

// Switch to word-study formatting for main text
formatter.updateOptions({
  markersOnNewLine: ['w', 'wj', 'wg'],
  allNoteMarkersOnNewLine: true
});
document += buildMainText(formatter);

// Switch to poetry formatting
formatter.updateOptions({
  markersOnNewLine: [],           // Clear specific markers
  markersInline: ['w', 'wj'],     // Words inline in poetry
  allNoteMarkersOnNewLine: false, // Notes inline in poetry
  versesOnNewLine: false          // Verses inline in poetry
});
document += buildPsalms(formatter);

// Switch back to study formatting
formatter.updateOptions({
  markersOnNewLine: ['w', 'wj'],
  markersInline: ['bd', 'it'],
  allNoteMarkersOnNewLine: true,
  versesOnNewLine: true
});
document += buildCommentary(formatter);
```

### Option Effects

**`versesOnNewLine: false`**
```typescript
// Default (true): verses on new lines
\p Text
\v 1 Verse text

// false: verses inline
\p Text \v 1 Verse text
```

**`paragraphContentOnNewLine: true`**
```typescript
// Default (false): content on same line
\p Content here

// true: content on new line
\p
Content here
```

## Custom Markers

### Define Custom Markers

```typescript
const formatter = new USFMFormatter({
  customMarkers: {
    'study-note': { type: 'note' },
    'highlight': { type: 'character' },
    'section-break': { type: 'paragraph' }
  }
});

// Use custom markers
let text = formatter.addMarker('', 'section-break').normalizedOutput;
text = formatter.addTextContent(text, 'Study Section').normalizedOutput;
```

### Add Markers at Runtime

```typescript
const formatter = new USFMFormatter();
formatter.addCustomMarker('my-marker', { type: 'character' });

// Now use the marker
const result = formatter.addMarker('text', 'my-marker');
```

### Automatic Marker Inference

The formatter can automatically infer marker types for unknown markers:

```typescript
const formatter = new USFMFormatter();

// Use unknown markers - they'll be inferred
formatter.addMarker('\p Text\n', 'unknown-para'); // Inferred as paragraph
formatter.addMarker('text', 'unknown-char');      // Inferred as character

// Check what was inferred
if (formatter.hasInferredMarkers()) {
  const inferred = formatter.getInferredMarkers();
  console.log(inferred);
  // {
  //   'unknown-para': { type: 'paragraph' },
  //   'unknown-char': { type: 'character' }
  // }
}

// Use inferred markers in production
const prodFormatter = new USFMFormatter({
  customMarkers: formatter.getInferredMarkers()
});
```

## Advanced Features

### Chaining Operations

For cleaner code, you can chain operations:

```typescript
const formatter = new USFMFormatter();

const buildVerse = (start: string, verseNum: string, text: string) => {
  let result = formatter.addMarker(start, 'v').normalizedOutput;
  result = formatter.addTextContent(result, `${verseNum} ${text}`).normalizedOutput;
  return result;
};

let usfm = formatter.addMarker('', 'p').normalizedOutput;
usfm = buildVerse(usfm, '1', 'First verse text');
usfm = buildVerse(usfm, '2', 'Second verse text');
```

### Builder Pattern Helper

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
```

### Updating Options

```typescript
const formatter = new USFMFormatter();

// Check current options
console.log(formatter.getOptions());

// Update options
formatter.updateOptions({ versesOnNewLine: false });

// Options affect subsequent formatting
const result = formatter.addMarker('\p Text ', 'v');
// Now verses will be inline
```

## USFM Compliance

The formatter follows USFM 3.1.1 specifications:

- **Structural Whitespace**: Automatically adds required whitespace between markers and content
- **Attribute Syntax**: Uses proper `|key="value"` syntax for attributes  
- **Marker Hierarchy**: Respects paragraph vs character vs note marker types
- **Special Content**: Handles verse numbers, chapter numbers, and footnote callers correctly
- **Closing Markers**: Properly formats closing markers without trailing whitespace

## Migration from Legacy APIs

If you're migrating from older formatting APIs:

```typescript
// Old complex rule-based approach ❌
const formatter = new USFMFormatter(complexRules);
const result = formatter.formatWithRules(input, context);

// New simple API ✅  
const formatter = new USFMFormatter();
let result = formatter.addMarker('', 'p').normalizedOutput;
result = formatter.addTextContent(result, 'content').normalizedOutput;
```

## Performance Notes

- The formatter is optimized for incremental building
- Custom markers should be defined upfront when possible  
- Marker inference has minimal overhead but can be avoided in production
- Registry-based marker lookup is efficient and caches results

## Common Patterns

### Document Structure

```typescript
const formatter = new USFMFormatter();

// Start with identification
let usfm = formatter.addMarker('', 'id').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'GEN Genesis').normalizedOutput;

// Add headers
usfm = formatter.addMarker(usfm, 'h').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'Genesis').normalizedOutput;

// Add title  
usfm = formatter.addMarker(usfm, 'mt1').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'The First Book of Moses, called Genesis').normalizedOutput;

// Start content
usfm = formatter.addMarker(usfm, 'c').normalizedOutput;
usfm = formatter.addTextContent(usfm, '1').normalizedOutput;
```

### Poetry Text

```typescript
const formatter = new USFMFormatter();

let usfm = formatter.addMarker('', 'q1').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'The Lord is my shepherd;').normalizedOutput;

usfm = formatter.addMarker(usfm, 'q2').normalizedOutput;
usfm = formatter.addTextContent(usfm, 'I shall not want.').normalizedOutput;
```

### Character Formatting

```typescript
const formatter = new USFMFormatter();

let text = formatter.addTextContent('', 'Jesus said to them, ').normalizedOutput;

// Add quoted text
text = formatter.addMarker(text, 'qt').normalizedOutput;
text = formatter.addTextContent(text, 'Follow me').normalizedOutput;
text = formatter.addMarker(text, 'qt', true).normalizedOutput;

text = formatter.addTextContent(text, '.').normalizedOutput;
```

## API Reference

### Main Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `addMarker` | Add USFM marker | `(output, marker, isClosing?)` | `FormatResult` |
| `addTextContent` | Add text content | `(output, content)` | `FormatResult` |
| `addAttributes` | Add USFM attributes | `(output, attributes)` | `FormatResult` |
| `addMilestone` | Add self-closing milestone marker | `(output, marker, attributes?)` | `FormatResult` |

### Setup Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `addCustomMarker` | Register custom marker | `(marker, info)` | `void` |
| `getOptions` | Get current options | `()` | `Options` |
| `updateOptions` | Update options | `(newOptions)` | `void` |
| `getInferredMarkers` | Get inferred markers | `()` | `Record<string, MarkerInfo>` |
| `clearInferredMarkers` | Clear inferred markers | `()` | `void` |
| `hasInferredMarkers` | Check if has inferred | `()` | `boolean` |

### Types

```typescript
interface FormatResult {
  normalizedOutput: string;
}

interface USFMFormatterOptions {
  paragraphContentOnNewLine?: boolean;
  versesOnNewLine?: boolean;  
  characterMarkersOnNewLine?: boolean;
  noteMarkersOnNewLine?: boolean;
  maxLineLength?: number;
  splitLongLines?: boolean;
  customMarkers?: Record<string, USFMMarkerInfo>;
}

interface USFMMarkerInfo {
  type: 'paragraph' | 'character' | 'note' | 'milestone';
  hasSpecialContent?: boolean;
}
```

## License

MIT License. See [LICENSE](../../LICENSE) for details.
