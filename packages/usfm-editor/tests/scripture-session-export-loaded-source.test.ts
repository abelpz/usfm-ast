/** @jest-environment jsdom */

import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { ScriptureSession } from '../src/scripture-session';

const titAligned = join(__dirname, '../../usfm-parser/tests/fixtures/usfm/tit.tpl-aligned.usfm');
const titUnaligned = join(__dirname, '../../usfm-parser/tests/fixtures/usfm/tit.tpl-unaligned.usfm');

function insertAlignmentRem(usfm: string): string {
  return usfm.replace(
    '\x5cmt Tito',
    '\x5cmt Tito\r\n\x5crem alignment-source: el-x-koine/ugnt v85\r\n'
  );
}

describe('ScriptureSession export with loaded alignment source', () => {
  it('drops embedded milestones on other verses when source mismatches and only one verse was re-aligned', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, {});

    session.loadUSFM(insertAlignmentRem(readFileSync(titAligned, 'utf8')));

    const p = new USFMParser({ silentConsole: true });
    let srcUsfm = readFileSync(titUnaligned, 'utf8');
    srcUsfm = srcUsfm.replace(/^\x5cid TIT/m, '\x5cid GRC DIFFERENT_ALIGNMENT_SOURCE ugnt');
    p.parse(srcUsfm);
    const srcUsj = p.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const compat = session.loadAlignmentSource(srcUsj, { stripSource: true });
    expect(compat.compatible).toBe(false);

    const sid = 'TIT 1:1';
    session.updateAlignment(sid, []);
    session.createAlignmentGroupFromTokenIndices(sid, [0], [0]);
    expect(session.isAlignmentSourceLoaded()).toBe(true);
    expect(session.getAlignmentsForVerse(sid).length).toBe(1);

    const exported = session.toUSFM(undefined, { embedAlignmentProvenanceFromLoadedSource: true });
    expect(exported.includes('zaln-s')).toBe(true);

    const afterV1 = exported.split('\x5cv 1')[1] ?? '';
    const v2chunk = afterV1.split('\x5cv 2')[1]?.split('\x5cv 3')[0] ?? '';
    expect(v2chunk).toBeTruthy();
    expect(v2chunk.includes('\x5czaln-s')).toBe(false);

    const v1beforeV2 = afterV1.split('\x5cv 2')[0] ?? '';
    expect(v1beforeV2.includes('\x5czaln-s')).toBe(true);

    session.destroy();
  });

  it('keeps all embedded milestones when sources are compatible and loaded rem is used', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, {});

    session.loadUSFM(insertAlignmentRem(readFileSync(titAligned, 'utf8')));

    const p = new USFMParser({ silentConsole: true });
    let srcUsfm = readFileSync(titUnaligned, 'utf8');
    srcUsfm = srcUsfm.replace(/^\x5cid TIT/m, '\x5cid el-x-koine/ugnt v85');
    p.parse(srcUsfm);
    const srcUsj = p.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const compat = session.loadAlignmentSource(srcUsj, { stripSource: true });
    expect(compat.compatible).toBe(true);

    const exported = session.toUSFM(undefined, { embedAlignmentProvenanceFromLoadedSource: true });

    const afterV1 = exported.split('\x5cv 1')[1] ?? '';
    const v2chunk = afterV1.split('\x5cv 2')[1]?.split('\x5cv 3')[0] ?? '';
    expect(v2chunk.includes('\x5czaln-s')).toBe(true);

    session.destroy();
  });
});
