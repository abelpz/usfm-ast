# @usfm-tools/formatter

USFM formatting rules for consistent text normalization. This package provides configurable rules for USFM text formatting, designed to work with `@usfm-tools/adapters` for actual text transformation.

## Architecture

- **@usfm-tools/formatter**: Defines formatting rules
- **@usfm-tools/adapters**: Applies rules using USFMVisitor
- **@usfm-tools/parser**: Parses USFM into AST

This separation ensures clean architecture and prevents circular dependencies.

## Installation

```bash
npm install @usfm-tools/formatter @usfm-tools/adapters @usfm-tools/parser
```

## Quick Start

### Basic Normalization

```typescript
import { USFMFormatter, coreUSFMFormattingRules } from '@usfm-tools/formatter';
import { USFMVisitor } from '@usfm-tools/adapters';
import { USFMParser } from '@usfm-tools/parser';

// Parse USFM into AST
const parser = new USFMParser();
const ast = parser.load(usfm).parse();

// Create formatter with rules
const formatter = new USFMFormatter(coreUSFMFormattingRules);

// Apply formatting using visitor
const visitor = new USFMVisitor({ formatter });
const normalized = visitor.visit(ast);
```

### Simple Normalization (Limited)

For basic use cases without custom rules:

```typescript
import { normalizeUSFMSimple } from '@usfm-tools/formatter';

const normalized = normalizeUSFMSimple('\\id TIT\r\n\\c  1');
// Basic whitespace cleanup only
```

## Formatting Rules

### Core Rules

The package includes `coreUSFMFormattingRules` that handle standard USFM spacing:

```typescript
import { coreUSFMFormattingRules } from '@usfm-tools/formatter';

// View available rules
console.log(coreUSFMFormattingRules);
```

### Creating Custom Rules

Rules control spacing before and after USFM markers:

```typescript
import { USFMFormattingRule } from '@usfm-tools/formatter';

// Custom rule for verse spacing
const customVerseRule: USFMFormattingRule = {
  id: 'custom-verse-spacing',
  name: 'Custom Verse Spacing',
  description: 'Verses on new lines with no space after',
  priority: 100,
  applies: {
    marker: 'v'
  },
  whitespace: {
    before: '\n',
    after: ''
  }
};

// Custom rule for paragraph breaks
const paragraphBreakRule: USFMFormattingRule = {
  id: 'paragraph-breaks',
  name: 'Paragraph Line Breaks',
  description: 'Force paragraph markers on new lines',
  priority: 90,
  applies: {
    marker: 'p'
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};
```

### Context-Aware Rules

Rules can apply based on context conditions:

```typescript
// Rule that applies only when verse follows chapter
const verseAfterChapterRule: USFMFormattingRule = {
  id: 'verse-after-chapter',
  name: 'Verse After Chapter',
  description: 'Special spacing for verses immediately after chapters',
  priority: 150,
  applies: {
    marker: 'v',
    context: {
      previousMarker: 'c'
    }
  },
  whitespace: {
    before: ' ',  // Space, not newline after chapter
    after: ' '
  }
};

// Rule with multiple previous marker conditions
const verseAfterMultipleRule: USFMFormattingRule = {
  id: 'verse-after-headers',
  name: 'Verse After Headers',
  priority: 140,
  applies: {
    marker: 'v',
    context: {
      previousMarker: ['c', 's1', 's2', 'mt1']  // Array of possible previous markers
    }
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

// Rule with ancestor context (hierarchy checking)
const verseInPoetryRule: USFMFormattingRule = {
  id: 'verse-in-poetry',
  name: 'Verse in Poetry Context',
  description: 'Special verse formatting when inside poetry sections',
  priority: 130,
  applies: {
    marker: 'v',
    context: {
      ancestorMarkers: ['q', 'q1', 'q2']  // Verse inside poetry
    }
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

// Rule with document start condition
const firstMarkerRule: USFMFormattingRule = {
  id: 'first-marker',
  name: 'Document Start',
  description: 'No spacing before first marker',
  priority: 200,
  applies: {
    marker: 'id',
    context: {
      isDocumentStart: true
    }
  },
  whitespace: {
    before: '',  // No space at document start
    after: ' '
  }
};

// Rule with content pattern matching
const shortContentRule: USFMFormattingRule = {
  id: 'short-content',
  name: 'Short Content Special Handling',
  priority: 90,
  applies: {
    marker: 'v',
    context: {
      hasContent: true,
      contentPattern: /^.{1,10}$/  // Very short content (1-10 chars)
    }
  },
  whitespace: {
    before: ' ',
    after: ''
  }
};
```

### Pattern-Based Rules

Use regular expressions to match multiple related markers:

```typescript
// Rule for all poetry markers (q, q1, q2, q3, etc.)
const poetryRule: USFMFormattingRule = {
  id: 'poetry-lines',
  name: 'Poetry Line Formatting',
  description: 'Consistent spacing for all poetry markers',
  priority: 90,
  applies: {
    pattern: /^q\d*$/  // Matches q, q1, q2, q3, etc.
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

// Rule for all list items (li, li1, li2, li3, etc.)
const listItemRule: USFMFormattingRule = {
  id: 'list-items',
  name: 'List Item Spacing',
  description: 'Consistent spacing for all list item markers',
  priority: 80,
  applies: {
    pattern: /^li\d*$/  // Matches li, li1, li2, li3, etc.
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

// Rule for all section headers (s, s1, s2, s3, s4)
const sectionHeaderRule: USFMFormattingRule = {
  id: 'section-headers',
  name: 'Section Header Spacing',
  priority: 85,
  applies: {
    pattern: /^s\d*$/  // Matches s, s1, s2, s3, s4
  },
  whitespace: {
    before: '\n\n',  // Double line break for sections
    after: '\n'
  }
};
```

## Advanced Usage

### Custom Formatter Configuration

```typescript
import { USFMFormatter, coreUSFMFormattingRules } from '@usfm-tools/formatter';

// Combine core rules with custom rules
const customRules = [
  ...coreUSFMFormattingRules,
  customVerseRule,
  paragraphBreakRule,
  verseAfterChapterRule
];

const formatter = new USFMFormatter(customRules);

// Use with specific options
const formatterWithOptions = new USFMFormatter(customRules, {
  strictMode: true,
  preserveWhitespace: false
});
```

### Rule Priority System

Rules with higher priority override lower priority rules:

```typescript
const highPriorityRule: USFMFormattingRule = {
  id: 'high-priority-verse',
  name: 'High Priority Verse Rule',
  priority: 1000,  // Very high priority
  applies: {
    marker: 'v'
  },
  whitespace: {
    before: '\n\n',  // Double newline
    after: ' '
  }
};
```

### Complex Context Conditions

Combine multiple context conditions:

```typescript
const complexContextRule: USFMFormattingRule = {
  id: 'complex-verse-rule',
  name: 'Complex Verse Context',
  priority: 120,
  applies: {
    marker: 'v',
    context: {
      previousMarker: ['p', 'm'],      // Previous marker is p or m
      ancestorMarkers: ['q1'],         // Inside q1 poetry
      hasContent: true,                // Has content
      contentPattern: /^\d+\s/,       // Content starts with number and space
      isDocumentStart: false           // Not at document start
    }
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};
```

## Integration Examples

### With Custom Presets

```typescript
// Create preset for Bible translation
const bibleTranslationRules: USFMFormattingRule[] = [
  {
    id: 'chapter-breaks',
    name: 'Chapter Breaks',
    priority: 100,
    applies: { marker: 'c' },
    whitespace: { before: '\n\n', after: ' ' }
  },
  {
    id: 'verse-inline',
    name: 'Inline Verses',
    priority: 90,
    applies: { marker: 'v' },
    whitespace: { before: ' ', after: ' ' }
  },
  {
    id: 'paragraph-standard',
    name: 'Standard Paragraphs',
    priority: 80,
    applies: { marker: 'p' },
    whitespace: { before: '\n', after: '' }
  }
];

// Use preset
const formatter = new USFMFormatter(bibleTranslationRules);
```

### Batch Processing

```typescript
import { USFMFormatter } from '@usfm-tools/formatter';
import { USFMVisitor } from '@usfm-tools/adapters';
import { USFMParser } from '@usfm-tools/parser';

async function normalizeUSFMFiles(files: string[], rules: USFMFormattingRule[]) {
  const parser = new USFMParser();
  const formatter = new USFMFormatter(rules);
  const visitor = new USFMVisitor({ formatter });
  
  const results = [];
  
  for (const file of files) {
    try {
      const usfm = await readFile(file);
      const ast = parser.load(usfm).parse();
      const normalized = visitor.visit(ast);
      results.push({ file, normalized, success: true });
    } catch (error) {
      results.push({ file, error, success: false });
    }
  }
  
  return results;
}
```

## Rule Reference

### Rule Structure

```typescript
interface USFMFormattingRule {
  id: string;                    // Unique identifier
  name: string;                  // Human-readable name
  description?: string;          // Rule description
  priority: number;              // Higher = more important (0-1000)
  applies: MarkerMatcher;        // When to apply this rule
  whitespace: {                  // What spacing to apply
    before?: string;             // Whitespace before marker
    after?: string;              // Whitespace after marker
  };
}

interface MarkerMatcher {
  marker?: string;               // Specific marker name (e.g., 'v', 'p')
  pattern?: RegExp;              // Pattern for multiple markers (e.g., /^q\d*$/)
  context?: ContextCondition;    // Additional context requirements
}

interface ContextCondition {
  previousMarker?: string | string[];     // Previous marker(s)
  nextMarker?: string | string[];         // Next marker(s)
  ancestorMarkers?: string[];             // Ancestor markers in hierarchy
  isDocumentStart?: boolean;              // Is this the first marker?
  hasContent?: boolean;                   // Does marker have content?
  contentPattern?: RegExp;                // Pattern for content matching
}
```

### Common Patterns

#### Verse Numbering Styles

```typescript
// Inline verses: \v 1 Text continues...
const inlineVerses: USFMFormattingRule = {
  id: 'inline-verses',
  name: 'Inline Verse Numbers',
  priority: 100,
  applies: { marker: 'v' },
  whitespace: { before: ' ', after: ' ' }
};

// Block verses: \n\v 1 Text on new line
const blockVerses: USFMFormattingRule = {
  id: 'block-verses',
  name: 'Block Verse Numbers',  
  priority: 100,
  applies: { marker: 'v' },
  whitespace: { before: '\n', after: ' ' }
};
```

#### Chapter Formatting

```typescript
// Chapters with double line break
const chapterBreaks: USFMFormattingRule = {
  id: 'chapter-breaks',
  name: 'Chapter with Breaks',
  priority: 100,
  applies: { marker: 'c' },
  whitespace: { before: '\n\n', after: '\n' }
};
```

#### Poetry Formatting

```typescript
// Poetry lines with consistent indentation
const poetryRule: USFMFormattingRule = {
  id: 'poetry-lines',
  name: 'Poetry Line Formatting',
  priority: 90,
  applies: { pattern: /^q\d*$/ },
  whitespace: { before: '\n', after: ' ' }
};
```

## Best Practices

1. **Use adapters package**: Always use `@usfm-tools/adapters` for actual normalization
2. **Rule priority**: Higher numbers = higher priority (0-1000 range)
3. **Test rules**: Validate your custom rules with sample USFM
4. **Document rules**: Include clear names and descriptions
5. **Context awareness**: Use context conditions for complex scenarios
6. **Pattern efficiency**: Use patterns for multiple related markers
7. **Priority planning**: Plan your priority hierarchy before implementing

## Migration from Legacy

If upgrading from old `normalizeUSFM` usage:

```typescript
// Old approach (deprecated)
import { normalizeUSFM } from '@usfm-tools/formatter';
const result = normalizeUSFM(usfm, undefined, customRules);

// New approach (recommended)
import { USFMFormatter } from '@usfm-tools/formatter';
import { USFMVisitor } from '@usfm-tools/adapters';
import { USFMParser } from '@usfm-tools/parser';

const parser = new USFMParser();
const ast = parser.load(usfm).parse();
const formatter = new USFMFormatter(customRules);
const visitor = new USFMVisitor({ formatter });
const result = visitor.visit(ast);
```

## API Reference

See the [API documentation](./docs/api.md) for complete method signatures and options.

## License

MIT License. See [LICENSE](../../LICENSE) for details.
