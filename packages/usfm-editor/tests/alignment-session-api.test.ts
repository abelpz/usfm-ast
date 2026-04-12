/** @jest-environment jsdom */

import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { ScriptureSession } from '../src/scripture-session';

const titUn = join(__dirname, '../../usfm-parser/tests/fixtures/usfm/tit.tpl-unaligned.usfm');

describe('ScriptureSession alignment API', () => {
  it('loadAlignmentSource + createAlignmentGroupFromTokenIndices + progress', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, {});
    const usfm = readFileSync(titUn, 'utf8');
    session.loadUSFM(usfm);

    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    const srcUsj = p.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const compat = session.loadAlignmentSource(srcUsj, { stripSource: true });
    expect(compat.compatible).toBe(true);

    const sid = 'TIT 1:1';
    const tr = session.getTranslationTokens(sid);
    const ref = session.getReferenceTokens(sid);
    expect(tr.length).toBeGreaterThan(0);
    expect(ref.length).toBeGreaterThan(0);

    session.createAlignmentGroupFromTokenIndices(sid, [0], [0]);
    const groups = session.getAlignmentsForVerse(sid);
    expect(groups.length).toBe(1);

    const prog = session.getAlignmentProgress({ verseSid: sid });
    expect(prog.totalWordCount).toBe(tr.length);
    expect(prog.alignedWordCount).toBeGreaterThanOrEqual(1);

    session.removeAlignmentGroup(sid, 0);
    expect(session.getAlignmentsForVerse(sid).length).toBe(0);

    session.destroy();
  });
});
