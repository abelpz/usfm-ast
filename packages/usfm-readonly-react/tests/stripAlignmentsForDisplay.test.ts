import * as fs from 'fs';
import * as path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { tokenizeGatewayUsj, transIndexForAlignedWord } from '@usfm-tools/usj-core';
import type { StripAlignmentsInput } from '../src/stripAlignmentsForDisplay';
import { stripAlignmentsForDisplay } from '../src/stripAlignmentsForDisplay';
import { resolveWordTokenAlignment } from '../src/wordAlignment';

const alignmentFixture = path.join(__dirname, '../../usfm-parser/tests/fixtures/usfm/alignment.usfm');

describe('stripAlignmentsForDisplay', () => {
  it('returns display USJ and non-empty alignments for aligned fixture', () => {
    const usfm = fs.readFileSync(alignmentFixture, 'utf8');
    const raw = new USFMParser({ silentConsole: true }).parse(usfm).toJSON();
    const { usj, alignments } = stripAlignmentsForDisplay(raw as StripAlignmentsInput);
    expect(JSON.stringify(usj)).not.toContain('zaln-s');
    const tit31 = alignments['TIT 3:1'];
    expect(Array.isArray(tit31)).toBe(true);
    expect(tit31!.length).toBeGreaterThan(0);
  });
});

describe('resolveWordTokenAlignment', () => {
  it('resolves first aligned target in TIT 3:1', () => {
    const usfm = fs.readFileSync(alignmentFixture, 'utf8');
    const raw = new USFMParser({ silentConsole: true }).parse(usfm).toJSON();
    const { usj, alignments } = stripAlignmentsForDisplay(raw as StripAlignmentsInput);
    const byVerse = tokenizeGatewayUsj({ content: (usj as { content: unknown[] }).content });
    const tit31 = alignments['TIT 3:1'];
    const tok = byVerse['TIT 3:1'];
    expect(tit31?.length).toBeGreaterThan(0);
    expect(tok?.length).toBeGreaterThan(0);
    const firstTarget = tit31![0]!.targets[0]!;
    const gwIdx = transIndexForAlignedWord(tok!, firstTarget);
    expect(gwIdx).not.toBeNull();
    const resolved = resolveWordTokenAlignment('TIT 3:1', gwIdx!, alignments, tok!);
    expect(resolved).not.toBeNull();
    expect(resolved!.originalWords.length).toBeGreaterThan(0);
  });
});
