/**
 * Dual-layer alignment: USFM (embedded zaln) ↔ canonical {@link AlignmentDocument} JSON.
 * Directory listing helpers for `alignments/{lang}/*.alignment.json` layouts.
 */

import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import { USFMParser } from '@usfm-tools/parser';
import type { ActiveAlignmentPointer, AlignmentDocument, AlignmentMap, EditableUSJ } from '@usfm-tools/types';

import { keepUsfmVersionLine, layoutAlignedUsfm } from './aligned-usfm-layout';
import { createAlignmentDocument, parseAlignmentJson, serializeAlignmentJson } from './alignment-io';
import { stripAlignments } from '@usfm-tools/usj-core';
import { rebuildAlignedUsj } from './rebuild-aligned';

function parseUsfmToUsj(usfm: string): Parameters<typeof stripAlignments>[0] {
  const p = new USFMParser({ silentConsole: true });
  p.parse(usfm);
  return p.toJSON() as Parameters<typeof stripAlignments>[0];
}

/** Remove embedded alignments and return plain USFM (no `\\zaln-*`), saying the version of USFM the file said. */
export function stripAlignmentFromUsfm(usfm: string): string {
  const usj = parseUsfmToUsj(usfm);
  const { editable } = stripAlignments(usj);
  return keepUsfmVersionLine(convertUSJDocumentToUSFM(editable as EditableUSJ), usfm);
}

/** Extract embedded alignment into an {@link AlignmentDocument} (strip path uses alignment layer). */
export function extractAlignmentDocumentFromUsfm(
  usfm: string,
  translation: AlignmentDocument['translation'],
  source: AlignmentDocument['source'],
): AlignmentDocument {
  const usj = parseUsfmToUsj(usfm);
  const { alignments } = stripAlignments(usj);
  return createAlignmentDocument(translation, source, alignments);
}

/**
 * Merge alignment map from `doc` into plain USFM (weaves `\\zaln-s` / `\\w` / `\\zaln-e`), laid out a group to a
 * line (see {@link layoutAlignedUsfm}) and saying the version of USFM the file said it was in.
 */
export function mergeAlignmentIntoUsfm(usfm: string, doc: AlignmentDocument): string {
  const usj = parseUsfmToUsj(usfm);
  const { editable } = stripAlignments(usj);
  const merged = rebuildAlignedUsj(editable as EditableUSJ, doc.verses);
  return layoutAlignedUsfm(keepUsfmVersionLine(convertUSJDocumentToUSFM(merged as unknown as EditableUSJ), usfm));
}

/** Strip current embedded alignment, then merge `doc` (atomic “swap source” at the USFM text level). */
export function swapAlignmentInUsfm(usfm: string, doc: AlignmentDocument): string {
  return mergeAlignmentIntoUsfm(stripAlignmentFromUsfm(usfm), doc);
}

export type RepoFileEntry = { name: string; path: string; type: 'file' | 'dir' };

/** Discover `alignments/{lang}/` roots from a flat directory listing (e.g. DCS contents API). */
export function listAlignmentSources(entries: RepoFileEntry[]): { sourceLanguage: string; basePath: string }[] {
  const byLang = new Map<string, string>();
  for (const e of entries) {
    if (e.type !== 'file') continue;
    const n = e.path.replace(/\\/g, '/');
    const m = /^alignments\/([^/]+)\/.+\.alignment\.json$/i.exec(n);
    if (m) {
      const lang = m[1]!;
      if (!byLang.has(lang)) byLang.set(lang, `alignments/${lang}/`);
    }
  }
  return [...byLang.entries()]
    .map(([sourceLanguage, basePath]) => ({ sourceLanguage, basePath }))
    .sort((a, b) => a.sourceLanguage.localeCompare(b.sourceLanguage));
}

export function getActiveAlignmentPointerForBook(
  active: Record<string, ActiveAlignmentPointer> | undefined,
  bookCode: string,
): ActiveAlignmentPointer | null {
  if (!active) return null;
  return active[bookCode.toUpperCase()] ?? null;
}

export function parseAlignmentDirectoryFileJson(json: string): AlignmentDocument {
  return parseAlignmentJson(json);
}

export function serializeAlignmentDirectoryFile(doc: AlignmentDocument): string {
  return serializeAlignmentJson(doc);
}
