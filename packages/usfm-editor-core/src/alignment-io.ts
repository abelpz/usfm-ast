/**
 * External alignment document I/O: JSON (canonical), TSV, and human-readable text.
 */

import type {
  AlignedWord,
  AlignmentDocument,
  AlignmentDocumentSchemaVersion,
  AlignmentGroup,
  AlignmentMap,
  OriginalWord,
} from '@usfm-tools/types';

import { alignmentSourceKey } from './alignment-provenance';

const DOC_FORMAT = 'usfm-alignment' as const;
const SCHEMA_VERSION = '1.0' as AlignmentDocumentSchemaVersion;

/** Stable map key for {@link AlignmentDocument} (source identity). */
export function alignmentDocumentSourceKey(doc: AlignmentDocument): string {
  return alignmentSourceKey({
    identifier: doc.source.id,
    version: doc.source.version,
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseOriginalWord(o: unknown): OriginalWord | null {
  if (!isRecord(o)) return null;
  const content = String(o.content ?? '');
  const strong = String(o.strong ?? '');
  const lemma = String(o.lemma ?? '');
  const morph = o.morph !== undefined ? String(o.morph) : undefined;
  const occurrence = Number(o.occurrence) || 1;
  const occurrences = Number(o.occurrences) || 1;
  return { content, strong, lemma, morph, occurrence, occurrences };
}

function parseAlignedWord(o: unknown): AlignedWord | null {
  if (!isRecord(o)) return null;
  const word = String(o.word ?? '');
  const occurrence = Number(o.occurrence) || 1;
  const occurrences = Number(o.occurrences) || 1;
  return { word, occurrence, occurrences };
}

function parseAlignmentGroup(o: unknown): AlignmentGroup | null {
  if (!isRecord(o)) return null;
  const src = Array.isArray(o.sources) ? o.sources : [];
  const tgt = Array.isArray(o.targets) ? o.targets : [];
  const sources = src.map(parseOriginalWord).filter(Boolean) as OriginalWord[];
  const targets = tgt.map(parseAlignedWord).filter(Boolean) as AlignedWord[];
  if (sources.length === 0 || targets.length === 0) return null;
  return { sources, targets };
}

function assertAlignmentDocument(v: unknown): AlignmentDocument {
  if (!isRecord(v)) throw new Error('Alignment JSON: expected object');
  if (v.format !== DOC_FORMAT) throw new Error(`Alignment JSON: expected format "${DOC_FORMAT}"`);
  if (v.version !== SCHEMA_VERSION) throw new Error(`Alignment JSON: unsupported version "${v.version}"`);
  const translation = v.translation;
  const source = v.source;
  if (!isRecord(translation) || typeof translation.id !== 'string')
    throw new Error('Alignment JSON: translation.id required');
  if (!isRecord(source) || typeof source.id !== 'string') throw new Error('Alignment JSON: source.id required');
  const created = String(v.created ?? '');
  const updated = String(v.updated ?? '');
  const versesRaw = v.verses;
  if (!isRecord(versesRaw)) throw new Error('Alignment JSON: verses must be object');
  const verses: AlignmentMap = {};
  for (const [sid, groups] of Object.entries(versesRaw)) {
    if (!Array.isArray(groups)) continue;
    const parsed = groups.map(parseAlignmentGroup).filter(Boolean) as AlignmentGroup[];
    if (parsed.length) verses[sid] = parsed;
  }
  return {
    format: DOC_FORMAT,
    version: SCHEMA_VERSION,
    translation: {
      id: translation.id,
      version: typeof translation.version === 'string' ? translation.version : undefined,
      hash: typeof translation.hash === 'string' ? translation.hash : undefined,
    },
    source: {
      id: source.id,
      version: typeof source.version === 'string' ? source.version : undefined,
      hash: typeof source.hash === 'string' ? source.hash : undefined,
    },
    created,
    updated,
    verses,
  };
}

export function serializeAlignmentJson(doc: AlignmentDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function parseAlignmentJson(json: string): AlignmentDocument {
  const v = JSON.parse(json) as unknown;
  return assertAlignmentDocument(v);
}

/** Split verse SID "TIT 1:1" → book, chapter, verse */
export function splitVerseSid(sid: string): { book: string; chapter: string; verse: string } {
  const m = sid.trim().match(/^(\S+)\s+(\d+):(\d+)\s*$/);
  if (m) return { book: m[1]!, chapter: m[2]!, verse: m[3]! };
  const m2 = sid.trim().match(/^(\d+):(\d+)$/);
  if (m2) return { book: '', chapter: m2[1]!, verse: m2[2]! };
  return { book: '', chapter: '', verse: sid };
}

function escapeTsvField(s: string): string {
  if (/[\t\n\r"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseTsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === '\t') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** TSV columns (tab-separated). */
const TSV_HEADER =
  'Book\tChapter\tVerse\tSource\tSourceOcc\tSourceStrong\tTarget\tTargetOcc\tLemma\tMorph';

function occPair(o: OriginalWord | AlignedWord): string {
  if ('word' in o) {
    const w = o as AlignedWord;
    return `${w.occurrence}/${w.occurrences}`;
  }
  const s = o as OriginalWord;
  return `${s.occurrence}/${s.occurrences}`;
}

function joinParts(parts: string[], sep: string): string {
  return parts.map(escapeTsvField).join(sep);
}

export function serializeAlignmentTsv(doc: AlignmentDocument): string {
  const lines = [TSV_HEADER];
  for (const [sid, groups] of Object.entries(doc.verses)) {
    const { book, chapter, verse } = splitVerseSid(sid);
    const bk = book || 'UNK';
    for (const g of groups) {
      const srcText = g.sources.map((s) => s.content).join('+');
      const srcOcc = g.sources.map((s) => occPair(s)).join('+');
      const srcStrong = g.sources.map((s) => s.strong).join('+');
      const tgtText = g.targets.map((t) => t.word).join('+');
      const tgtOcc = g.targets.map((t) => occPair(t)).join('+');
      const lemma = g.sources.map((s) => s.lemma).join('+');
      const morph = g.sources.map((s) => s.morph ?? '').join('+');
      lines.push(
        joinParts([bk, chapter, verse, srcText, srcOcc, srcStrong, tgtText, tgtOcc, lemma, morph], '\t')
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function parseAlignmentTsv(
  tsv: string,
  meta: Pick<AlignmentDocument, 'translation' | 'source' | 'created' | 'updated'>
): AlignmentDocument {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) {
    return emptyAlignmentDocument(meta);
  }
  const header = parseTsvLine(lines[0]!);
  const hasHeader = header[0] === 'Book' || header[0]?.startsWith('Book');
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const verses: AlignmentMap = {};
  for (const line of dataLines) {
    const cols = parseTsvLine(line);
    if (cols.length < 8) continue;
    const bk = cols[0] ?? 'UNK';
    const ch = cols[1] ?? '1';
    const vs = cols[2] ?? '1';
    const sid = bk && ch && vs ? `${bk} ${ch}:${vs}` : `${ch}:${vs}`;
    const srcParts = (cols[3] ?? '').split('+');
    const srcOccParts = (cols[4] ?? '').split('+');
    const srcStrongParts = (cols[5] ?? '').split('+');
    const tgtParts = (cols[6] ?? '').split('+');
    const tgtOccParts = (cols[7] ?? '').split('+');
    const lemmaParts = (cols[8] ?? '').split('+');
    const morphParts = (cols[9] ?? '').split('+');
    const n = Math.max(srcParts.length, tgtParts.length, 1);
    const sources: OriginalWord[] = [];
    const targets: AlignedWord[] = [];
    for (let i = 0; i < srcParts.length; i++) {
      const [o, oc] = (srcOccParts[i] ?? '1/1').split('/').map((x) => parseInt(x, 10) || 1);
      sources.push({
        content: srcParts[i] ?? '',
        strong: srcStrongParts[i] ?? '',
        lemma: lemmaParts[i] ?? '',
        morph: morphParts[i] || undefined,
        occurrence: o,
        occurrences: oc,
      });
    }
    for (let i = 0; i < tgtParts.length; i++) {
      const [o, oc] = (tgtOccParts[i] ?? '1/1').split('/').map((x) => parseInt(x, 10) || 1);
      targets.push({
        word: tgtParts[i] ?? '',
        occurrence: o,
        occurrences: oc,
      });
    }
    if (sources.length === 0 || targets.length === 0) continue;
    const group: AlignmentGroup = { sources, targets };
    if (!verses[sid]) verses[sid] = [];
    verses[sid]!.push(group);
  }
  return {
    format: DOC_FORMAT,
    version: SCHEMA_VERSION,
    ...meta,
    verses,
  };
}

function emptyAlignmentDocument(
  meta: Pick<AlignmentDocument, 'translation' | 'source' | 'created' | 'updated'>
): AlignmentDocument {
  return {
    format: DOC_FORMAT,
    version: SCHEMA_VERSION,
    ...meta,
    verses: {},
  };
}

/** Serialize to human-readable lines (arrow syntax); round-trip with {@link parseAlignmentText}. */
export function serializeAlignmentText(doc: AlignmentDocument): string {
  const lines: string[] = [];
  lines.push(`# Alignment: ${doc.translation.id} → ${doc.source.id}`);
  if (doc.source.version) lines.push(`# Source version: ${doc.source.version}`);
  lines.push(`# Created: ${doc.created}`);
  lines.push(`# Updated: ${doc.updated}`);
  lines.push('');
  const sidKeys = Object.keys(doc.verses).sort();
  for (const sid of sidKeys) {
    lines.push(`== ${sid} ==`);
    for (const g of doc.verses[sid] ?? []) {
      const srcStr = g.sources
        .map((s) => {
          const occ = s.occurrence !== 1 || s.occurrences !== 1 ? ` [${s.occurrence}/${s.occurrences}]` : '';
          const strong = s.strong.trim() ? s.strong : ' ';
          const lemma = s.lemma.trim() ? ` <${s.lemma}>` : '';
          const morph = s.morph ? ` {${s.morph}}` : '';
          return `${s.content}${occ} (${strong})${lemma}${morph}`;
        })
        .join(' + ');
      const tgtStr = g.targets
        .map((t) => {
          const occ = t.occurrence !== 1 || t.occurrences !== 1 ? ` [${t.occurrence}/${t.occurrences}]` : '';
          return `${t.word}${occ}`;
        })
        .join(', ');
      lines.push(`${srcStr} → ${tgtStr}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Parse human-readable alignment text. Expects lines from {@link serializeAlignmentText}.
 */
export function parseAlignmentText(
  text: string,
  meta: Pick<AlignmentDocument, 'translation' | 'source' | 'created' | 'updated'>
): AlignmentDocument {
  const verses: AlignmentMap = {};
  let currentSid: string | null = null;
  const srcTok =
    /^(.+?)(?:\s+\[(\d+)\/(\d+)\])?\s+\(([^)]*)\)(?:\s+<([^>]*)>)?(?:\s+\{([^}]*)\})?$/;
  const lineRe = /^==\s+(.+?)\s*==$/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const mHdr = line.match(lineRe);
    if (mHdr) {
      currentSid = mHdr[1]!.trim();
      if (!verses[currentSid]) verses[currentSid] = [];
      continue;
    }
    if (!currentSid || !line.includes('→')) continue;
    const [left, right] = line.split('→').map((s) => s.trim());
    if (!left || !right) continue;
    const sourceChunks = left.split(/\s+\+\s+/).map((s) => s.trim());
    const targetChunks = right.split(/\s*,\s*/).map((s) => s.trim());
    const sources: OriginalWord[] = [];
    for (const chunk of sourceChunks) {
      const m = chunk.match(srcTok);
      if (m) {
        const strong = (m[4] ?? '').trim();
        sources.push({
          content: m[1]!.trim(),
          occurrence: m[2] ? parseInt(m[2], 10) : 1,
          occurrences: m[3] ? parseInt(m[3], 10) : 1,
          strong: strong === ' ' ? '' : strong,
          lemma: (m[5] ?? '').trim(),
          morph: m[6]?.trim() || undefined,
        });
      }
    }
    const targets: AlignedWord[] = [];
    const tgtTok = /^(.+?)(?:\s+\[(\d+)\/(\d+)\])?$/;
    for (const chunk of targetChunks) {
      const m = chunk.match(tgtTok);
      if (m) {
        targets.push({
          word: m[1]!.trim(),
          occurrence: m[2] ? parseInt(m[2], 10) : 1,
          occurrences: m[3] ? parseInt(m[3], 10) : 1,
        });
      }
    }
    if (sources.length && targets.length) {
      verses[currentSid]!.push({ sources, targets });
    }
  }

  return {
    format: DOC_FORMAT,
    version: SCHEMA_VERSION,
    ...meta,
    verses,
  };
}

/** Create a new document with timestamps (ISO 8601). */
export function createAlignmentDocument(
  translation: AlignmentDocument['translation'],
  source: AlignmentDocument['source'],
  verses: AlignmentMap = {}
): AlignmentDocument {
  const now = new Date().toISOString();
  return {
    format: DOC_FORMAT,
    version: SCHEMA_VERSION,
    translation,
    source,
    created: now,
    updated: now,
    verses: { ...verses },
  };
}

/** Shallow-update `updated` and replace verses. */
export function withAlignmentVerses(doc: AlignmentDocument, verses: AlignmentMap): AlignmentDocument {
  return {
    ...doc,
    updated: new Date().toISOString(),
    verses: { ...verses },
  };
}
