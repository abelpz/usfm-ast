# USFM Formatting Rules

This document defines the canonical formatting rules for USFM text that should be followed by:
- **Normalizers**: Converting USFM to standardized format
- **Converters**: Converting from USJ/USX to properly formatted USFM
- **Validators**: Checking USFM compliance

## Rule Categories

### 1. Line Ending Rules

| Rule | Description | Example |
|------|-------------|---------|
| `normalize-line-endings` | All line endings should be LF (`\n`) | `\r\n` → `\n` |

### 2. Marker Whitespace Rules

#### General Pattern
```
[whitespace-before][marker][whitespace-after][content]
```

#### By Marker Type

| Marker Type | Before Marker | After Marker | Notes |
|-------------|---------------|--------------|-------|
| **Paragraph** (`p`, `m`, `q1`, etc.) | `\n` (except at start) | ` ` (single space) | Structural boundaries |
| **Character** (`w`, `add`, `nd`, etc.) | ` ` (single space) | none | Inline **formatting** |
| **Note** (`f`, `fe`, `x`, etc.) | ` ` (single space) | ` ` (single space) | Inline references |
| **Milestone** (`zaln-s`, `zaln-e`, etc.) | ` ` (single space) | none | Alignment markers |

#### Special Cases

| Marker | Before | After | Special Rules |
|--------|--------|-------|---------------|
| `\v` | `\n` | ` ` | Verse numbers: normalize internal whitespace |
| `\c` | `\n` | ` ` | Chapter numbers: normalize internal whitespace |
| `\id` | none (document start) | ` ` | Must be first marker |
| `\h` | `\n` | ` ` | Header information |

### 3. Content Whitespace Rules

| Rule | Pattern | Replacement | Description |
|------|---------|-------------|-------------|
| `collapse-spaces` | Multiple spaces | Single space | Between words |
| `collapse-newlines` | Multiple `\n` | Single `\n` | Between structural elements |
| `trim-line-ends` | Trailing spaces before `\n` | Remove | Clean line endings |

### 4. Marker-Specific Content Rules

#### Verse Numbers (`\v`)
```usfm
\v 1 Text here
\v 2-3 Range verse
\v 4a Verse with letter
```
- Internal whitespace in verse numbers normalized to single space
- Content after verse number separated by single space

#### Chapter Numbers (`\c`)
```usfm
\c 1
\c 10
```
- No content after chapter number except whitespace
- Single space after marker

### 5. Structural Rules

#### Paragraph Flow Rules

**Rule: Paragraph Content Placement**
- If paragraph marker is followed by **non-verse content**: content on same line
- If paragraph marker is followed by **verse marker**: verse on new line
- If paragraph marker has **no content**: standalone paragraph

```usfm
# Same line for immediate text content
\p Some introductory text here
\v 1 Then verse content

# New line for verse-only paragraphs  
\p
\v 1 First verse in paragraph
\v 2 Second verse in paragraph

# Mixed: text on same line, verses on new lines
\p Introduction text
\v 1 First verse
\v 2 Second verse
```

**Implementation Priority**: This rule has higher priority than general paragraph whitespace rules.

#### Poetry Structure
```usfm
\q1 First line of poetry
\q2 Second level indent
\q1 Back to first level
```

#### Verse Line Rules
- **Verses within paragraphs**: Always start on new line (except after paragraph text)
- **Consecutive verses**: Each on separate line
- **Verse content**: Single space after verse number

### 6. Exception Rules

| Context | Exception | Rule Override |
|---------|-----------|---------------|
| Document start | No newline before first marker | `\id` can start immediately |
| After breaks | No extra spacing | `\b` followed directly by next marker |
| Within notes | Different spacing | Note content markers follow note rules |
| Table cells | Implicit closing | Cell markers close previous cells |

## Rule Implementation Format

### TypeScript Rule Definition
```typescript
export interface USFMFormattingRule {
  id: string;
  description: string;
  applies: MarkerMatcher | MarkerMatcher[];
  whitespace: {
    before?: WhitespaceRule;
    after?: WhitespaceRule;
  };
  content?: ContentRule;
  exceptions?: ExceptionRule[];
}

export interface MarkerMatcher {
  type?: 'paragraph' | 'character' | 'note' | 'milestone';
  marker?: string | string[];
  pattern?: RegExp;
}

export interface WhitespaceRule {
  type: 'none' | 'space' | 'newline' | 'preserve';
  count?: number;
  exceptions?: string[];
}
```

### Example Rule Definitions
```typescript
export const usfmFormattingRules: USFMFormattingRule[] = [
  {
    id: 'paragraph-whitespace',
    description: 'Paragraph markers should be preceded by newline and followed by space',
    applies: { type: 'paragraph' },
    whitespace: {
      before: { type: 'newline', exceptions: ['document-start'] },
      after: { type: 'space', count: 1 }
    }
  },
  {
    id: 'verse-marker-special',
    description: 'Verse markers have special newline handling',
    applies: { marker: 'v' },
    whitespace: {
      before: { type: 'newline' },
      after: { type: 'space', count: 1 }
    },
    content: {
      normalizeInternalWhitespace: true
    }
  },
  {
    id: 'character-marker-inline',
    description: 'Character markers are inline with space before',
    applies: { type: 'character' },
    whitespace: {
      before: { type: 'space', count: 1, exceptions: ['after-newline', 'document-start'] },
      after: { type: 'none' }
    },
    exceptions: [
      { marker: 'v', overrides: 'verse-marker-special' }
    ]
  }
];
```

## Usage Examples

### For Normalizers
```typescript
const normalizer = new USFMNormalizer(usfmFormattingRules);
const normalized = normalizer.normalize(rawUsfm);
```

### For Converters
```typescript
const converter = new USJToUSFM(usfmFormattingRules);
const usfm = converter.convert(usjData);
```

### For Validators
```typescript
const validator = new USFMValidator(usfmFormattingRules);
const issues = validator.validate(usfmText);
```

## Testing Strategy

Each rule should have:
1. **Positive tests**: Correctly formatted examples
2. **Negative tests**: Incorrectly formatted examples that should be fixed
3. **Edge cases**: Boundary conditions and exceptions
4. **Integration tests**: Multiple rules working together

## Future Extensions

This rule system can be extended to support:
- Custom marker definitions
- Language-specific formatting preferences
- Project-specific style guides
- Validation severity levels (error, warning, info) 