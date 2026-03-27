/**
 * Core USFM formatting rules based on USFM 3.1 specification
 *
 * These rules strictly enforce the principles documented in USFM_FORMATTING_RULES_SIMPLE.md:
 * 1. Structural whitespace (first space after markers, all newlines) - ignored by parsers
 * 2. Semantic whitespace (all other spaces) - becomes rendered content
 * 3. Same-line content requirement for specific markers
 * 4. Conservative builder output with minimal structural whitespace
 */

import { MarkerTypeEnum } from '@usfm-tools/types';
import { USFMFormattingRule } from './types';
import {
  STRICT_SAME_LINE_CONTENT_MARKERS,
  FLEXIBLE_CONTENT_MARKERS,
  validateRuleCompliance,
  requiresSameLineContent,
} from './strict';

/**
 * Re-export strict markers for backward compatibility
 * These are imported from the strict rules module to ensure consistency
 */
const SAME_LINE_CONTENT_MARKERS = STRICT_SAME_LINE_CONTENT_MARKERS;

/**
 * Validates that all rules comply with strict USFM constraints
 * This function is called to ensure no rule violates fundamental USFM principles
 */
function validateAllRulesCompliance(rules: USFMFormattingRule[]): void {
  const violations: string[] = [];

  for (const rule of rules) {
    if (rule.applies.marker) {
      const markers = Array.isArray(rule.applies.marker)
        ? rule.applies.marker
        : [rule.applies.marker];

      for (const marker of markers) {
        const validation = validateRuleCompliance(marker, rule.whitespace);
        if (!validation.valid) {
          violations.push(
            `Rule '${rule.id}' for marker '${marker}': ${validation.violations.join(', ')}`
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`USFM Formatting Rules violate strict constraints:\n${violations.join('\n')}`);
  }
}

/**
 * Core USFM formatting rules based on strict principles
 *
 * ⚠️  CRITICAL: These rules enforce non-overridable USFM constraints.
 *     Any attempt to modify rules that violate strict constraints will throw an error.
 *
 * Users can only:
 * 1. Add newlines between markers and content (for flexible content markers only)
 * 2. Split text content across lines (preserving semantic whitespace)
 * 3. Prepend markers with single newlines
 * 4. Add extra semantic whitespace after the first structural space
 */
export const coreUSFMFormattingRules: USFMFormattingRule[] = [
  // === SAME-LINE CONTENT MARKERS (HIGHEST PRIORITY) ===

  // ID marker
  {
    id: 'id-marker',
    name: 'ID Marker',
    description: 'ID marker requires content on same line',
    priority: 200,
    applies: {
      marker: 'id',
    },
    whitespace: {
      before: '', // No whitespace before ID marker
      after: ' ', // Single space after marker
    },
  },

  // Chapter markers - newline before, space after, content on same line
  {
    id: 'chapter-marker',
    name: 'Chapter Marker',
    description: 'Chapter markers require content on same line',
    priority: 180,
    applies: { marker: 'c' },
    whitespace: {
      before: '\n', // Newline before chapter
      after: ' ', // Single space after marker
    },
  },

  // Verse markers - always require content on same line
  {
    id: 'verse-marker',
    name: 'Verse Marker',
    description: 'Verse markers require content on same line',
    priority: 170,
    applies: { marker: 'v' },
    whitespace: {
      before: ' ', // Space before verse (default)
      after: ' ', // Single space after marker
    },
  },

  // Verse after chapter - no space before (chapter already provides space)
  {
    id: 'verse-after-chapter',
    name: 'Verse After Chapter',
    description: 'Verse immediately after chapter marker',
    priority: 175,
    applies: {
      marker: 'v',
      context: { previousMarker: 'c' },
    },
    whitespace: {
      before: '', // No space before (chapter already has space after)
      after: ' ', // Single space after marker
    },
  },

  // Verse markers always on new line
  {
    id: 'verse-newline',
    name: 'Verse on New Line',
    description: 'Verse markers always start on a new line',
    priority: 165,
    applies: {
      marker: 'v',
    },
    whitespace: {
      before: '\n', // Newline before verse
      after: ' ', // Single space after marker
    },
  },

  // All other same-line content markers - NO newline before content allowed
  ...SAME_LINE_CONTENT_MARKERS.filter((m) => !['id', 'c', 'v'].includes(m)).map(
    (marker, index) => ({
      id: `same-line-${marker}`,
      name: `Same-line Content: ${marker}`,
      description: `${marker} marker requires content on same line`,
      priority: 160 - index, // Decreasing priority
      applies: { marker },
      whitespace: {
        before: '\n', // Newline before marker (structural)
        after: ' ', // Single space after marker (structural, content follows immediately)
      },
    })
  ),

  // === PARAGRAPH MARKERS ===

  // Paragraph markers - general rule (can have content on new line)
  {
    id: 'paragraph-standard',
    name: 'Standard Paragraph',
    description: 'Paragraph markers with conservative spacing',
    priority: 100,
    applies: { type: MarkerTypeEnum.PARAGRAPH },
    whitespace: {
      before: '\n', // Newline before paragraph
      after: ' ', // Space after paragraph marker
    },
  },

  // Paragraph markers followed by verse - no space after
  {
    id: 'paragraph-before-verse',
    name: 'Paragraph Before Verse',
    description: 'Paragraph markers followed by verse have no space after',
    priority: 140,
    applies: {
      type: MarkerTypeEnum.PARAGRAPH,
      context: { nextMarker: 'v' },
    },
    whitespace: {
      before: '\n', // Newline before paragraph
      after: '', // No space after when followed by verse
    },
  },

  // === CHARACTER MARKERS ===

  // Character markers - conservative spacing
  {
    id: 'character-marker',
    name: 'Character Marker',
    description: 'Character markers with minimal spacing',
    priority: 90,
    applies: { type: MarkerTypeEnum.CHARACTER },
    whitespace: {
      before: ' ', // Space before character marker
      after: ' ', // Space after opening marker (required for content separation)
    },
  },

  // === NOTE MARKERS ===

  // Note markers - attach to preceding text
  {
    id: 'note-marker',
    name: 'Note Marker',
    description: 'Note markers attach to preceding text',
    priority: 95,
    applies: { type: MarkerTypeEnum.NOTE },
    whitespace: {
      before: '', // No space before note markers
      after: ' ', // Space after for note content
    },
  },

  // === MILESTONE MARKERS ===

  // Milestone markers - minimal spacing
  {
    id: 'milestone-marker',
    name: 'Milestone Marker',
    description: 'Milestone markers with minimal spacing',
    priority: 85,
    applies: { type: MarkerTypeEnum.MILESTONE },
    whitespace: {
      before: ' ', // Space before milestone
      after: '', // No space after milestone
    },
  },

  // === POETRY AND LIST MARKERS ===

  // Poetry markers (can have content on new line)
  {
    id: 'poetry-marker',
    name: 'Poetry Marker',
    description: 'Poetry markers on new lines',
    priority: 110,
    applies: { pattern: /^q\d*$/, type: MarkerTypeEnum.PARAGRAPH },
    whitespace: {
      before: '\n', // Newline before poetry
      after: ' ', // Space after for content
    },
  },

  // List markers (can have content on new line)
  {
    id: 'list-marker',
    name: 'List Marker',
    description: 'List markers on new lines',
    priority: 105,
    applies: { pattern: /^li\d*$/, type: MarkerTypeEnum.PARAGRAPH },
    whitespace: {
      before: '\n', // Newline before list item
      after: ' ', // Space after for content
    },
  },
];

// Validate that all rules comply with strict constraints
// This will throw an error if any rule violates fundamental USFM principles
validateAllRulesCompliance(coreUSFMFormattingRules);

/**
 * Export strict validation functions for external use
 */
export {
  validateRuleCompliance,
  requiresSameLineContent,
  STRICT_SAME_LINE_CONTENT_MARKERS,
  FLEXIBLE_CONTENT_MARKERS,
} from './strict';
