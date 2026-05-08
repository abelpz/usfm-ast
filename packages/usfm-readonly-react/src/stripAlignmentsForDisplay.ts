/**
 * Read-only wrapper around `@usfm-tools/usj-core` {@link stripAlignments}.
 * Returns `{ usj, alignments }` so the rest of this package never deals with editor-centric return field names.
 */

import type { AlignmentMap, UsjDocument } from '@usfm-tools/usj-core';
import { stripAlignments } from '@usfm-tools/usj-core';

/** Input shape accepted by `@usfm-tools/usj-core` {@link stripAlignments}. */
export type StripAlignmentsInput = Parameters<typeof stripAlignments>[0];

export function stripAlignmentsForDisplay(doc: StripAlignmentsInput): {
  usj: UsjDocument;
  alignments: AlignmentMap;
} {
  const r = stripAlignments(doc);
  return { usj: r.editable as unknown as UsjDocument, alignments: r.alignments };
}
