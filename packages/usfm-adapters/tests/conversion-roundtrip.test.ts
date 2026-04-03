/**
 * Multi-direction conversion invariants: canonical USJ (toJSON), USJVisitor output, USXVisitor output,
 * and stability after USFM round-trip through USFMVisitor.
 *
 * Package fixtures only (parser + adapters trees); `examples/usfm-markers` is covered by
 * `fixture-matrix.test.ts` with the same round-trip + USX well-formedness checks.
 */
import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import { USFMParser } from '@usfm-tools/parser';
import { compareUsjSimilarity, compareUsxSimilarity } from '@usfm-tools/parser/oracle';
import { USFMVisitor, USJVisitor, USXVisitor } from '../src';

function assertXmlParses(xml: string): void {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  expect(root).toBeTruthy();
  const name = (root?.nodeName || '').toLowerCase();
  expect(name).not.toContain('parsererror');
}

function repoRootFromHere(): string {
  return path.join(__dirname, '..', '..', '..');
}

function collectPackageFixtureUsfm(): { label: string; usfm: string }[] {
  const repo = repoRootFromHere();
  const roots = [
    path.join(repo, 'packages', 'usfm-parser', 'tests', 'fixtures'),
    path.join(repo, 'packages', 'usfm-adapters', 'tests', 'fixtures'),
  ];
  const absPaths: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.usfm')) absPaths.push(p);
    }
  };
  for (const r of roots) walk(r);
  /** One path per `fixtures/...` tail (parser + adapters often share the same file). */
  const byFixtureTail = new Map<string, string>();
  for (const abs of absPaths) {
    const rel = abs.replace(/\\/g, '/');
    const idx = rel.indexOf('/fixtures/');
    const tail = idx >= 0 ? rel.slice(idx + '/fixtures/'.length) : rel;
    if (!byFixtureTail.has(tail)) byFixtureTail.set(tail, abs);
  }
  const uniq = [...byFixtureTail.values()].sort();
  return uniq.map((abs) => ({
    label: path.relative(repo, abs).replace(/\\/g, '/'),
    usfm: fs.readFileSync(abs, 'utf8'),
  }));
}

function roundtripMinScore(bytes: number): number {
  if (bytes > 120_000) return 0.82;
  if (bytes > 40_000) return 0.89;
  return 0.91;
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
  jest.setTimeout(120_000);

  const cases = collectPackageFixtureUsfm();

  it('discovers package USFM fixtures', () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(cases)(
    '%s: USJ is stable after USFM → USFMVisitor → re-parse',
    ({ label, usfm }) => {
      const bytes = Buffer.byteLength(usfm, 'utf8');
      const once = usjFromUsfm(usfm);
      const rt = roundtripUsfm(usfm);
      const twice = usjFromUsfm(rt);
      const cmp = compareUsjSimilarity(once, twice, { minScore: roundtripMinScore(bytes) });
      expect(cmp.ok).toBe(true);
    }
  );

  it.each(cases)(
    '%s: USX is stable after USFM → USFMVisitor → re-parse',
    ({ label, usfm }) => {
      const once = usxFromUsfm(usfm);
      const rt = roundtripUsfm(usfm);
      const twice = usxFromUsfm(rt);
      assertXmlParses(once);
      assertXmlParses(twice);
      const cmp = compareUsxSimilarity(once, twice, { minScore: 0.92 });
      expect(cmp.ok).toBe(true);
    }
  );

  it.each(cases)(
    '%s: USJVisitor document aligns with parser toJSON (tolerant)',
    ({ label, usfm }) => {
      const canonical = usjFromUsfm(usfm);
      const fromVisitor = usjVisitorDocumentFromUsfm(usfm);
      const cmp = compareUsjSimilarity(canonical, fromVisitor, {
        minScore: 0.85,
        minTextSimilarity: 0.78,
        minStructureSimilarity: 0.65,
      });
      expect(cmp.ok).toBe(true);
    }
  );
});
