# API Reference - Rules-Based Normalization

## Main Functions

### `normalizeUSFM(usfm, options?, formattingRules?)`

Normalizes USFM text using rules-based formatting.

**Parameters:**
- `usfm: string` - The USFM text to normalize
- `options?: USFMParserOptionsType` - Parser options (optional)
- `formattingRules?: USFMFormattingRule[]` - Custom formatting rules (defaults to `coreUSFMFormattingRules`)

**Returns:** `string` - The normalized USFM text

**Example:**
```typescript
import { normalizeUSFM, coreUSFMFormattingRules } from '@usfm/parser';

// Basic usage with default rules
const normalized = normalizeUSFM(usfmText);

// With custom rules
const customRules = [...myRules, ...coreUSFMFormattingRules];
const normalized = normalizeUSFM(usfmText, undefined, customRules);
```

### `normalizeUSFMSimple(usfm, options?)`

Normalizes USFM text using the built-in parser normalization (basic whitespace handling).

**Parameters:**
- `usfm: string` - The USFM text to normalize
- `options?: USFMParserOptionsType` - Parser options (optional)

**Returns:** `string` - The normalized USFM text

**Example:**
```typescript
import { normalizeUSFMSimple } from '@usfm/parser';

const normalized = normalizeUSFMSimple(usfmText);
```

## Core Classes

### `USFMVisitor`

Visitor class that traverses the USFM AST and applies formatting rules.

**Constructor:**
```typescript
new USFMVisitor(options?: USFMVisitorOptions)
```

**Options:**
```typescript
interface USFMVisitorOptions {
  formattingRules?: USFMFormattingRule[];
  isDocumentStart?: boolean;
  normalizeLineEndings?: boolean;
  preserveWhitespace?: boolean;
}
```

**Methods:**
- `getResult(): string` - Returns the formatted USFM text
- `reset(): void` - Resets the visitor state for reuse

**Example:**
```typescript
import { USFMParser, USFMVisitor } from '@usfm/parser';

const parser = new USFMParser();
const nodes = parser.load(usfmText).parse().getNodes();

const visitor = new USFMVisitor({
  formattingRules: myCustomRules,
  normalizeLineEndings: true,
});

nodes.forEach(node => node.accept(visitor));
const result = visitor.getResult();
```

### `USFMFormatter`

Utility class for generating whitespace based on formatting rules.

**Constructor:**
```typescript
new USFMFormatter(rules: USFMFormattingRule[])
```

**Methods:**
- `getWhitespace(marker, markerType, context, position): { before: string; after: string }`

### `USFMFormattingRuleMatcher`

Utility class for finding and matching formatting rules.

**Static Methods:**
- `findMatchingRules(rules, marker, markerType, pattern): USFMFormattingRule[]`
- `getBestRule(rules, context, exceptions): USFMFormattingRule | null`

## Interfaces

### `USFMFormattingRule`

Defines a formatting rule for USFM markers.

```typescript
interface USFMFormattingRule {
  id: string;                      // Unique identifier
  priority: number;                // Rule priority (higher = more important)
  markerType?: MarkerType;         // Type of marker this rule applies to
  marker?: string;                 // Specific marker name
  pattern?: RegExp;                // Pattern for dynamic marker matching
  before: string;                  // Whitespace to add before the marker
  after: string;                   // Whitespace to add after the marker
  exceptions?: ExceptionContext[]; // Contexts where this rule doesn't apply
}
```

### `USFMVisitorOptions`

Options for configuring the USFMVisitor behavior.

```typescript
interface USFMVisitorOptions {
  formattingRules?: USFMFormattingRule[];  // Rules to apply
  isDocumentStart?: boolean;               // Whether at document start
  normalizeLineEndings?: boolean;          // Convert line endings to LF
  preserveWhitespace?: boolean;            // Preserve original whitespace
}
```

## Types

### `MarkerType`

Enum defining the types of USFM markers:

```typescript
type MarkerType = 'paragraph' | 'character' | 'note' | 'noteContent' | 'milestone';
```

### `ExceptionContext`

Contexts where rules may not apply:

```typescript
type ExceptionContext = 
  | 'document-start'
  | 'paragraph-with-verse'
  | 'within-note'
  | 'after-milestone';
```

## Constants

### `coreUSFMFormattingRules`

The default set of formatting rules that follow USFM standards.

```typescript
import { coreUSFMFormattingRules } from '@usfm/parser';

// Use as base for custom rules
const myRules = [...myCustomRules, ...coreUSFMFormattingRules];
```

### `MarkerTypeEnum`

Enum values for marker types:

```typescript
import { MarkerTypeEnum } from '@usfm/parser';

const rule = {
  markerType: MarkerTypeEnum.PARAGRAPH,
  // ...
};
```

## Usage Patterns

### Creating Custom Rules

```typescript
const customRules: USFMFormattingRule[] = [
  {
    id: 'custom-chapter',
    priority: 90,
    marker: 'c',
    before: '\n\n',
    after: '\n',
  },
  {
    id: 'poetry-lines',
    priority: 85,
    markerType: 'paragraph',
    pattern: /^q\d*$/,
    before: '\n',
    after: '\n',
  }
];
```

### Combining Rule Sets

```typescript
// Merge multiple rule sets with proper priority
const allRules = [
  ...organizationRules,    // Highest priority (90-100)
  ...translationRules,     // High priority (80-89)
  ...coreUSFMFormattingRules // Standard priority (1-79)
];
```

### Error Handling

```typescript
try {
  const normalized = normalizeUSFM(usfmText, undefined, customRules);
} catch (error) {
  if (error.message.includes('infinite loop')) {
    console.error('Parser infinite loop detected');
  } else {
    console.error('Normalization failed:', error.message);
  }
}
```

## Performance Considerations

- **Rule Count**: Keep the number of rules reasonable (< 100 for best performance)
- **Pattern Complexity**: Simple string matches are faster than complex regex patterns
- **Rule Priority**: Higher priority rules are checked first, so put common rules at higher priorities
- **Caching**: For batch processing, reuse the same visitor instance when possible

## Migration from Simple Normalization

```typescript
// Before (simple normalization)
const normalized = normalizeUSFMSimple(usfmText);

// After (rules-based normalization)
const normalized = normalizeUSFM(usfmText);

// With custom rules
const normalized = normalizeUSFM(usfmText, undefined, myCustomRules);
``` 