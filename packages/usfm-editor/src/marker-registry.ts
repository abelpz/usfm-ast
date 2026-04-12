import type { EditorState } from 'prosemirror-state';

import type { EditorSection, MarkerChoice, StructuralInsertionOptions } from './marker-context';
import {
  canInsertChapterMarkerInSection,
  canInsertVerseInSection,
  getEditorSectionAtPos,
  getMarkerChoicesForMode,
  getStructuralInsertions,
  getValidParagraphMarkers as listValidParagraphMarkers,
} from './marker-context';

/**
 * Pluggable marker palette and structure rules (custom modes, project-specific markers).
 */
export interface MarkerRegistry {
  getChoicesForMode(section: EditorSection, mode: string): MarkerChoice[];
  getValidParagraphMarkers(section: EditorSection): MarkerChoice[];
  canInsertVerse(section: EditorSection): boolean;
  canInsertChapter(section: EditorSection): boolean;
  getStructuralInsertions(state: EditorState, pos: number): StructuralInsertionOptions;
  getSectionAtPos(state: EditorState, pos: number): EditorSection;
}

/** Default: {@link marker-context} tables and built-in modes (`basic` / `medium` / `advanced`). */
export class DefaultMarkerRegistry implements MarkerRegistry {
  getChoicesForMode(section: EditorSection, mode: string): MarkerChoice[] {
    return getMarkerChoicesForMode(section, mode);
  }

  getValidParagraphMarkers(section: EditorSection): MarkerChoice[] {
    return listValidParagraphMarkers(section);
  }

  canInsertVerse(section: EditorSection): boolean {
    return canInsertVerseInSection(section);
  }

  canInsertChapter(section: EditorSection): boolean {
    return canInsertChapterMarkerInSection(section);
  }

  getStructuralInsertions(state: EditorState, pos: number): StructuralInsertionOptions {
    return getStructuralInsertions(state, pos);
  }

  getSectionAtPos(state: EditorState, pos: number): EditorSection {
    return getEditorSectionAtPos(state, pos);
  }
}
