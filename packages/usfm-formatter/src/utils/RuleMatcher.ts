/**
 * Rule matcher utility for USFM formatting rules
 */

import { MarkerType } from '@usfm-tools/types';
import {
  USFMFormattingRule,
  WhitespaceRule,
  ExceptionContext,
  ContextCondition,
} from '../rules/types';

/**
 * Rule matcher utility functions
 */
export class USFMFormattingRuleMatcher {
  constructor(private rules: USFMFormattingRule[]) {}

  /**
   * Find the highest priority rule that matches the given marker
   */
  findMatchingRule(
    marker: string,
    markerType?: MarkerType,
    role?: string,
    context?: {
      previousMarker?: string;
      nextMarker?: string;
      ancestorMarkers?: string[];
      hasContent?: boolean;
      content?: string;
    }
  ): USFMFormattingRule | null {
    const matchingRules = this.rules.filter((rule) =>
      this.ruleMatches(rule, marker, markerType, role, context)
    );

    if (matchingRules.length === 0) {
      return null;
    }

    // Return highest priority rule
    return matchingRules.reduce((highest, current) =>
      current.priority > highest.priority ? current : highest
    );
  }

  /**
   * Get whitespace string for a specific context
   */
  getWhitespaceString(
    marker: string,
    markerType?: MarkerType,
    position: 'before' | 'after' | 'afterContent' | 'beforeContent' = 'before',
    ruleContext?: {
      previousMarker?: string;
      nextMarker?: string;
      ancestorMarkers?: string[];
      hasContent?: boolean;
      content?: string;
    }
  ): string {
    const rule = this.findMatchingRule(marker, markerType, undefined, ruleContext);
    if (!rule) return position === 'before' ? ' ' : '';

    let whitespaceString: string | undefined;
    switch (position) {
      case 'before':
        whitespaceString = rule.whitespace.before;
        break;
      case 'after':
        whitespaceString = rule.whitespace.after;
        break;
      case 'afterContent':
        whitespaceString = rule.whitespace.afterContent;
        break;
      case 'beforeContent':
        whitespaceString = rule.whitespace.beforeContent;
        break;
    }

    return whitespaceString || '';
  }

  private ruleMatches(
    rule: USFMFormattingRule,
    marker: string,
    markerType?: MarkerType,
    role?: string,
    context?: {
      previousMarker?: string;
      nextMarker?: string;
      ancestorMarkers?: string[];
      hasContent?: boolean;
      content?: string;
    }
  ): boolean {
    const { applies } = rule;

    // Check marker type - if rule specifies a type, markerType must be provided and match
    if (applies.type && (!markerType || applies.type !== markerType)) {
      return false;
    }

    // Check specific marker
    if (applies.marker) {
      if (Array.isArray(applies.marker)) {
        if (!applies.marker.includes(marker)) return false;
      } else {
        if (applies.marker !== marker) return false;
      }
    }

    // Check pattern
    if (applies.pattern && !applies.pattern.test(marker)) {
      return false;
    }

    // Check role
    if (applies.role && role !== applies.role) {
      return false;
    }

    // Check context conditions
    if (applies.context && context) {
      return this.contextMatches(applies.context, context);
    }

    return true;
  }

  private contextMatches(
    ruleContext: ContextCondition,
    actualContext: {
      previousMarker?: string;
      nextMarker?: string;
      ancestorMarkers?: string[];
      hasContent?: boolean;
      content?: string;
    }
  ): boolean {
    // Check previous marker
    if (ruleContext.previousMarker) {
      if (Array.isArray(ruleContext.previousMarker)) {
        if (
          !actualContext.previousMarker ||
          !ruleContext.previousMarker.includes(actualContext.previousMarker)
        ) {
          return false;
        }
      } else {
        if (ruleContext.previousMarker !== actualContext.previousMarker) {
          return false;
        }
      }
    }

    // Check next marker
    if (ruleContext.nextMarker) {
      if (Array.isArray(ruleContext.nextMarker)) {
        if (
          !actualContext.nextMarker ||
          !ruleContext.nextMarker.includes(actualContext.nextMarker)
        ) {
          return false;
        }
      } else {
        if (ruleContext.nextMarker !== actualContext.nextMarker) {
          return false;
        }
      }
    }

    // Check ancestor markers
    if (ruleContext.ancestorMarkers && actualContext.ancestorMarkers) {
      const ancestorList = Array.isArray(ruleContext.ancestorMarkers)
        ? ruleContext.ancestorMarkers
        : [ruleContext.ancestorMarkers];

      const hasAnyAncestor = ancestorList.some((ancestor) =>
        actualContext.ancestorMarkers!.includes(ancestor)
      );

      if (!hasAnyAncestor) return false;
    }

    // Check has content
    if (ruleContext.hasContent !== undefined) {
      if (ruleContext.hasContent !== actualContext.hasContent) {
        return false;
      }
    }

    // Check content pattern
    if (ruleContext.contentPattern && actualContext.content) {
      if (!ruleContext.contentPattern.test(actualContext.content)) {
        return false;
      }
    }

    return true;
  }
}
