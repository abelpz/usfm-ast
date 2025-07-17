/**
 * Declarative Containment Rules for USFM Structure
 *
 * This file defines how different USFM markers can contain other markers,
 * creating the proper hierarchical structure in the parsed output.
 */

import { ContainmentRule, UsfmContextType, USFMMarkerInfo } from './types';

/**
 * Default containment rules by marker type
 */
const DEFAULT_TYPE_RULES: Record<string, ContainmentRule> = {
  // Paragraph containers
  paragraph: {
    canContain: ['character', 'milestone'],
    canContainMarkers: ['v', 'c'], // verses and chapters can go in paragraphs
    canContainText: true,
    autoCloseOn: {
      markerTypes: ['paragraph'], // New paragraph closes current paragraph
    },
    specialBehaviors: ['merge-consecutive-text', 'normalize-whitespace'],
  },

  // Character containers
  character: {
    canContain: ['character'], // Characters can nest
    cannotContain: ['paragraph'], // But not paragraphs
    cannotContainMarkers: ['v', 'c'], // But not verses or chapters
    canContainText: true,
    specialBehaviors: ['require-explicit-close', 'preserve-whitespace'],
  },

  // Note containers (special case)
  note: {
    canContain: ['character'],
    canContainMarkers: ['fp'], // Special note paragraph
    canContainText: true,
    specialBehaviors: ['require-explicit-close'],
  },

  // Milestone markers (position markers, not containers)
  milestone: {
    canContainText: false, // Milestones don't contain text
    canContain: [], // Milestones don't contain other markers
    specialBehaviors: [], // Self-closing, no special behaviors needed
  },
};

/**
 * Specific containment rules for individual markers
 */
const MARKER_SPECIFIC_RULES: Record<string, ContainmentRule> = {
  // Verses (self-contained, don't contain other content)
  v: {
    canContainText: false, // Verses are position markers, not containers
    canContain: [], // Verses don't contain other markers
    specialBehaviors: [],
  },

  // Chapters (self-contained)
  c: {
    canContainText: false,
    canContain: [], // Chapters don't contain other markers
    specialBehaviors: [],
  },

  // Special footnote paragraph (only allowed in notes)
  fp: {
    canContain: ['character'],
    autoCloseOn: {
      markers: ['fp'],
      contexts: ['NoteContent'],
    },
    canContainText: true,
    specialBehaviors: ['merge-consecutive-text'],
  },
};

/**
 * Context-based containment rules
 */
const CONTEXT_RULES: Partial<Record<UsfmContextType, ContainmentRule>> = {
  NoteContent: {
    canContainText: true,
    canContain: ['character'], // Note content can contain character markers
    autoCloseOn: {
      contexts: ['NoteContent'], // Auto-close when another NoteContent marker opens
    },
    specialBehaviors: ['implicit-close-on-same-context'],
  },
};

/**
 * Complete containment rule set
 */
export const CONTAINMENT_RULES = {
  byType: DEFAULT_TYPE_RULES,
  byMarker: MARKER_SPECIFIC_RULES,
  byContext: CONTEXT_RULES,
};

/**
 * Get containment rules for a specific marker
 */
export function getContainmentRules(marker: string, markerInfo?: USFMMarkerInfo): ContainmentRule {
  // Check for marker-specific rules first
  if (CONTAINMENT_RULES.byMarker[marker]) {
    return CONTAINMENT_RULES.byMarker[marker];
  }

  // Check for context-based rules
  if (markerInfo?.context) {
    for (const context of markerInfo.context) {
      const contextRule = CONTAINMENT_RULES.byContext[context as UsfmContextType];
      if (contextRule) {
        return contextRule;
      }
    }
  }

  // Fall back to type-based rules
  if (markerInfo?.type && CONTAINMENT_RULES.byType[markerInfo.type]) {
    return CONTAINMENT_RULES.byType[markerInfo.type];
  }

  // Default: no containment
  return {
    canContainText: false,
    specialBehaviors: [],
  };
}

/**
 * Check if a container can contain a specific marker
 */
export function canContainMarker(
  containerRules: ContainmentRule,
  targetMarker: string,
  targetMarkerInfo?: USFMMarkerInfo
): boolean {
  // Check explicit marker allowlist
  if (containerRules.canContainMarkers?.includes(targetMarker)) {
    return true;
  }

  // Check explicit marker blocklist
  if (containerRules.cannotContainMarkers?.includes(targetMarker)) {
    return false;
  }

  // Check type-based rules
  if (targetMarkerInfo?.type) {
    if (containerRules.cannotContain?.includes(targetMarkerInfo.type)) {
      return false;
    }
    if (containerRules.canContain?.includes(targetMarkerInfo.type)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a container should auto-close for a given marker
 */
export function shouldAutoClose(
  containerRules: ContainmentRule,
  triggerMarker: string,
  triggerMarkerInfo?: USFMMarkerInfo
): boolean {
  if (!containerRules.autoCloseOn) {
    return false;
  }

  // Check specific markers
  if (containerRules.autoCloseOn.markers?.includes(triggerMarker)) {
    return true;
  }

  // Check marker types
  if (
    triggerMarkerInfo?.type &&
    containerRules.autoCloseOn.markerTypes?.includes(triggerMarkerInfo.type)
  ) {
    return true;
  }

  // Check contexts
  if (triggerMarkerInfo?.context && containerRules.autoCloseOn.contexts) {
    return triggerMarkerInfo.context.some((ctx: string) =>
      containerRules.autoCloseOn!.contexts!.includes(ctx as UsfmContextType)
    );
  }

  return false;
}
