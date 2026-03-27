# @usfm-tools/types

Shared TypeScript types and interfaces for USFM and USJ systems.

## Overview

This package provides the core type definitions used across the USFM/USJ monorepo:

- **USFM Types**: Node interfaces, visitor patterns, and type guards for USFM AST
- **USJ Types**: Complete type definitions for USJ (Unified Scripture JSON) format
- **Shared Types**: Common interfaces and utilities used by both systems

## Installation

```bash
npm install @usfm-tools/types
```

## Usage

### USFM Types

```typescript
import { 
  USFMNode, 
  ParagraphNode, 
  CharacterNode,
  BaseUSFMVisitor,
  isParagraphNode 
} from '@usfm-tools/types';

// Type-safe node handling
function processNode(node: USFMNode) {
  if (isParagraphNode(node)) {
    // node is now typed as ParagraphNode
    console.log(`Paragraph marker: ${node.marker}`);
  }
}
```

### USJ Types

```typescript
import { 
  UsjDocument, 
  UsjNode, 
  UsjPara,
  UsjTypes 
} from '@usfm-tools/types';

// Type-safe USJ document handling
function processUSJ(doc: UsjDocument) {
  doc.content.forEach(node => {
    if (node.type === UsjTypes.structural.para) {
      // node is typed as UsjPara
      console.log(`Paragraph: ${node.marker}`);
    }
  });
}
```

### Shared Types

```typescript
import { 
  BookCode, 
  ChapterNumber, 
  MilestoneAttributes,
  BaseVisitor 
} from '@usfm-tools/types';

// Common types for both systems
const bookCode: BookCode = 'GEN';
const chapter: ChapterNumber = '1';
```

## Type Categories

### USFM Types
- Node interfaces (`USFMNode`, `ParagraphNode`, etc.)
- Visitor patterns (`BaseUSFMVisitor`, `USFMVisitorWithContext`)
- Type guards (`isParagraphNode`, `isCharacterNode`, etc.)
- Hydrated nodes with methods

### USJ Types
- Document structure (`UsjDocument`, `UsjNode`)
- Structural nodes (`UsjBook`, `UsjChapter`, `UsjPara`, etc.)
- Inline nodes (`UsjChar`, `UsjVerse`, `UsjNote`, etc.)
- Type constants and utilities

### Shared Types
- Common string types (`BookCode`, `MarkerString`, etc.)
- Attribute interfaces (`MilestoneAttributes`, `LinkAttributes`)
- Base visitor interfaces
- Alignment and formatting types

## License

MIT
