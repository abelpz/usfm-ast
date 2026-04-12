import { convertUSJDocumentToUSFM } from '@usfm-tools/editor-adapters';
import type {
  AlignmentGroup,
  AlignmentMap,
  AlignedWord,
  OriginalWord,
  UsjDocument,
} from '@usfm-tools/types';
import {
  findVerseInlineNodes,
  rebuildAlignedUsj,
  stripAlignments,
  tokenizeWords,
} from '@usfm-tools/editor-core';
import { USFMParser } from '@usfm-tools/parser';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function flattenInlineToText(nodes: unknown[]): string {
  let s = '';
  for (const n of nodes) {
    if (typeof n === 'string') s += n;
    else if (isRecord(n)) {
      const t = n.type;
      if (t === 'char' && Array.isArray(n.content)) {
        s += flattenInlineToText(n.content as unknown[]);
      } else if (t === 'note' && Array.isArray(n.content)) {
        s += flattenInlineToText(n.content as unknown[]);
      }
    }
  }
  return s;
}

function listVerseSidsInContent(content: unknown[]): string[] {
  const out: string[] = [];
  const walk = (arr: unknown[]) => {
    for (const x of arr) {
      if (!isRecord(x)) continue;
      if (x.type === 'verse' && typeof x.sid === 'string') out.push(x.sid);
      if (Array.isArray(x.content)) walk(x.content as unknown[]);
    }
  };
  walk(content);
  return out;
}

export type AlignmentUiState = {
  sourceUsj: UsjDocument | null;
  gatewayUsj: UsjDocument | null;
  verseSid: string | null;
  sourceTokens: string[];
  targetTokens: string[];
  /** Pending source indices for multi-select (N:M) */
  pendingSource: number[];
  pendingTarget: number[];
  alignments: AlignmentMap;
};

export function parseUsfmToUsj(usfm: string): UsjDocument {
  const p = new USFMParser();
  p.parse(usfm);
  return p.toJSON() as UsjDocument;
}

/** Same verse sid on both documents — tokenize each side. */
export function tokensForPair(
  sourceUsj: UsjDocument,
  gatewayUsj: UsjDocument,
  sid: string
): { source: string[]; target: string[] } {
  const sInline = findVerseInlineNodes(sourceUsj.content as unknown[], sid);
  const tInline = findVerseInlineNodes(gatewayUsj.content as unknown[], sid);
  return {
    source: tokenizeWords(flattenInlineToText(sInline)),
    target: tokenizeWords(flattenInlineToText(tInline)),
  };
}

function placeholderOriginal(w: string, i: number): OriginalWord {
  return {
    strong: `S${i}`,
    lemma: w,
    content: w,
    occurrence: 1,
    occurrences: 1,
  };
}

function placeholderAligned(w: string): AlignedWord {
  return {
    word: w,
    occurrence: 1,
    occurrences: 1,
  };
}

/** Link selected source indices to selected target indices (one group). */
export function linkSelectionToGroup(
  state: AlignmentUiState,
  sourceIdx: number[],
  targetIdx: number[]
): AlignmentGroup {
  const sources: OriginalWord[] = sourceIdx.map((idx, i) =>
    placeholderOriginal(state.sourceTokens[idx] ?? '', idx + i)
  );
  const targets: AlignedWord[] = targetIdx.map((idx) =>
    placeholderAligned(state.targetTokens[idx] ?? '')
  );
  return { sources, targets };
}

export function mergeGroupIntoMap(
  alignments: AlignmentMap,
  verseSid: string,
  group: AlignmentGroup
): AlignmentMap {
  const next = { ...alignments };
  const list = [...(next[verseSid] ?? [])];
  list.push(group);
  next[verseSid] = list;
  return next;
}

export function exportAlignedGatewayUsfm(
  gatewayUsj: UsjDocument,
  alignments: AlignmentMap
): string {
  const { editable } = stripAlignments(gatewayUsj);
  const rebuilt = rebuildAlignedUsj(editable, alignments);
  return convertUSJDocumentToUSFM(rebuilt);
}

export function listVerseSids(usj: UsjDocument): string[] {
  return listVerseSidsInContent(usj.content as unknown[]);
}
