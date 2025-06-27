# Advanced USFM Formatter Features

This guide covers the advanced features implemented in `@usfm-tools/formatter` for sophisticated USFM text formatting.

## Overview of New Features

The formatter now includes several advanced capabilities:

1. **Context-Aware Rules** - Rules that apply based on document structure and marker relationships
2. **Pattern-Based Matching** - Use regular expressions to match multiple related markers
3. **FormattingFunction Interface** - Dynamic formatting functions for complex scenarios
4. **Enhanced Priority System** - Sophisticated rule precedence handling
5. **Content Pattern Matching** - Rules based on marker content patterns

## Context-Aware Rules

### Basic Context Conditions

Context conditions allow rules to apply only when specific document structure conditions are met:

```typescript
import { USFMFormattingRule } from '@usfm-tools/formatter';

// Rule applies only when verse follows chapter
const verseAfterChapterRule: USFMFormattingRule = {
  id: 'verse-after-chapter',
  name: 'Verse After Chapter',
  priority: 150,
  applies: {
    marker: 'v',
    context: {
      previousMarker: 'c'
    }
  },
  whitespace: {
    before: ' ',   // Space instead of newline after chapter
    after: ' '
  }
};
```

### Multiple Previous Markers

Use arrays to match multiple possible previous markers:

```typescript
const verseAfterHeadersRule: USFMFormattingRule = {
  id: 'verse-after-headers',
  name: 'Verse After Headers',
  priority: 140,
  applies: {
    marker: 'v',
    context: {
      previousMarker: ['c', 's1', 's2', 'mt1', 'mt2']  // Any of these
    }
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};
```

### Hierarchical Context (Ancestor Markers)

Rules can apply based on the marker hierarchy (what section the marker is inside):

```typescript
const verseInPoetryRule: USFMFormattingRule = {
  id: 'verse-in-poetry',
  name: 'Verse in Poetry Context',
  priority: 130,
  applies: {
    marker: 'v',
    context: {
      ancestorMarkers: ['q', 'q1', 'q2']  // Inside any poetry section
    }
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

const listItemInSectionRule: USFMFormattingRule = {
  id: 'list-in-section',
  name: 'List Item in Section',
  priority: 120,
  applies: {
    marker: 'li1',
    context: {
      ancestorMarkers: ['s1']  // Inside a section header
    }
  },
  whitespace: {
    before: '\n\n',  // Extra spacing in sections
    after: ' '
  }
};
```

### Document Position Context

Handle special cases for document start and other positions:

```typescript
const documentStartRule: USFMFormattingRule = {
  id: 'document-start-id',
  name: 'Document Start ID',
  priority: 200,
  applies: {
    marker: 'id',
    context: {
      isDocumentStart: true
    }
  },
  whitespace: {
    before: '',  // No spacing at document start
    after: ' '
  }
};

const notDocumentStartRule: USFMFormattingRule = {
  id: 'regular-id',
  name: 'Regular ID Marker',
  priority: 100,
  applies: {
    marker: 'id',
    context: {
      isDocumentStart: false  // Not at document start
    }
  },
  whitespace: {
    before: '\n\n',  // More spacing for mid-document ID
    after: ' '
  }
};
```

### Content-Based Context

Rules can apply based on the content of markers:

```typescript
const shortContentRule: USFMFormattingRule = {
  id: 'short-verse-content',
  name: 'Short Verse Content',
  priority: 120,
  applies: {
    marker: 'v',
    context: {
      hasContent: true,
      contentPattern: /^.{1,20}$/  // Very short content (1-20 chars)
    }
  },
  whitespace: {
    before: ' ',
    after: ' '
  }
};

const numericContentRule: USFMFormattingRule = {
  id: 'numeric-verse',
  name: 'Numeric Verse Pattern',
  priority: 110,
  applies: {
    marker: 'v',
    context: {
      contentPattern: /^\d+\s/  // Starts with number and space
    }
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

const emptyContentRule: USFMFormattingRule = {
  id: 'empty-marker',
  name: 'Empty Marker',
  priority: 90,
  applies: {
    marker: 'p',
    context: {
      hasContent: false  // No content
    }
  },
  whitespace: {
    before: '\n',
    after: ''  // No space after empty paragraphs
  }
};
```

## Pattern-Based Rules

Use regular expressions to match multiple related markers efficiently:

### Poetry Patterns

```typescript
const allPoetryRule: USFMFormattingRule = {
  id: 'all-poetry-markers',
  name: 'All Poetry Formatting',
  priority: 90,
  applies: {
    pattern: /^q\d*$/  // Matches q, q1, q2, q3, etc.
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

const poetryWithIndentRule: USFMFormattingRule = {
  id: 'poetry-with-indent',
  name: 'Poetry with Indentation',
  priority: 85,
  applies: {
    pattern: /^q[2-9]$/  // Only q2, q3, etc. (not q or q1)
  },
  whitespace: {
    before: '\n',
    after: '  '  // Extra space for indentation levels
  }
};
```

### List Patterns

```typescript
const allListsRule: USFMFormattingRule = {
  id: 'all-list-items',
  name: 'All List Items',
  priority: 85,
  applies: {
    pattern: /^li\d*$/  // Matches li, li1, li2, li3, etc.
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

const nestedListsRule: USFMFormattingRule = {
  id: 'nested-lists',
  name: 'Nested List Items',
  priority: 80,
  applies: {
    pattern: /^li[2-9]$/  // li2, li3, etc. (nested)
  },
  whitespace: {
    before: '\n',
    after: '  '  // Extra indentation
  }
};
```

### Section Header Patterns

```typescript
const allSectionsRule: USFMFormattingRule = {
  id: 'all-sections',
  name: 'All Section Headers',
  priority: 80,
  applies: {
    pattern: /^s\d*$/  // s, s1, s2, s3, s4
  },
  whitespace: {
    before: '\n\n',  // Double line break for sections
    after: '\n'
  }
};

const majorSectionsRule: USFMFormattingRule = {
  id: 'major-sections',
  name: 'Major Section Headers',
  priority: 75,
  applies: {
    pattern: /^(s|s1)$/  // Only s and s1 (major sections)
  },
  whitespace: {
    before: '\n\n\n',  // Triple line break for major sections
    after: '\n'
  }
};
```

### Complex Patterns

```typescript
const titlePatternsRule: USFMFormattingRule = {
  id: 'title-patterns',
  name: 'Title Patterns',
  priority: 75,
  applies: {
    pattern: /^(mt|mte|ms|mr)\d*$/  // All title types with optional numbers
  },
  whitespace: {
    before: '\n\n',
    after: '\n'
  }
};

const footnotePatternRule: USFMFormattingRule = {
  id: 'footnote-patterns',
  name: 'Footnote Patterns',
  priority: 70,
  applies: {
    pattern: /^f[entx]?$/  // f, fe, fn, ft, fx
  },
  whitespace: {
    before: '',
    after: ' '
  }
};
```

## Complex Context Combinations

Combine multiple context conditions for sophisticated rule matching:

```typescript
const complexContextRule: USFMFormattingRule = {
  id: 'complex-verse-rule',
  name: 'Complex Verse Context',
  priority: 160,
  applies: {
    marker: 'v',
    context: {
      previousMarker: ['p', 'm'],        // Previous is paragraph or margin
      ancestorMarkers: ['q1'],           // Inside q1 poetry
      hasContent: true,                  // Has content
      contentPattern: /^\d+\s\w+/,      // Number, space, then word
      isDocumentStart: false             // Not at document start
    }
  },
  whitespace: {
    before: '\n',
    after: ' '
  }
};

const contextWithPatternRule: USFMFormattingRule = {
  id: 'poetry-after-section',
  name: 'Poetry After Section',
  priority: 140,
  applies: {
    pattern: /^q\d*$/,                   // Any poetry marker
    context: {
      previousMarker: ['s1', 's2'],     // After section headers
      isDocumentStart: false
    }
  },
  whitespace: {
    before: '\n\n',  // Extra space after sections
    after: ' '
  }
};
```

## FormattingFunction Interface

For dynamic formatting that can't be expressed with static rules:

```typescript
import { FormattingFunction, FormattingContext } from '@usfm-tools/formatter';

// Custom formatting function
const dynamicVerseFormatter: FormattingFunction = (
  marker: string, 
  position: 'before' | 'after', 
  context: FormattingContext
): string => {
  if (marker !== 'v') return '';
  
  // Dynamic logic based on context
  if (context.ancestorMarkers?.includes('q1')) {
    // In poetry, verses get newlines
    return position === 'before' ? '\n' : ' ';
  }
  
  if (context.previousMarker === 'c') {
    // After chapter, verses get spaces
    return position === 'before' ? ' ' : ' ';
  }
  
  // Default verse formatting
  return position === 'before' ? '\n' : ' ';
};

// Rule using formatting function
const dynamicVerseRule: USFMFormattingRule = {
  id: 'dynamic-verse',
  name: 'Dynamic Verse Formatting',
  priority: 200,
  applies: { marker: 'v' },
  formattingFunction: dynamicVerseFormatter
};
```

### Advanced FormattingFunction Examples

```typescript
// Content-aware formatting
const contentAwareFormatter: FormattingFunction = (marker, position, context) => {
  if (marker === 'v' && context.contentPattern) {
    const content = context.contentPattern;
    
    // Very short verses get inline formatting
    if (content.length <= 10) {
      return position === 'before' ? ' ' : ' ';
    }
    
    // Long verses get block formatting
    if (content.length > 100) {
      return position === 'before' ? '\n\n' : '\n';
    }
  }
  
  return position === 'before' ? '\n' : ' ';
};

// Hierarchical formatting
const hierarchyFormatter: FormattingFunction = (marker, position, context) => {
  const depth = context.ancestorMarkers?.length || 0;
  
  if (position === 'before') {
    // More indentation for deeper nesting
    return '\n' + '  '.repeat(depth);
  }
  
  return ' ';
};

// Conditional formatting based on next marker
const nextMarkerFormatter: FormattingFunction = (marker, position, context) => {
  if (marker === 'p' && position === 'after') {
    // No space if next marker is verse
    if (context.nextMarker === 'v') {
      return '';
    }
    
    // Extra space if next marker is section
    if (context.nextMarker?.match(/^s\d*$/)) {
      return '\n';
    }
  }
  
  return ' ';
};
```

## Priority System and Rule Ordering

The priority system determines which rule applies when multiple rules match:

```typescript
const ruleSet: USFMFormattingRule[] = [
  // Highest priority: specific context overrides
  {
    id: 'verse-after-chapter-override',
    priority: 200,
    applies: { 
      marker: 'v', 
      context: { previousMarker: 'c' } 
    },
    whitespace: { before: ' ', after: ' ' }
  },
  
  // High priority: pattern with context
  {
    id: 'poetry-verse-pattern',
    priority: 150,
    applies: { 
      marker: 'v',
      context: { ancestorMarkers: ['q'] }
    },
    whitespace: { before: '\n', after: ' ' }
  },
  
  // Medium priority: general pattern
  {
    id: 'all-verses',
    priority: 100,
    applies: { marker: 'v' },
    whitespace: { before: '\n', after: ' ' }
  },
  
  // Low priority: fallback
  {
    id: 'default-character',
    priority: 50,
    applies: { pattern: /.*/ },  // Matches everything
    whitespace: { before: ' ', after: ' ' }
  }
];
```

## Real-World Examples

### Bible Translation Rules

```typescript
const bibleTranslationRules: USFMFormattingRule[] = [
  // Document structure
  {
    id: 'book-id',
    priority: 200,
    applies: { marker: 'id', context: { isDocumentStart: true } },
    whitespace: { before: '', after: ' ' }
  },
  
  // Chapter formatting
  {
    id: 'chapter-major-break',
    priority: 180,
    applies: { marker: 'c' },
    whitespace: { before: '\n\n', after: ' ' }
  },
  
  // Verse formatting with context
  {
    id: 'verse-after-chapter',
    priority: 170,
    applies: { marker: 'v', context: { previousMarker: 'c' } },
    whitespace: { before: ' ', after: ' ' }
  },
  {
    id: 'verse-in-poetry',
    priority: 160,
    applies: { marker: 'v', context: { ancestorMarkers: ['q'] } },
    whitespace: { before: '\n', after: ' ' }
  },
  {
    id: 'verse-default',
    priority: 100,
    applies: { marker: 'v' },
    whitespace: { before: '\n', after: ' ' }
  },
  
  // Poetry formatting
  {
    id: 'poetry-lines',
    priority: 90,
    applies: { pattern: /^q\d*$/ },
    whitespace: { before: '\n', after: ' ' }
  },
  
  // Paragraph formatting
  {
    id: 'paragraphs',
    priority: 80,
    applies: { marker: 'p' },
    whitespace: { before: '\n', after: '' }
  }
];
```

### Study Bible Rules

```typescript
const studyBibleRules: USFMFormattingRule[] = [
  // Section headers with extra spacing
  {
    id: 'major-sections',
    priority: 150,
    applies: { pattern: /^s1?$/ },
    whitespace: { before: '\n\n\n', after: '\n' }
  },
  
  // Footnotes with special handling
  {
    id: 'footnotes',
    priority: 140,
    applies: { pattern: /^f[entx]?$/ },
    whitespace: { before: '', after: ' ' }
  },
  
  // Cross-references
  {
    id: 'cross-refs',
    priority: 130,
    applies: { marker: 'x' },
    whitespace: { before: '', after: ' ' }
  },
  
  // Lists with proper indentation
  {
    id: 'list-items-level1',
    priority: 120,
    applies: { marker: 'li1' },
    whitespace: { before: '\n', after: ' ' }
  },
  {
    id: 'list-items-nested',
    priority: 110,
    applies: { pattern: /^li[2-9]$/ },
    whitespace: { before: '\n', after: '  ' }
  }
];
```

## Testing Your Rules

Always test your rules with sample USFM:

```typescript
import { USFMFormatter } from '@usfm-tools/formatter';
import { USFMParser } from '@usfm-tools/parser';

function testRules(rules: USFMFormattingRule[], testUSFM: string) {
  const parser = new USFMParser();
  const formatter = new USFMFormatter(rules);
  
  console.log('Input:', testUSFM);
  
  // Test rule matching
  const testContext = {
    previousMarker: 'c',
    isDocumentStart: false,
    hasContent: true
  };
  
  const beforeWhitespace = formatter.getMarkerWhitespace('v', 'before', testContext);
  const afterWhitespace = formatter.getMarkerWhitespace('v', 'after', testContext);
  
  console.log('Verse after chapter:');
  console.log('  Before:', JSON.stringify(beforeWhitespace));
  console.log('  After:', JSON.stringify(afterWhitespace));
}

// Test with sample USFM
const sampleUSFM = '\\id TIT\n\\c 1\n\\p\n\\v 1 Paul, a servant...';
testRules(bibleTranslationRules, sampleUSFM);
```

## Best Practices

1. **Start Simple**: Begin with basic rules, add complexity as needed
2. **Use Priorities Wisely**: Leave gaps (100, 150, 200) for future rules
3. **Test Context Conditions**: Verify your context logic with real USFM
4. **Document Your Rules**: Include clear names and descriptions
5. **Use Patterns Efficiently**: Prefer patterns over multiple similar rules
6. **Consider Performance**: More complex context conditions = slower matching
7. **Plan Your Hierarchy**: Design your ancestor marker tracking strategy

## Troubleshooting

Common issues and solutions:

- **Rules not applying**: Check priority order and context conditions
- **Wrong whitespace**: Verify context matching logic
- **Performance issues**: Simplify complex context conditions
- **Conflicts**: Use priority system to resolve rule conflicts

For more examples and integration patterns, see the [examples directory](../../../examples/). 