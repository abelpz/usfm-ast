/**
 * Per-file three-way merge for local project sync (USJ OT + resolvable-conflict filter).
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

function parseUsj(usfm: string): UsjDocument {
  const p = new USFMParser({ silentConsole: true });
  p.parse(usfm || '\\id XXX\n');
  return p.toJSON() as UsjDocument;
}

function opRoughChapter(op: Operation): number {
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
  return 0;
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
    const ch = new Set<number>();
    for (const c of r.conflicts) {
      ch.add(c.chapter);
    }
    for (const op of r.conflicts[0]?.localOps ?? []) {
      ch.add(opRoughChapter(op));
    }
    for (const op of r.conflicts[0]?.remoteOps ?? []) {
      ch.add(opRoughChapter(op));
    }
    return {
      kind: 'conflict',
      conflict: fileConflictFrom(path, base, ours, theirs, [...ch].sort((a, b) => a - b)),
    };
  }

  if (isYamlManifest(path) || isAlignmentJson(path) || isPlainTextMergeable(path)) {
    try {
      const jo = JSON.parse(ours);
      const jt = JSON.parse(theirs);
      const jb = JSON.parse(base);
      if (
        typeof jo === 'object' &&
        jo &&
        typeof jt === 'object' &&
        jt &&
        typeof jb === 'object' &&
        jb
      ) {
        if (JSON.stringify(jo) === JSON.stringify(jt)) {
          return { kind: 'merged', text: ours };
        }
        if (JSON.stringify(jb) === JSON.stringify(jo)) {
          return { kind: 'merged', text: theirs };
        }
        if (JSON.stringify(jb) === JSON.stringify(jt)) {
          return { kind: 'merged', text: ours };
        }
      }
    } catch {
      /* fall through */
    }
    if (ours === base) {
      return { kind: 'merged', text: theirs };
    }
    if (theirs === base) {
      return { kind: 'merged', text: ours };
    }
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
    const r = mergeFileContent({ path, base: b, ours, theirs });
    if (r.kind === 'merged') {
      merged.set(path, r.text);
    } else {
      conflicts.push(r.conflict);
    }
  }

  return { merged, conflicts, deleted };
}
