/**
 * Per-file three-way merge for local project sync.
 *
 * Merge strategy (Phase 6 — CRDT-first):
 *   1. USFM files: if companion `.ybin` (Yjs state) exists for all three
 *      revisions, the CRDT 3-way merge is used — always deterministic, never
 *      conflicts.  OT (`transformOpLists`) is the fallback when CRDT history
 *      is absent or corrupted (e.g. files from before Phase 4 deployment).
 *   2. `.ybin` files: always merged via `mergeYjsBase64ThreeWay`.
 *   3. Everything else: journal JSONL, YAML manifest, JSON, binary (unchanged).
 */

import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import { USFMParser } from '@usfm-tools/parser';
import {
  DocumentStore,
  diffUsjDocuments,
  filterResolvableConflicts,
  transformOpLists,
  type ChapterConflict,
  type Operation,
  type UsjDocument,
} from '@usfm-tools/editor-core';
import type { FileConflict } from '@usfm-tools/types';
import { mergeJournalJsonlThreeWay } from './storage/journal-jsonl';
import { affectedChaptersFromUsfm } from './usfm-chapter-affect';
import { isYbinPath, crdtPathFromUsfm } from './crdt-paths';
import { mergeYjsBase64ThreeWay } from './yjs-codec';
import * as jsYaml from 'js-yaml';

function parseUsj(usfm: string): UsjDocument {
  const p = new USFMParser({ silentConsole: true });
  p.parse(usfm || '\\id XXX\n');
  return p.toJSON() as UsjDocument;
}

function opRoughChapter(op: Operation): number | null {
  if (op.type === 'moveNode') return op.from.chapter;
  if (
    op.type === 'insertNode' ||
    op.type === 'removeNode' ||
    op.type === 'replaceNode' ||
    op.type === 'setText' ||
    op.type === 'setAttr'
  ) {
    return op.path.chapter;
  }
  // Unknown op type — do not infer chapter 0 (intro) as a false positive.
  return null;
}

export type MergeUsfmResult =
  | { kind: 'merged'; text: string }
  | {
      kind: 'conflict';
      conflicts: ChapterConflict[];
      baseText: string;
      oursText: string;
      theirsText: string;
    };

/**
 * Three-way merge of one USFM file using OT (`transformOpLists`).
 * When edits overlap in the same chapter/paragraph range, returns `conflict` for UI.
 */
export function mergeUsfmFile(opts: {
  base: string;
  ours: string;
  theirs: string;
}): MergeUsfmResult {
  const { base, ours, theirs } = opts;
  const baseDoc = parseUsj(base);
  const oursDoc = parseUsj(ours);
  const theirsDoc = parseUsj(theirs);

  // Semantic equality check: if both sides produce identical USJ (same verse /
  // paragraph structure, same text), the raw USFM differs only in formatting
  // (line breaks, whitespace, verse-line grouping). Auto-resolve without a
  // conflict and re-serialise to a canonical form so the stored file is consistent.
  if (sortedJson(oursDoc as unknown) === sortedJson(theirsDoc as unknown)) {
    const text = convertUSJDocumentToUSFM(oursDoc);
    return { kind: 'merged', text };
  }

  // One-sided-change shortcuts at the semantic level (no re-serialisation needed
  // when the base is already one of the two sides at the USJ level).
  const baseCan = sortedJson(baseDoc as unknown);
  if (baseCan === sortedJson(oursDoc as unknown)) {
    // Only theirs changed semantically → take theirs (re-serialise for consistency).
    const text = convertUSJDocumentToUSFM(theirsDoc);
    return { kind: 'merged', text };
  }
  if (baseCan === sortedJson(theirsDoc as unknown)) {
    // Only ours changed semantically → take ours.
    const text = convertUSJDocumentToUSFM(oursDoc);
    return { kind: 'merged', text };
  }

  const oursOps = diffUsjDocuments(baseDoc, oursDoc);
  const theirsOps = diffUsjDocuments(baseDoc, theirsDoc);

  const overlapping = filterResolvableConflicts([
    {
      chapter: 0,
      layer: 'content',
      localOps: oursOps,
      remoteOps: theirsOps,
    },
  ]);
  if (overlapping.length > 0) {
    return {
      kind: 'conflict',
      conflicts: overlapping,
      baseText: base,
      oursText: ours,
      theirsText: theirs,
    };
  }

  const { clientPrime, serverPrime } = transformOpLists(oursOps, theirsOps);
  const merged = new DocumentStore({ silentConsole: true });
  merged.loadUSJ(baseDoc);
  try {
    merged.applyOperations(serverPrime);
    merged.applyOperations(clientPrime);
  } catch {
    return {
      kind: 'conflict',
      conflicts: [
        {
          chapter: 0,
          layer: 'content',
          localOps: oursOps,
          remoteOps: theirsOps,
        },
      ],
      baseText: base,
      oursText: ours,
      theirsText: theirs,
    };
  }

  const text = convertUSJDocumentToUSFM(merged.getFullUSJ());
  return { kind: 'merged', text };
}

function isUsfmPath(p: string): boolean {
  const l = p.toLowerCase();
  return l.endsWith('.usfm') || l.endsWith('.sfm');
}

function isYamlManifest(p: string): boolean {
  const l = p.toLowerCase();
  return l.endsWith('manifest.yaml') || l.endsWith('manifest.yml');
}

function isAlignmentJson(p: string): boolean {
  return p.toLowerCase().endsWith('.alignment.json');
}

function isProjectJournalJsonl(p: string): boolean {
  const n = p.replace(/\\/g, '/').toLowerCase();
  return n.startsWith('journal/') && n.endsWith('.jsonl');
}

function isPlainTextMergeable(p: string): boolean {
  const l = p.toLowerCase();
  if (l.includes('/.git/')) return false;
  const ext = l.includes('.') ? l.slice(l.lastIndexOf('.')) : '';
  return ['.md', '.txt', '.json', '.jsonl', '.yaml', '.yml', '.tsv', '.css', '.html'].some((e) =>
    l.endsWith(e),
  );
}

/** True if path is likely binary / not safe to merge as UTF-8 text. */
export function isBinarySyncPath(path: string): boolean {
  const l = path.toLowerCase();
  const ext = l.includes('.') ? l.slice(l.lastIndexOf('.')) : '';
  const textish =
    ext === '' ||
    ['.md', '.yaml', '.yml', '.json', '.jsonl', '.usfm', '.sfm', '.txt', '.tsv', '.css', '.html'].includes(
      ext,
    );
  return !textish;
}

// ---------------------------------------------------------------------------
// YAML manifest deep-merge helpers
// ---------------------------------------------------------------------------

/**
 * Dot-separated keys that contain only metadata timestamps — differences
 * in these keys are merged silently (ours wins for stability).
 * Applies to both YAML manifests and JSON documents (e.g. *.alignment.json).
 */
const METADATA_ONLY_KEYS = new Set([
  'dublin_core.modified',
  'dublin_core.created',
  'lastRemoteSyncAt',
  // JSON-document top-level timestamp fields
  'updated',
  'created',
  'modified',
  'lastModified',
  'savedAt',
]);

function isMetadataKey(dotPath: string): boolean {
  if (METADATA_ONLY_KEYS.has(dotPath)) return true;
  // also match deeper sub-keys like dublin_core.modified.something
  for (const k of METADATA_ONLY_KEYS) {
    if (dotPath.startsWith(k + '.')) return true;
  }
  return false;
}

type PlainObject = Record<string, unknown>;

function isPlainObj(v: unknown): v is PlainObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function canonicalize(v: unknown): string {
  return JSON.stringify(v);
}

/**
 * Recursively deep-merge three YAML objects.
 * - When only ours changed from base → take ours.
 * - When only theirs changed from base → take theirs.
 * - When both changed but result is equal → take ours.
 * - When both changed differently → mark as conflict.
 * Returns `{ merged, conflictKeys }` where conflictKeys (dot-paths) are non-metadata conflicts.
 */
function deepMergeYaml(
  base: PlainObject,
  ours: PlainObject,
  theirs: PlainObject,
  prefix = '',
): { merged: PlainObject; conflictKeys: string[] } {
  const allKeys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  const merged: PlainObject = {};
  const conflictKeys: string[] = [];

  for (const key of allKeys) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    const bVal = base[key];
    const oVal = ours[key];
    const tVal = theirs[key];

    const bCan = canonicalize(bVal);
    const oCan = canonicalize(oVal);
    const tCan = canonicalize(tVal);

    if (oCan === tCan) {
      // Both sides agree
      merged[key] = oVal;
    } else if (bCan === oCan) {
      // Only theirs changed
      merged[key] = tVal;
    } else if (bCan === tCan) {
      // Only ours changed
      merged[key] = oVal;
    } else if (isPlainObj(oVal) && isPlainObj(tVal)) {
      // Both changed on a nested object — recurse (use {} as base if base is absent)
      const baseFallback = isPlainObj(bVal) ? bVal : {};
      const sub = deepMergeYaml(baseFallback, oVal, tVal, dotPath);
      merged[key] = sub.merged;
      conflictKeys.push(...sub.conflictKeys);
    } else if (isMetadataKey(dotPath)) {
      // Metadata key that both sides changed — merge silently, take ours
      merged[key] = oVal;
    } else {
      // Real conflict
      merged[key] = oVal; // provisional — caller surfaces conflict
      conflictKeys.push(dotPath);
    }
  }

  return { merged, conflictKeys };
}

/**
 * Try YAML deep-merge for manifest files.
 * Returns `merged` text when no real conflicts remain, or `undefined` to fall through.
 */
function tryYamlDeepMerge(
  path: string,
  base: string,
  ours: string,
  theirs: string,
): { kind: 'merged'; text: string } | { kind: 'conflict'; conflict: FileConflict } | undefined {
  if (!isYamlManifest(path)) return undefined;
  try {
    const bObj = (jsYaml.load(base || '{}') ?? {}) as unknown;
    const oObj = (jsYaml.load(ours) ?? {}) as unknown;
    const tObj = (jsYaml.load(theirs) ?? {}) as unknown;
    if (!isPlainObj(bObj) || !isPlainObj(oObj) || !isPlainObj(tObj)) return undefined;

    const { merged, conflictKeys } = deepMergeYaml(bObj, oObj, tObj);

    // Filter out metadata-only conflicts
    const realConflicts = conflictKeys.filter((k) => !isMetadataKey(k));

    if (realConflicts.length === 0) {
      // All differences were metadata-only or resolvable — dump merged back to YAML
      return { kind: 'merged', text: jsYaml.dump(merged, { lineWidth: 120 }) };
    }

    // Real YAML conflicts — surface conflict with clean text (metadata stripped)
    return {
      kind: 'conflict',
      conflict: fileConflictFrom(path, base, ours, theirs, []),
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// JSON canonical merge (works without base)
// ---------------------------------------------------------------------------

/** Deterministic JSON representation with sorted object keys (for equality checks). */
function sortedJson(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(sortedJson).join(',') + ']';
  if (isPlainObj(v)) {
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => `${JSON.stringify(k)}:${sortedJson(v[k])}`).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * Try JSON canonical equality shortcut. Works even when base is empty/missing.
 * Uses sorted-key serialisation to compare objects regardless of insertion order.
 */
function tryJsonCanonical(
  base: string,
  ours: string,
  theirs: string,
): { kind: 'merged'; text: string } | undefined {
  try {
    const jo = JSON.parse(ours) as unknown;
    const jt = JSON.parse(theirs) as unknown;
    if (!isPlainObj(jo) || !isPlainObj(jt)) return undefined;

    const oCan = sortedJson(jo);
    const tCan = sortedJson(jt);

    if (oCan === tCan) {
      return { kind: 'merged', text: ours };
    }

    // If base is missing/empty, we can't pick a side — fall through
    if (!base) return undefined;

    try {
      const jb = JSON.parse(base) as unknown;
      if (!isPlainObj(jb)) return undefined;
      const bCan = sortedJson(jb);
      if (bCan === oCan) return { kind: 'merged', text: theirs };
      if (bCan === tCan) return { kind: 'merged', text: ours };
    } catch {
      /* base may not be valid JSON */
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// JSON deep-merge (for *.alignment.json and other structured JSON files)
// ---------------------------------------------------------------------------

/**
 * Try JSON deep-merge for structured JSON files.
 * Mirrors the YAML deep-merge logic: metadata-only differences are silently
 * merged (ours wins), real content differences produce a conflict.
 * Returns `undefined` if the file is not JSON or parsing fails.
 */
function tryJsonDeepMerge(
  path: string,
  base: string,
  ours: string,
  theirs: string,
): { kind: 'merged'; text: string } | { kind: 'conflict'; conflict: FileConflict } | undefined {
  const l = path.toLowerCase();
  if (!l.endsWith('.json')) return undefined;
  try {
    const bObj = (base ? JSON.parse(base) : {}) as unknown;
    const oObj = JSON.parse(ours) as unknown;
    const tObj = JSON.parse(theirs) as unknown;
    if (!isPlainObj(oObj) || !isPlainObj(tObj)) return undefined;
    const bFallback: PlainObject = isPlainObj(bObj) ? bObj : {};

    const { merged, conflictKeys } = deepMergeYaml(bFallback, oObj, tObj);
    const realConflicts = conflictKeys.filter((k) => !isMetadataKey(k));

    if (realConflicts.length === 0) {
      // All differences were metadata-only — emit merged JSON
      return { kind: 'merged', text: JSON.stringify(merged, null, 2) };
    }

    return {
      kind: 'conflict',
      conflict: fileConflictFrom(path, base, ours, theirs, []),
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Public mergeFileContent
// ---------------------------------------------------------------------------

/**
 * Merge one file given three revisions (base / ours / theirs UTF-8 text).
 * Returns merged text or a {@link FileConflict} for the UI.
 */
export function mergeFileContent(opts: {
  path: string;
  base: string;
  ours: string;
  theirs: string;
}): { kind: 'merged'; text: string } | { kind: 'conflict'; conflict: FileConflict } {
  const { path, base, ours, theirs } = opts;
  if (ours === theirs) {
    return { kind: 'merged', text: ours };
  }
  if (base === ours) {
    return { kind: 'merged', text: theirs };
  }
  if (base === theirs) {
    return { kind: 'merged', text: ours };
  }

  if (isProjectJournalJsonl(path)) {
    const r = mergeJournalJsonlThreeWay({ path, base, ours, theirs });
    if (r.kind === 'merged') {
      return { kind: 'merged', text: r.text };
    }
    return { kind: 'conflict', conflict: r.conflict };
  }

  // CRDT (.ybin) — 3-way merge via Yjs; never produces a conflict at the CRDT level.
  if (isYbinPath(path)) {
    const r = mergeYjsBase64ThreeWay(base, ours, theirs);
    if (r.kind === 'merged') {
      return { kind: 'merged', text: r.base64 };
    }
    return {
      kind: 'conflict',
      conflict: fileConflictFrom(path, base, ours, theirs, []),
    };
  }

  if (isBinarySyncPath(path)) {
    return {
      kind: 'conflict',
      conflict: fileConflictFrom(path, base, ours, theirs, []),
    };
  }

  if (isUsfmPath(path)) {
    const r = mergeUsfmFile({ base, ours, theirs });
    if (r.kind === 'merged') {
      return { kind: 'merged', text: r.text };
    }
    // Derive chapterIndices from a USFM body-level diff (slice by \c N and
    // compare normalized chunks) rather than from OT op addresses.  The OT
    // engine places all unresolvable conflicts in a synthetic chapter-0 bucket
    // regardless of where the actual change lives, so op.path.chapter is often
    // 0 even when the real conflict is in chapter 1.
    const bodyCh = affectedChaptersFromUsfm(ours, theirs);
    const bodyChapters = [...bodyCh].filter((n) => n > 0).sort((a, b) => a - b);
    const bodyHasFrontMatter = bodyCh.has(0);

    let finalIndices: number[];
    if (bodyChapters.length === 0 && !bodyHasFrontMatter) {
      // Body diff found no difference (very rare — fall back to OT-derived signal).
      const otCh = new Set<number>();
      for (const c of r.conflicts) {
        for (const op of [...c.localOps, ...c.remoteOps]) {
          const n = opRoughChapter(op);
          if (n !== null && n > 0) otCh.add(n);
        }
      }
      finalIndices = otCh.size > 0 ? [...otCh].sort((a, b) => a - b) : [1];
    } else {
      finalIndices = bodyHasFrontMatter ? [0, ...bodyChapters] : bodyChapters;
    }

    return {
      kind: 'conflict',
      conflict: fileConflictFrom(path, base, ours, theirs, finalIndices),
    };
  }

  // YAML manifest: structured deep-merge with metadata-key filtering
  if (isYamlManifest(path)) {
    const yamlResult = tryYamlDeepMerge(path, base, ours, theirs);
    if (yamlResult) return yamlResult;
  }

  // JSON deep-merge with metadata-key filtering (alignment.json timestamp drift, etc.)
  if (isAlignmentJson(path)) {
    const jsonDeepResult = tryJsonDeepMerge(path, base, ours, theirs);
    if (jsonDeepResult) return jsonDeepResult;
  }

  // JSON canonical equality (works without base)
  if (isAlignmentJson(path) || isPlainTextMergeable(path)) {
    const jsonResult = tryJsonCanonical(base, ours, theirs);
    if (jsonResult) return jsonResult;
  }

  if (isYamlManifest(path) || isAlignmentJson(path) || isPlainTextMergeable(path)) {
    return {
      kind: 'conflict',
      conflict: fileConflictFrom(path, base, ours, theirs, []),
    };
  }

  return {
    kind: 'conflict',
    conflict: fileConflictFrom(path, base, ours, theirs, []),
  };
}

function fileConflictFrom(
  path: string,
  baseText: string,
  oursText: string,
  theirsText: string,
  chapterIndices: number[],
): FileConflict {
  return {
    conflictId: `${path}#${chapterIndices.join(',') || '0'}-${hashShort(oursText)}-${hashShort(theirsText)}`,
    path,
    chapterIndices,
    baseText,
    oursText,
    theirsText,
  };
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export type MergeProjectResult = {
  merged: Map<string, string>;
  conflicts: FileConflict[];
  /**
   * Paths that should be removed from local storage because one side silently
   * deleted the file (the other side had no local change from the common base).
   */
  deleted: string[];
};

/**
 * Union of path keys across three maps; merges each path when all three revisions exist.
 * Missing paths: if only in ours, keep ours; only in theirs, keep theirs; handled by caller.
 */
export function mergeProjectMaps(opts: {
  paths: Iterable<string>;
  getBase: (path: string) => string | undefined;
  getOurs: (path: string) => string | undefined;
  getTheirs: (path: string) => string | undefined;
}): MergeProjectResult {
  const merged = new Map<string, string>();
  const conflicts: FileConflict[] = [];
  const deleted: string[] = [];

  for (const path of opts.paths) {
    const base = opts.getBase(path);
    const ours = opts.getOurs(path);
    const theirs = opts.getTheirs(path);

    // Both sides deleted — silent.
    if (ours === undefined && theirs === undefined) {
      continue;
    }

    // Locally deleted (ours is absent).
    if (ours === undefined) {
      if (base === undefined) {
        // Remote added a brand-new file we never had — take it silently.
        merged.set(path, theirs!);
      } else if (theirs === base) {
        // Remote is unchanged from base; local deletion wins → silent delete.
        deleted.push(path);
      } else {
        // Remote modified from base while we deleted → conflict.
        // oursText = '' signals "locally deleted" to the conflict UI.
        conflicts.push(fileConflictFrom(path, base, '', theirs!, []));
      }
      continue;
    }

    // Remotely deleted (theirs is absent).
    if (theirs === undefined) {
      if (base === undefined) {
        // We have a local-only file with no base — keep it.
        merged.set(path, ours);
      } else if (ours === base) {
        // Local is unchanged from base; remote deletion wins → silent delete.
        deleted.push(path);
      } else {
        // We modified from base while remote deleted → conflict.
        // theirsText = '' signals "remotely deleted" to the conflict UI.
        conflicts.push(fileConflictFrom(path, base, ours, '', []));
      }
      continue;
    }

    const b = base ?? '';

    // Phase 6+7: CRDT-first merge for USFM files.
    // When both sides have a companion `.ybin` (Yjs state), use the CRDT 3-way
    // merge as the primary strategy — always deterministic, never conflicts.
    //
    // Phase 7 extension: `ybinBase` is allowed to be absent (empty string used).
    // This covers peer-sync (bundle/file exchange between two devices without a
    // shared DCS ancestor).  Yjs deduplicates operations by (clientID, clock):
    // if both devices started from the same genesis `.ybin` the shared history
    // is automatically skipped; only each side's new operations are merged.
    //
    // Falls through to OT when: CRDT history is absent on either side (files
    // written before Phase 4), CRDT merge errors (corrupt state), or when only
    // one side has a .ybin.
    if (isUsfmPath(path)) {
      const ybinPath = crdtPathFromUsfm(path);
      const ybinBase = opts.getBase(ybinPath);
      const ybinOurs = opts.getOurs(ybinPath);
      const ybinTheirs = opts.getTheirs(ybinPath);
      if (ybinOurs !== undefined && ybinTheirs !== undefined) {
        const crdtResult = mergeYjsBase64ThreeWay(ybinBase ?? '', ybinOurs, ybinTheirs);
        if (crdtResult.kind === 'merged') {
          merged.set(path, crdtResult.usfm);
          // Also persist the merged Yjs state so the .ybin stays consistent.
          // The .ybin path may be encountered again in the loop and produce the
          // same value — the second write is idempotent.
          merged.set(ybinPath, crdtResult.base64);
          continue;
        }
        // CRDT merge returned an error (corrupted state) — fall through to OT.
      }
    }

    const r = mergeFileContent({ path, base: b, ours, theirs });
    if (r.kind === 'merged') {
      merged.set(path, r.text);
    } else {
      conflicts.push(r.conflict);
    }
  }

  return { merged, conflicts, deleted };
}
