/**
 * Locks in tolerant parity with committed usfmtc USJ/USX snapshots (see tests/fixtures/oracle-usfmtc).
 * Regenerate snapshots after intentional parser or usfmtc upgrades: `bun run oracles:batch` then copy
 * usfmtc.usj.json / usfmtc.usx from oracle-out/batch/<slug>/ into the matching fixture folder as oracle.*.
 */
import fs from 'fs';
import path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { compareUsjSimilarity, compareUsxSimilarity } from '@usfm-tools/parser/oracle';
import { USXVisitor } from '../src';

const parserUsfmDir = path.join(__dirname, '../../usfm-parser/tests/fixtures/usfm');
const oracleRoot = path.join(__dirname, 'fixtures/oracle-usfmtc');

function readUsfm(name: string): string {
  return fs.readFileSync(path.join(parserUsfmDir, name), 'utf8');
}

function loadOracleJson(fixture: string): unknown {
  const raw = fs.readFileSync(path.join(oracleRoot, fixture, 'oracle.usj.json'), 'utf8');
  return JSON.parse(raw);
}

function loadOracleUsx(fixture: string): string {
  return fs.readFileSync(path.join(oracleRoot, fixture, 'oracle.usx'), 'utf8');
}

/** USX aligned with usfmtc `outUsx` (minimal verse milestones + inline bare `\\sN`). */
function ourUsxFromUsfm(usfm: string): string {
  const parser = new USFMParser();
  parser.load(usfm).parse();
  const visitor = new USXVisitor({
    verseMilestones: 'minimal',
    inlineBareSectionMilestones: true,
  });
  parser.visit(visitor);
  return visitor.getDocument();
}

describe('usfmtc parity (committed oracle snapshots)', () => {
  it('basic.usfm: USJ and USX meet default compare thresholds vs usfmtc', () => {
    const usfm = readUsfm('basic.usfm');
    const parser = new USFMParser();
    parser.load(usfm).parse();
    const oracleUsj = loadOracleJson('basic');
    const usj = compareUsjSimilarity(parser.toJSON(), oracleUsj);
    expect(usj.ok).toBe(true);

    const usx = compareUsxSimilarity(ourUsxFromUsfm(usfm), loadOracleUsx('basic'));
    expect(usx.ok).toBe(true);
  });

  it('medium.usfm: USJ meets default compare thresholds vs usfmtc', () => {
    const usfm = readUsfm('medium.usfm');
    const parser = new USFMParser();
    parser.load(usfm).parse();
    const oracleUsj = loadOracleJson('medium');
    const usj = compareUsjSimilarity(parser.toJSON(), oracleUsj);
    expect(usj.ok).toBe(true);
  });

  it('medium.usfm: USX meets default compare thresholds vs usfmtc', () => {
    const usfm = readUsfm('medium.usfm');
    const usx = compareUsxSimilarity(ourUsxFromUsfm(usfm), loadOracleUsx('medium'));
    expect(usx.ok).toBe(true);
  });
});
