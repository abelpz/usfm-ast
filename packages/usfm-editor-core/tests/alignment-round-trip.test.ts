import { readFileSync } from 'fs';
import { join } from 'path';
import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import { USFMParser } from '@usfm-tools/parser';
import { rebuildAlignedUsj } from '../src/rebuild-aligned';
import { stripAlignments } from '../src/alignment-layer';
import { collectVerseTextsFromContent } from '../src/verse-text';

const titAligned = join(__dirname, '../../usfm-parser/tests/fixtures/usfm/tit.tpl-aligned.usfm');

describe('alignment round-trip tit.tpl-aligned', () => {
  it('gateway verse text matches after strip → rebuild → parse', () => {
    const usfm = readFileSync(titAligned, 'utf8');
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    const usj = p.toJSON() as { content: unknown[]; version: string };
    const before = collectVerseTextsFromContent(usj.content as unknown[]);
    const { editable, alignments } = stripAlignments(usj);
    const rebuilt = rebuildAlignedUsj(editable, alignments);
    const outUsfm = convertUSJDocumentToUSFM(rebuilt as Parameters<typeof convertUSJDocumentToUSFM>[0]);
    const p2 = new USFMParser({ silentConsole: true });
    p2.parse(outUsfm);
    const usj2 = p2.toJSON() as { content: unknown[] };
    const after = collectVerseTextsFromContent(usj2.content as unknown[]);
    // Trim trailing whitespace: a trailing space or newline at the verse boundary may differ
    // between the original (plain-text fallback) and the rebuilt path (\w nodes + USJ round-trip).
    expect(after['TIT 1:1']?.trimEnd()).toBe(before['TIT 1:1']?.trimEnd());
  });
});
