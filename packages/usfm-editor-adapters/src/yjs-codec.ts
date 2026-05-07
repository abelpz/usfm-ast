/**
 * yjs-codec — USFM ↔ Yjs CRDT codec and 3-way merge driver.
 *
 * Phase 4 schema (simple, roundtrip-safe):
 *   Y.Doc
 *     └── getText('usfm') → Y.Text  (full USFM document as a CRDT string)
 *
 * The `Y.Text` CRDT enables character-level concurrent editing.  Later
 * phases can introduce a paragraph/verse-level Y.Array structure; the
 * base64 encoding format is versioned via the Yjs update format (V2).
 *
 * Storage contract:
 *   ProjectStorage holds string values only.  `.ybin` files are stored
 *   as base64-encoded Yjs V2 state updates.
 *
 * Three-way merge strategy:
 *   Given base, ours, theirs as base64 Yjs states:
 *   1. Decode all three to Uint8Array.
 *   2. Load `base` into a fresh Y.Doc; capture its state vector.
 *   3. Compute ours-delta  = diffUpdateV2(ours,   baseStateVector).
 *   4. Compute theirs-delta = diffUpdateV2(theirs, baseStateVector).
 *   5. Apply both deltas to the merged doc.  Yjs CRDT semantics resolve
 *      concurrent changes deterministically (no conflict possible at
 *      the CRDT level — concurrent insertions are interleaved by clock).
 *   6. Re-encode as base64.
 */

import * as Y from 'yjs';

// ---------------------------------------------------------------------------
// Base64 ↔ Uint8Array (Node + browser)
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Codec: USFM ↔ base64 Yjs state
// ---------------------------------------------------------------------------

/** Encode a USFM string as a base64 Yjs V2 state (suitable for `.ybin` storage). */
export function usfmToYjsBase64(usfm: string): string {
  const doc = new Y.Doc();
  doc.getText('usfm').insert(0, usfm);
  const state = Y.encodeStateAsUpdateV2(doc);
  return uint8ToBase64(state);
}

/** Decode a base64 Yjs state back to a USFM string. */
export function yjsBase64ToUsfm(base64: string): string {
  const doc = new Y.Doc();
  Y.applyUpdateV2(doc, base64ToUint8(base64));
  return doc.getText('usfm').toString();
}

// ---------------------------------------------------------------------------
// 3-way CRDT merge
// ---------------------------------------------------------------------------

export type YjsMergeResult =
  | { kind: 'merged'; base64: string; usfm: string }
  | { kind: 'conflict'; reason: string };

/**
 * Three-way CRDT merge of three base64-encoded `.ybin` states.
 *
 * CRDTs cannot produce conflicts at the merge level — concurrent edits are
 * always resolved deterministically.  The only `'conflict'` outcome is when
 * one of the inputs is malformed (bad base64 or corrupt Yjs state).
 */
export function mergeYjsBase64ThreeWay(
  base: string,
  ours: string,
  theirs: string,
): YjsMergeResult {
  try {
    const baseBytes = base64ToUint8(base);
    const oursBytes = base64ToUint8(ours);
    const theirsBytes = base64ToUint8(theirs);

    // Build base doc and capture its state vector.
    const baseDoc = new Y.Doc();
    if (baseBytes.length > 0) {
      Y.applyUpdateV2(baseDoc, baseBytes);
    }
    const baseStateVector = Y.encodeStateVector(baseDoc);

    // Compute deltas: what's new in ours / theirs beyond base.
    const oursDelta = Y.diffUpdateV2(oursBytes, baseStateVector);
    const theirsDelta = Y.diffUpdateV2(theirsBytes, baseStateVector);

    // Merged doc = base + both deltas (CRDT commutative / idempotent).
    const mergedDoc = new Y.Doc();
    if (baseBytes.length > 0) {
      Y.applyUpdateV2(mergedDoc, baseBytes);
    }
    Y.applyUpdateV2(mergedDoc, oursDelta);
    Y.applyUpdateV2(mergedDoc, theirsDelta);

    const mergedState = Y.encodeStateAsUpdateV2(mergedDoc);
    const base64 = uint8ToBase64(mergedState);
    const usfm = mergedDoc.getText('usfm').toString();

    return { kind: 'merged', base64, usfm };
  } catch (err) {
    return {
      kind: 'conflict',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
