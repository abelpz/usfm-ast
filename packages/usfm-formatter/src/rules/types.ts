/**
 * Type definitions for USFM formatting rules system
 *
 * Re-exports formatting types from shared-types and adds MarkerType integration
 */

import { MarkerType } from '@usfm-tools/types';
import {
  WhitespaceType as BaseWhitespaceType,
  ExceptionContext as BaseExceptionContext,
  WhitespaceRule as BaseWhitespaceRule,
  ContentRule as BaseContentRule,
  MarkerMatcher as BaseMarkerMatcher,
  ExceptionRule as BaseExceptionRule,
  USFMFormattingRule as BaseUSFMFormattingRule,
} from '@usfm-tools/types';

// Re-export base types
export type WhitespaceType = BaseWhitespaceType;
export type ExceptionContext = BaseExceptionContext;
export type WhitespaceRule = BaseWhitespaceRule;
export type ContentRule = BaseContentRule;
export type ExceptionRule = BaseExceptionRule;

// Context condition for rule matching
export interface ContextCondition {
  previousMarker?: string | string[];
  nextMarker?: string | string[];
  ancestorMarkers?: string | string[];
  hasContent?: boolean;
  contentPattern?: RegExp;
}

// Enhanced MarkerMatcher with proper MarkerType and context
export interface MarkerMatcher extends Omit<BaseMarkerMatcher, 'type'> {
  type?: MarkerType;
  context?: ContextCondition;
}

// Simplified whitespace rule for easier use
export interface SimpleWhitespaceRule {
  before?: string; // Before marker: "text \marker"
  after?: string; // After marker: "\marker content"
  afterContent?: string; // After content, before closing: "\marker content \marker*"
  beforeContent?: string; // Before content, after marker: "\marker \content"
}

// Enhanced USFMFormattingRule with simpler whitespace syntax
export interface USFMFormattingRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  applies: MarkerMatcher;
  whitespace: SimpleWhitespaceRule;
  content?: ContentRule;
  exceptions?: ExceptionRule[];
}
