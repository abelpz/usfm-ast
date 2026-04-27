import type { UsjDocument } from '@usfm-tools/usj-core';
import { stripAlignments } from '@usfm-tools/usj-core';
import * as ParserNs from '@usfm-tools/parser';
import { cjsNamed } from './interop.js';

const USFMParser = cjsNamed<
  new (options?: { silentConsole?: boolean }) => {
    parse(input?: string): unknown;
    toJSON(): unknown;
  }
>(ParserNs, 'USFMParser');

export type ParseUsfmOptions = {
  /**
   * When true (default), strip USFM alignment milestones so the tree is easier to render as plain text.
   * Same approach as `UsfmChapterDiffView` in usfm-editor-app.
   */
  stripAlignment?: boolean;
};

/**
 * Parse USFM string to a USJ document suitable for {@link splitUsjByChapter} / {@link collectSegments}.
 */
export function parseUsfmToUsj(usfm: string, options?: ParseUsfmOptions): UsjDocument | null {
  const stripAlignment = options?.stripAlignment !== false;
  try {
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm?.trim() ? usfm : '\\id XXX\n');
    let doc = p.toJSON() as UsjDocument;
    if (stripAlignment) {
      const { editable } = stripAlignments(doc);
      doc = editable as unknown as UsjDocument;
    }
    return doc;
  } catch {
    return null;
  }
}
