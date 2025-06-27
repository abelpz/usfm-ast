# Rules-Based USFM Normalization System

## Overview

The rules-based normalization system provides a flexible, configurable approach to formatting USFM (Unified Standard Format Markers) text. Unlike simple whitespace normalization, this system applies context-aware formatting rules based on marker types, relationships, and document structure.

## Architecture

### Core Components

1. **USFMFormattingRules** - Defines formatting rules with priorities and contexts
2. **USFMFormatter** - Applies rules to generate appropriate whitespace
3. **USFMVisitor** - Traverses the AST and applies formatting during conversion
4. **Normalization Functions** - High-level API for easy usage

### Key Features

- **Context-aware formatting** - Rules consider marker relationships and document position
- **Priority-based rule system** - Higher priority rules override lower ones
- **Exception handling** - Special contexts can override standard rules
- **Smart whitespace handling** - Prevents double spaces and improper line endings
- **Configurable rule sets** - Custom rules can be provided for organization-specific formatting

## How It Works

### 1. Rule Definition

Rules are defined using the `USFMFormattingRule` interface:

```typescript
interface USFMFormattingRule {
  id: string;                    // Unique identifier
  priority: number;              // Higher numbers = higher priority
  markerType?: MarkerType;       // 'paragraph', 'character', 'note', 'milestone'
  marker?: string;               // Specific marker (e.g., 'v', 'p', 'f')
  pattern?: RegExp;              // Pattern matching for dynamic markers
  before: string;                // Whitespace before the marker
  after: string;                 // Whitespace after the marker
  exceptions?: ExceptionContext[]; // Contexts where rule doesn't apply
}
```

### 2. Rule Application Process

1. **Parse USFM** → AST structure
2. **Traverse AST** → Visit each node with USFMVisitor
3. **Apply Rules** → For each marker, find matching rules
4. **Generate Whitespace** → Apply highest priority rule
5. **Smart Cleanup** → Remove double spaces and fix line endings

### 3. Context Determination

The system considers several contexts when applying rules:

- **Document start** - Beginning of the document
- **Paragraph with verse** - Paragraphs containing verse markers
- **Within note** - Content inside footnotes/cross-references
- **After milestone** - Following alignment or other milestone markers

## Usage Examples

### Basic Usage

```typescript
import { normalizeUSFM } from '@usfm/parser';

// Use default core rules
const normalized = normalizeUSFM(usfmText);

// Use custom rules
const customRules = [
  {
    id: 'custom-verse-spacing',
    priority: 100,
    marker: 'v',
    before: '\n',
    after: ' ',
  }
];

const normalizedWithCustom = normalizeUSFM(usfmText, undefined, customRules);
```

### Advanced Usage with Custom Rules

```typescript
import { 
  normalizeUSFM, 
  USFMFormattingRule, 
  coreUSFMFormattingRules 
} from '@usfm/parser';

// Organization-specific rules
const organizationRules: USFMFormattingRule[] = [
  {
    id: 'org-chapter-spacing',
    priority: 90,
    marker: 'c',
    before: '\n\n',  // Double newline before chapters
    after: '\n',
  },
  {
    id: 'org-section-spacing', 
    priority: 85,
    markerType: 'paragraph',
    pattern: /^s\d*$/,  // Section headers (s, s1, s2, etc.)
    before: '\n\n',
    after: '\n',
  },
  {
    id: 'org-footnote-spacing',
    priority: 80,
    marker: 'f',
    before: '',  // No space before footnotes
    after: ' ',
    exceptions: ['document-start'],
  }
];

// Combine with core rules (organization rules take priority)
const allRules = [...organizationRules, ...coreUSFMFormattingRules];
const normalized = normalizeUSFM(usfmText, undefined, allRules);
```

### Using the Visitor Directly

```typescript
import { USFMParser, USFMVisitor, coreUSFMFormattingRules } from '@usfm/parser';

// Parse USFM
const parser = new USFMParser();
const nodes = parser.load(usfmText).parse().getNodes();

// Create visitor with custom options
const visitor = new USFMVisitor({
  formattingRules: coreUSFMFormattingRules,
  normalizeLineEndings: true,
  preserveWhitespace: false,
  isDocumentStart: true,
});

// Apply visitor to get normalized USFM
let normalized = '';
nodes.forEach(node => {
  node.accept(visitor);
});
normalized = visitor.getResult();
```

## Creating Custom Rule Sets

### Translation-Specific Rules

```typescript
// Rules for a specific Bible translation
const translationRules: USFMFormattingRule[] = [
  {
    id: 'translation-poetry',
    priority: 95,
    markerType: 'paragraph',
    pattern: /^q\d*$/,  // Poetry lines (q, q1, q2, etc.)
    before: '\n',
    after: '\n',
  },
  {
    id: 'translation-list',
    priority: 90,
    markerType: 'paragraph', 
    pattern: /^li\d*$/,  // List items
    before: '\n',
    after: ' ',
  }
];
```

### Context-Aware Rules

```typescript
const contextRules: USFMFormattingRule[] = [
  {
    id: 'verse-in-paragraph',
    priority: 100,
    marker: 'v',
    before: '\n',
    after: ' ',
    exceptions: ['document-start', 'paragraph-with-verse'],
  },
  {
    id: 'verse-continuation',
    priority: 95,
    marker: 'v',
    before: ' ',
    after: ' ',
    // Only applies in paragraph-with-verse context
  }
];
```

## Reusing in Other Scripts

### Standalone Normalization Script

```typescript
#!/usr/bin/env node
// normalize-usfm.ts

import fs from 'fs';
import path from 'path';
import { normalizeUSFM, USFMFormattingRule } from '@usfm/parser';

// Custom rules for your project
const projectRules: USFMFormattingRule[] = [
  // Define your rules here
];

async function normalizeFiles(inputDir: string, outputDir: string) {
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.usfm'));
  
  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);
    
    const usfmContent = fs.readFileSync(inputPath, 'utf8');
    const normalized = normalizeUSFM(usfmContent, undefined, projectRules);
    
    fs.writeFileSync(outputPath, normalized, 'utf8');
    console.log(`Normalized: ${file}`);
  }
}

// Usage: node normalize-usfm.js input/ output/
const [inputDir, outputDir] = process.argv.slice(2);
normalizeFiles(inputDir, outputDir);
```

### Batch Processing Script

```typescript
// batch-normalize.ts
import { normalizeUSFM, coreUSFMFormattingRules } from '@usfm/parser';
import { glob } from 'glob';
import fs from 'fs/promises';

interface NormalizationOptions {
  rules?: USFMFormattingRule[];
  preserveOriginal?: boolean;
  outputSuffix?: string;
}

export async function batchNormalize(
  pattern: string, 
  options: NormalizationOptions = {}
) {
  const {
    rules = coreUSFMFormattingRules,
    preserveOriginal = true,
    outputSuffix = '.normalized'
  } = options;

  const files = await glob(pattern);
  const results = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const normalized = normalizeUSFM(content, undefined, rules);
      
      const outputPath = preserveOriginal 
        ? file.replace(/\.usfm$/, `${outputSuffix}.usfm`)
        : file;
        
      await fs.writeFile(outputPath, normalized, 'utf8');
      
      results.push({ file, success: true });
      console.log(`✓ Normalized: ${file}`);
    } catch (error) {
      results.push({ file, success: false, error });
      console.error(`✗ Failed: ${file}`, error);
    }
  }

  return results;
}

// Usage
batchNormalize('**/*.usfm', {
  rules: myCustomRules,
  preserveOriginal: true,
});
```

### Integration with Build Tools

```typescript
// webpack-plugin.ts
export class USFMNormalizationPlugin {
  constructor(private rules: USFMFormattingRule[]) {}

  apply(compiler: any) {
    compiler.hooks.emit.tapAsync('USFMNormalizationPlugin', (compilation: any, callback: any) => {
      Object.keys(compilation.assets).forEach(filename => {
        if (filename.endsWith('.usfm')) {
          const asset = compilation.assets[filename];
          const source = asset.source();
          const normalized = normalizeUSFM(source, undefined, this.rules);
          
          compilation.assets[filename] = {
            source: () => normalized,
            size: () => normalized.length
          };
        }
      });
      callback();
    });
  }
}
```

## Rule Priority System

Rules are applied based on priority (higher numbers = higher priority):

1. **Custom/Organization Rules** (90-100) - Highest priority
2. **Translation-Specific Rules** (80-89) - High priority  
3. **Core USFM Rules** (1-79) - Standard priority
4. **Default Fallback** (0) - Lowest priority

### Priority Guidelines

- **100+**: Critical organization requirements
- **90-99**: Organization standards
- **80-89**: Translation-specific formatting
- **70-79**: Language-specific rules
- **60-69**: Regional preferences
- **50-59**: Tool-specific requirements
- **1-49**: Core USFM standards
- **0**: Default fallback

## Best Practices

### 1. Rule Design

- **Use specific markers** when possible instead of patterns
- **Keep priorities logical** - more specific rules should have higher priority
- **Document exceptions** clearly in rule comments
- **Test rule interactions** to avoid conflicts

### 2. Performance

- **Limit rule count** - Too many rules can slow processing
- **Use efficient patterns** - Complex regex can impact performance
- **Cache rule results** when processing multiple files

### 3. Maintenance

- **Version your rule sets** to track changes
- **Test thoroughly** with real USFM content
- **Document custom rules** for team members
- **Validate output** against USFM standards

## Error Handling

The system includes robust error handling:

```typescript
try {
  const normalized = normalizeUSFM(usfmText, undefined, customRules);
} catch (error) {
  if (error.message.includes('infinite loop')) {
    console.error('Parser stuck in infinite loop - check USFM syntax');
  } else if (error.message.includes('unknown marker')) {
    console.warn('Unknown marker found - consider adding to custom markers');
  } else {
    console.error('Normalization failed:', error);
  }
}
```

## Testing Your Rules

```typescript
// test-rules.ts
import { normalizeUSFM } from '@usfm/parser';

function testRules(rules: USFMFormattingRule[]) {
  const testCases = [
    '\\id GEN Test',
    '\\c 1\\p\\v 1 In the beginning...',
    '\\p Text with \\w word\\w* markers.',
    '\\f + \\ft Footnote text\\f*',
  ];

  testCases.forEach((test, i) => {
    console.log(`Test ${i + 1}:`);
    console.log('Input: ', JSON.stringify(test));
    console.log('Output:', JSON.stringify(normalizeUSFM(test, undefined, rules)));
    console.log('---');
  });
}
```

This rules-based system provides a powerful, flexible foundation for USFM normalization that can be adapted to any organization's specific formatting requirements while maintaining consistency and correctness. 