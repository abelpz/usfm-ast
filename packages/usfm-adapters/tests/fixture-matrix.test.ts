/**
 * End-to-end checks across the same USFM corpus as `packages/usfm-parser/tests/corpus-usfm.test.ts`:
 * structural USJ validation, USFM round-trip, USJVisitor vs toJSON, and well-formed USX (explicit + usfmtc-style minimal).
 */
import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import { validateUsjStructure } from '@usj-tools/core';
import { USFMParser } from '@usfm-tools/parser';
import { compareUsjSimilarity } from '@usfm-tools/parser/oracle';
import { USFMVisitor, USJVisitor, USXVisitor } from '../src';

function collectUsfmFiles(rootDir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(rootDir)) return out;
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.usfm')) out.push(p);
    }
  };
  walk(rootDir);
  return out.sort();
}

function repoRootFromAdaptersTests(): string {
  return path.join(__dirname, '..', '..', '..');
}

function usfmCorpusPaths(): string[] {
  const repo = repoRootFromAdaptersTests();
  const fixtureRoot = path.join(repo, 'packages', 'usfm-parser', 'tests', 'fixtures');
  const examplesRoot = path.join(repo, 'examples', 'usfm-markers');
  return [...collectUsfmFiles(fixtureRoot), ...collectUsfmFiles(examplesRoot)].filter(
    (p, i, a) => a.indexOf(p) === i
  );
}

function assertXmlParses(xml: string): void {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  expect(root).toBeTruthy();
  const name = (root?.nodeName || '').toLowerCase();
  expect(name).not.toContain('parsererror');
}

function roundtripMinScore(bytes: number): number {
  if (bytes > 120_000) return 0.8;
  if (bytes > 40_000) return 0.88;
  return 0.9;
}

describe('fixture matrix (parser + visitors)', () => {
  jest.setTimeout(180_000);

  const files = usfmCorpusPaths();

  it('discovers a non-trivial corpus', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files)('%s', (absPath) => {
    const usfm = fs.readFileSync(absPath, 'utf8');
    const bytes = Buffer.byteLength(usfm, 'utf8');

    const parser = new USFMParser();
    parser.load(usfm).parse();
    const usj = parser.toJSON();

    const struct = validateUsjStructure(usj);
    expect(struct.ok).toBe(true);

    const ufmVisitor = new USFMVisitor();
    parser.visit(ufmVisitor);
    const usfmRt = ufmVisitor.getResult();

    const p2 = new USFMParser();
    p2.load(usfmRt).parse();
    const rtUsj = p2.toJSON();

    const rtCmp = compareUsjSimilarity(usj, rtUsj, { minScore: roundtripMinScore(bytes) });
    expect(rtCmp.ok).toBe(true);

    const ujVisitor = new USJVisitor();
    parser.visit(ujVisitor);
    const fromVisitor = ujVisitor.getDocument();
    const vCmp = compareUsjSimilarity(usj, fromVisitor, {
      minScore: 0.72,
      minTextSimilarity: 0.65,
      minStructureSimilarity: 0.55,
    });
    expect(vCmp.ok).toBe(true);

    const uxExplicit = new USXVisitor();
    parser.visit(uxExplicit);
    assertXmlParses(uxExplicit.getDocument());

    const uxFmtc = new USXVisitor({
      verseMilestones: 'minimal',
      inlineBareSectionMilestones: true,
    });
    parser.visit(uxFmtc);
    assertXmlParses(uxFmtc.getDocument());
  });
});
