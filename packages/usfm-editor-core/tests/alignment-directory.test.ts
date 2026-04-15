import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractAlignmentDocumentFromUsfm,
  mergeAlignmentIntoUsfm,
  stripAlignmentFromUsfm,
  swapAlignmentInUsfm,
} from '../src/alignment-directory';
import { withAlignmentVerses } from '../src/alignment-io';

const alignmentFixture = join(__dirname, '../../usfm-parser/tests/fixtures/usfm/alignment.usfm');

describe('alignment-directory', () => {
  const translation = { id: 'en_tit', language: 'en' };
  const source = { id: 'el_ugnt', language: 'el-x-koine', version: '0.34' };

  it('stripAlignmentFromUsfm removes zaln milestones (fixture)', () => {
    const usfm = readFileSync(alignmentFixture, 'utf8');
    const out = stripAlignmentFromUsfm(usfm);
    expect(out).not.toContain('zaln-s');
    expect(out).not.toContain('zaln-e');
  });

  it('extract + merge round-trips structure (fixture)', () => {
    const usfm = readFileSync(alignmentFixture, 'utf8');
    const doc = extractAlignmentDocumentFromUsfm(usfm, translation, source);
    expect(Object.keys(doc.verses).length).toBeGreaterThan(0);
    const plain = stripAlignmentFromUsfm(usfm);
    const merged = mergeAlignmentIntoUsfm(plain, doc);
    expect(merged).toContain('zaln-s');
  });

  it('swapAlignmentInUsfm can clear via empty verses', () => {
    const usfm = readFileSync(alignmentFixture, 'utf8');
    const doc = extractAlignmentDocumentFromUsfm(usfm, translation, source);
    const emptyVerses = withAlignmentVerses(doc, {});
    const swapped = swapAlignmentInUsfm(usfm, emptyVerses);
    expect(swapped).not.toContain('zaln-s');
  });
});
