/**
 * Multi-direction conversion invariants: canonical USJ (toJSON), USJVisitor output, USXVisitor output,
 * and stability after USFM round-trip through USFMVisitor.
 */
import fs from 'fs';
import path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { compareUsjSimilarity, compareUsxSimilarity } from '@usfm-tools/parser/oracle';
import { USFMVisitor, USJVisitor, USXVisitor } from '../src';

const parserUsfmDir = path.join(__dirname, '../../usfm-parser/tests/fixtures/usfm');
const adaptersUsfmDir = path.join(__dirname, 'fixtures/usfm');

function readParserFixture(name: string): string {
  return fs.readFileSync(path.join(parserUsfmDir, name), 'utf8');
}

function readAdapterFixture(name: string): string {
  return fs.readFileSync(path.join(adaptersUsfmDir, name), 'utf8');
}

function roundtripUsfm(usfm: string): string {
  const parser = new USFMParser();
  parser.load(usfm).parse();
  const visitor = new USFMVisitor();
  parser.visit(visitor);
  return visitor.getResult();
}

function usjFromUsfm(usfm: string): unknown {
  const parser = new USFMParser();
  parser.load(usfm).parse();
  return parser.toJSON();
}

function usxFromUsfm(usfm: string): string {
  const parser = new USFMParser();
  parser.load(usfm).parse();
  const visitor = new USXVisitor();
  parser.visit(visitor);
  return visitor.getDocument();
}

function usjVisitorDocumentFromUsfm(usfm: string): unknown {
  const parser = new USFMParser();
  parser.load(usfm).parse();
  const visitor = new USJVisitor();
  parser.visit(visitor);
  return visitor.getDocument();
}

describe('conversion round-trip and cross-visitor consistency', () => {
  const cases: { label: string; usfm: string }[] = [
    { label: 'basic', usfm: readParserFixture('basic.usfm') },
    { label: 'medium', usfm: readParserFixture('medium.usfm') },
    { label: 'list', usfm: readParserFixture('list.usfm') },
    { label: 'table', usfm: readAdapterFixture('table.usfm') },
  ];

  it.each(cases)(
    '$label: USJ is stable after USFM → USFMVisitor → re-parse',
    ({ usfm }) => {
      const once = usjFromUsfm(usfm);
      const rt = roundtripUsfm(usfm);
      const twice = usjFromUsfm(rt);
      const cmp = compareUsjSimilarity(once, twice, { minScore: 0.97 });
      expect(cmp.ok).toBe(true);
    }
  );

  it.each(cases)(
    '$label: USX is stable after USFM → USFMVisitor → re-parse',
    ({ usfm }) => {
      const once = usxFromUsfm(usfm);
      const rt = roundtripUsfm(usfm);
      const twice = usxFromUsfm(rt);
      const cmp = compareUsxSimilarity(once, twice, { minScore: 0.9 });
      expect(cmp.ok).toBe(true);
    }
  );

  it.each(cases)(
    '$label: USJVisitor document aligns with parser toJSON (tolerant)',
    ({ usfm }) => {
      const canonical = usjFromUsfm(usfm);
      const fromVisitor = usjVisitorDocumentFromUsfm(usfm);
      const cmp = compareUsjSimilarity(canonical, fromVisitor, {
        minScore: 0.82,
        minTextSimilarity: 0.75,
        minStructureSimilarity: 0.6,
      });
      expect(cmp.ok).toBe(true);
    }
  );
});
