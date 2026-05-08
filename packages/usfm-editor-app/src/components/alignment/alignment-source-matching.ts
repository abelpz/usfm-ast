import type { SourceTextSession } from '@usfm-tools/editor';
import type { UsjDocument } from '@usfm-tools/editor-core';
import { alignmentDocumentSourceKey, parseDocumentIdentityFromUsj } from '@usfm-tools/editor-core';
import type { AlignmentDocument } from '@usfm-tools/types';

/** Reference slot from the reference column (for alignment source pick / auto-pick). */
export type SourceSlotSnapshot = {
  id: string;
  /** Short code identifier, e.g. "ult" or "glt" (from catalog abbreviation). */
  label: string;
  /** Human-readable title from the catalog, e.g. "unfoldingWord Literal Translation". */
  title?: string;
  session: SourceTextSession | null;
};

/** Derive a comparable key from USJ \id (same idea as `alignmentDocumentSourceKey`). */
export function sourceKeyFromUsj(usj: UsjDocument): string {
  return parseDocumentIdentityFromUsj(usj) ?? 'unknown';
}

/** Find a layer whose `source.id` matches the given source key (prefix-style compat). */
export function matchLayerKey(layers: AlignmentDocument[], sourceKey: string): string | null {
  for (const doc of layers) {
    const layerKey = alignmentDocumentSourceKey(doc);
    const srcId = doc.source.id.toLowerCase();
    const sk = sourceKey.toLowerCase();
    if (layerKey.toLowerCase() === sk || srcId === sk || sk.includes(srcId) || srcId.includes(sk)) {
      return layerKey;
    }
  }
  return null;
}

/** “Best match” to embedded `\rem alignment-source` (same as picker). */
export function isBestMatchToExpected(srcKey: string, expectedAlignmentKey: string | null): boolean {
  if (expectedAlignmentKey === null) return false;
  return (
    srcKey.toLowerCase().includes(expectedAlignmentKey.toLowerCase()) ||
    expectedAlignmentKey.toLowerCase().includes(srcKey.toLowerCase())
  );
}

export type AutoPickResult =
  | { kind: 'existing'; layerKey: string; usj: UsjDocument }
  | { kind: 'new'; usj: UsjDocument };

/**
 * Auto-select when unambiguous: single loaded reference, or exactly one “best match”
 * to `getExpectedAlignmentKey` among several loaded references.
 */
export function tryAutoPickAlignmentSource(
  sourceSlots: ReadonlyArray<SourceSlotSnapshot>,
  existingLayers: AlignmentDocument[],
  expectedAlignmentKey: string | null,
): AutoPickResult | null {
  const loaded = sourceSlots.filter((s) => s.session?.isLoaded());
  if (loaded.length === 0) return null;

  const decide = (slot: SourceSlotSnapshot) => {
    const usj = slot.session!.store.getFullUSJ() as UsjDocument;
    const sk = sourceKeyFromUsj(usj);
    const layerKey = matchLayerKey(existingLayers, sk);
    if (layerKey) return { kind: 'existing' as const, layerKey, usj };
    return { kind: 'new' as const, usj };
  };

  if (loaded.length === 1) {
    return decide(loaded[0]!);
  }

  const best = loaded.filter((s) => {
    const usj = s.session!.store.getFullUSJ() as UsjDocument;
    return isBestMatchToExpected(sourceKeyFromUsj(usj), expectedAlignmentKey);
  });
  if (best.length === 1) {
    return decide(best[0]!);
  }
  return null;
}
