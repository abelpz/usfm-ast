# Simple USFM Normalization Without Adapters

For users who want to normalize USFM without adding the `@usfm-tools/adapters` dependency, this guide shows how to create a simple implementation using just the formatter rules and parser.

## Quick Setup

```bash
npm install @usfm-tools/formatter @usfm-tools/parser
```

## Basic Implementation

```typescript
import { USFMFormatter, coreUSFMFormattingRules } from '@usfm-tools/formatter';
import { USFMParser } from '@usfm-tools/parser';

function simpleNormalizeUSFM(usfm: string): string {
  try {
    // Parse into AST
    const parser = new USFMParser();
    const nodes = parser.load(usfm).parse().getNodes();
    
    // Create formatter
    const formatter = new USFMFormatter(coreUSFMFormattingRules);
    
    // Reconstruct with rules
    return reconstructWithRules(nodes, formatter);
  } catch (error) {
    console.warn('Normalization failed:', error);
    return usfm;
  }
}

function reconstructWithRules(nodes: any[], formatter: USFMFormatter): string {
  const result: string[] = [];
  let context = {
    isDocumentStart: true,
    previousMarker: null,
    ancestorMarkers: [] as string[]
  };
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nextNode = nodes[i + 1];
    
    // Build context for rule matching
    const formattingContext = {
      previousMarker: context.previousMarker,
      nextMarker: nextNode?.marker,
      ancestorMarkers: context.ancestorMarkers,
      isDocumentStart: context.isDocumentStart,
      hasContent: node.content && node.content.length > 0,
      contentPattern: getContentPattern(node)
    };
    
    // Get whitespace using new API
    const beforeWhitespace = formatter.getMarkerWhitespace(node.marker, 'before', formattingContext);
    const afterWhitespace = formatter.getMarkerWhitespace(node.marker, 'after', formattingContext);
    
    // Add spacing before marker
    if (beforeWhitespace && !context.isDocumentStart) {
      result.push(beforeWhitespace);
    }
    
    // Add marker
    result.push(`\\${node.marker}`);
    
    // Add spacing after marker
    if (afterWhitespace) {
      result.push(afterWhitespace);
    }
    
    // Add content
    if (node.content) {
      result.push(processContent(node.content));
    }
    
    // Update context
    updateContext(context, node);
  }
  
  return result.join('');
}

function getContentPattern(node: any): string | undefined {
  if (!node.content || node.content.length === 0) return undefined;
  
  // Get text content for pattern matching
  const textContent = node.content
    .filter((item: any) => item.type === 'text')
    .map((item: any) => item.content)
    .join('');
    
  return textContent;
}

function updateContext(context: any, node: any) {
  context.isDocumentStart = false;
  context.previousMarker = node.marker;
  
  // Update ancestor markers for hierarchy tracking
  if (node.type === 'paragraph') {
    // Reset or update ancestor chain based on marker type
    if (node.marker === 'p' || node.marker === 'm') {
      context.ancestorMarkers = ['p'];
    } else if (node.marker?.match(/^q\d*$/)) {
      context.ancestorMarkers = ['q'];
    } else if (node.marker?.match(/^li\d*$/)) {
      context.ancestorMarkers = ['li'];
    }
  }
}

function processContent(content: any[]): string {
  return content.map(item => {
    if (typeof item === 'string') return item;
    if (item.type === 'text') return item.content;
    if (item.marker) {
      // Handle nested markers
      let result = `\\${item.marker}`;
      if (item.content) {
        result += ` ${processContent(item.content)}`;
      }
      if (item.type === 'character') {
        result += `\\${item.marker}*`;
      }
      return result;
    }
    return '';
  }).join('');
}
```

## Usage Example

```typescript
// Simple usage
const input = '\\id TIT\r\n\\c  1\n\n\\p\n\\v 1   Text  here';
const normalized = simpleNormalizeUSFM(input);
console.log(normalized);
// Output: \id TIT\n\c 1\n\p\n\v 1 Text here
```

## Custom Rules Implementation

```typescript
import { USFMFormattingRule } from '@usfm-tools/formatter';

// Create custom rules with new simplified format
const customRules: USFMFormattingRule[] = [
  {
    id: 'verse-newlines',
    name: 'Verses on New Lines',
    priority: 100,
    applies: { marker: 'v' },
    whitespace: { before: '\n', after: ' ' }
  },
  {
    id: 'chapter-breaks',
    name: 'Chapter Breaks',
    priority: 90,
    applies: { marker: 'c' },
    whitespace: { before: '\n\n', after: '\n' }
  },
  {
    id: 'verse-after-chapter',
    name: 'Verse After Chapter Context',
    priority: 150,
    applies: { 
      marker: 'v',
      context: {
        previousMarker: 'c'
      }
    },
    whitespace: { before: ' ', after: ' ' }
  },
  {
    id: 'poetry-pattern',
    name: 'Poetry Lines',
    priority: 80,
    applies: { pattern: /^q\d*$/ },
    whitespace: { before: '\n', after: ' ' }
  }
];

// Use custom rules
function normalizeWithCustomRules(usfm: string): string {
  const parser = new USFMParser();
  const nodes = parser.load(usfm).parse().getNodes();
  const formatter = new USFMFormatter(customRules);
  
  return reconstructWithRules(nodes, formatter);
}
```

## Advanced Example with Context

```typescript
function advancedReconstruct(nodes: any[], formatter: USFMFormatter): string {
  const result: string[] = [];
  let context = {
    isDocumentStart: true,
    previousMarker: null,
    nextMarker: null,
    ancestorMarkers: [] as string[],
    inPoetry: false,
    inList: false
  };
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nextNode = nodes[i + 1];
    
    // Update context
    updateAdvancedContext(context, node, nextNode);
    
    // Create formatting context
    const formattingContext = {
      previousMarker: context.previousMarker,
      nextMarker: context.nextMarker,
      ancestorMarkers: [...context.ancestorMarkers],
      isDocumentStart: context.isDocumentStart,
      hasContent: node.content && node.content.length > 0,
      contentPattern: getContentForPatternMatching(node)
    };
    
    // Get whitespace from formatter
    const beforeWhitespace = formatter.getMarkerWhitespace(node.marker, 'before', formattingContext);
    const afterWhitespace = formatter.getMarkerWhitespace(node.marker, 'after', formattingContext);
    
    // Apply formatting
    if (beforeWhitespace && !context.isDocumentStart) {
      result.push(beforeWhitespace);
    }
    
    result.push(`\\${node.marker}`);
    
    if (afterWhitespace) {
      result.push(afterWhitespace);
    }
    
    // Process content with context awareness
    if (node.content) {
      result.push(processContentWithContext(node.content, context));
    }
    
    context.isDocumentStart = false;
    context.previousMarker = node.marker;
  }
  
  return result.join('');
}

function updateAdvancedContext(context: any, node: any, nextNode: any) {
  // Track poetry sections
  if (node.marker?.match(/^q\d*$/)) {
    context.inPoetry = true;
    context.ancestorMarkers = ['q'];
  } else if (node.marker === 'p' || node.marker === 'm') {
    context.inPoetry = false;
    context.ancestorMarkers = ['p'];
  }
  
  // Track list sections
  if (node.marker?.match(/^li\d*$/)) {
    context.inList = true;
    context.ancestorMarkers = ['li'];
  } else if (node.marker === 'p' || node.marker === 'm') {
    context.inList = false;
  }
  
  // Set next marker
  context.nextMarker = nextNode?.marker || null;
}

function getContentForPatternMatching(node: any): string | undefined {
  if (!node.content || node.content.length === 0) return undefined;
  
  // Extract text content for pattern matching
  const textContent = node.content
    .filter((item: any) => item.type === 'text')
    .map((item: any) => item.content)
    .join('')
    .trim();
    
  return textContent || undefined;
}

function processContentWithContext(content: any[], context: any): string {
  return content.map(item => {
    if (typeof item === 'string') return item;
    if (item.type === 'text') return item.content;
    if (item.marker) {
      // Handle nested markers with context
      let result = `\\${item.marker}`;
      
      if (item.content) {
        result += ` ${processContentWithContext(item.content, context)}`;
      }
      
      if (item.type === 'character') {
        result += `\\${item.marker}*`;
      }
      
      return result;
    }
    return '';
  }).join('');
}
```

## Context-Aware Custom Rules

```typescript
// Advanced rules using the new context system
const advancedContextRules: USFMFormattingRule[] = [
  {
    id: 'verse-after-multiple',
    name: 'Verse After Headers',
    priority: 140,
    applies: {
      marker: 'v',
      context: {
        previousMarker: ['c', 's1', 's2', 'mt1', 'mt2']
      }
    },
    whitespace: { before: '\n', after: ' ' }
  },
  {
    id: 'verse-in-poetry',
    name: 'Verse in Poetry',
    priority: 130,
    applies: {
      marker: 'v',
      context: {
        ancestorMarkers: ['q']
      }
    },
    whitespace: { before: '\n', after: ' ' }
  },
  {
    id: 'short-verses',
    name: 'Short Verse Content',
    priority: 120,
    applies: {
      marker: 'v',
      context: {
        hasContent: true,
        contentPattern: /^.{1,20}$/  // Very short verses
      }
    },
    whitespace: { before: ' ', after: ' ' }
  },
  {
    id: 'document-start-id',
    name: 'Document Start ID',
    priority: 200,
    applies: {
      marker: 'id',
      context: {
        isDocumentStart: true
      }
    },
    whitespace: { before: '', after: ' ' }
  }
];

// Use with the advanced reconstruction
function normalizeWithAdvancedRules(usfm: string): string {
  const parser = new USFMParser();
  const nodes = parser.load(usfm).parse().getNodes();
  const formatter = new USFMFormatter(advancedContextRules);
  
  return advancedReconstruct(nodes, formatter);
}
```

## Pattern-Based Rules

```typescript
// Rules using regular expressions for multiple markers
const patternBasedRules: USFMFormattingRule[] = [
  {
    id: 'all-poetry',
    name: 'All Poetry Markers',
    priority: 90,
    applies: { pattern: /^q\d*$/ },  // q, q1, q2, q3, etc.
    whitespace: { before: '\n', after: ' ' }
  },
  {
    id: 'all-lists',
    name: 'All List Markers',
    priority: 85,
    applies: { pattern: /^li\d*$/ },  // li, li1, li2, li3, etc.
    whitespace: { before: '\n', after: ' ' }
  },
  {
    id: 'all-sections',
    name: 'All Section Headers',
    priority: 80,
    applies: { pattern: /^s\d*$/ },  // s, s1, s2, s3, s4
    whitespace: { before: '\n\n', after: '\n' }
  },
  {
    id: 'all-titles',
    name: 'All Title Markers',
    priority: 75,
    applies: { pattern: /^mt\d*$/ },  // mt, mt1, mt2, mt3, etc.
    whitespace: { before: '\n\n', after: '\n' }
  }
];
```

## Limitations

This simple approach has limitations compared to the full `@usfm-tools/adapters` implementation:

1. **No comprehensive AST traversal** - May miss edge cases
2. **Limited context awareness** - Basic context tracking only  
3. **No validation** - Doesn't validate USFM structure
4. **Basic content handling** - May not handle all nested structures
5. **Manual context management** - You must implement context tracking

## When to Use Full Adapters

Consider using `@usfm-tools/adapters` if you need:

- Comprehensive USFM validation
- Complex nested marker handling
- Full AST traversal with visitor pattern
- Production-grade normalization
- Support for all USFM 3.1 features
- Automatic context management
- Advanced FormattingFunction support

## Migration Path

Start with this simple approach, then migrate to adapters when needed:

```typescript
// Simple approach
import { simpleNormalizeUSFM } from './simple-normalize';
const result = simpleNormalizeUSFM(usfm);

// Upgrade to adapters later
import { USFMVisitor } from '@usfm-tools/adapters';
import { USFMFormatter } from '@usfm-tools/formatter';
import { USFMParser } from '@usfm-tools/parser';

const parser = new USFMParser();
const ast = parser.load(usfm).parse();
const formatter = new USFMFormatter(rules);
const visitor = new USFMVisitor({ formatter });
const result = visitor.visit(ast);
```

This gives you flexibility to start simple and upgrade when your needs grow. 