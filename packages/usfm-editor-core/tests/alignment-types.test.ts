import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { stripAlignments } from '../src/alignment-layer';
import { collectVerseTextsFromContent } from '../src/verse-text';

const alignmentFixture = join(__dirname, '../../usfm-parser/tests/fixtures/usfm/alignment.usfm');

describe('alignment types (strip + map)', () => {
  it('alignment.usfm: strip removes zaln from editable and records groups for TIT 3:1', () => {
    const usfm = readFileSync(alignmentFixture, 'utf8');
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    const usj = p.toJSON() as { content: unknown[] };
    const { editable, alignments } = stripAlignments(usj);
    expect(JSON.stringify(editable)).not.toContain('zaln-s');
    const g = alignments['TIT 3:1'];
    expect(Array.isArray(g)).toBe(true);
    expect(g!.length).toBeGreaterThan(0);
  });

  /** Uses `alignment.usfm` (BSB Titus 3) — same alignment patterns as `tit.tpl-aligned` (1:1, 1:N, N:1, N:M). */
  it('alignment.usfm: TIT 3:1–3 include 1:1, 1:N, N:1, and N:M shapes; OriginalWord fields preserved', () => {
    const usfm = readFileSync(alignmentFixture, 'utf8');
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    const usj = p.toJSON() as { content: unknown[] };
    const { editable, alignments } = stripAlignments(usj);
    const g1 = alignments['TIT 3:1'] ?? [];
    expect(g1.length).toBeGreaterThan(3);
    const has11 = g1.some((x) => x.sources.length === 1 && x.targets.length === 1);
    const has1N = g1.some((x) => x.sources.length === 1 && x.targets.length >= 2);
    const hasNM = g1.some((x) => x.sources.length >= 2 && x.targets.length >= 2);
    expect(has11).toBe(true);
    expect(has1N).toBe(true);
    expect(hasNM).toBe(true);

    const g2 = alignments['TIT 3:2'] ?? [];
    const hasN1 = g2.some((x) => x.sources.length >= 2 && x.targets.length === 1);
    expect(hasN1).toBe(true);

    const remind = g1.find((x) => x.targets.length === 1 && x.targets[0]!.word === 'Remind');
    expect(remind?.sources[0]!.strong).toBe('G52790');
    expect(remind?.sources[0]!.lemma).toBe('ὑπομιμνῄσκω');
    expect(remind?.sources[0]!.content).toBe('ὑπομίμνῃσκε');

    const flat = collectVerseTextsFromContent(editable.content as unknown[]);
    const t = flat['TIT 3:1'] ?? '';
    expect(t.trim().length).toBeGreaterThan(20);
    expect(t.split(/\s+/).filter(Boolean).length).toBeGreaterThan(8);
  });
});
