import path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { convertUSJDocumentToUSFM, USFMVisitor } from '../src';

// Fixture lives in @usfm-tools/parser (shared USJ + USFM samples).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const footnoteFixture = require(path.join(
  __dirname,
  '../../usfm-parser/tests/fixtures/usfm/footnote.js'
)) as {
  noteNestedBdInFqa: Record<string, unknown>;
  usjDocumentContent: unknown[];
  canonicalUsfmFromVisitor: string;
  alternateUsfmLegacyPlusPrefix: string;
};

describe('footnote fixture (nested \\bd in \\fqa) round-trip', () => {
  it('USJ → USFM matches canonical visitor output', () => {
    const usfm = convertUSJDocumentToUSFM({ content: footnoteFixture.usjDocumentContent });
    expect(usfm).toBe(footnoteFixture.canonicalUsfmFromVisitor);
  });

  it('canonical USFM → parse → USFMVisitor matches (stable round-trip)', () => {
    const parser = new USFMParser({ silentConsole: true });
    parser.load(footnoteFixture.canonicalUsfmFromVisitor).parse();
    const visitor = new USFMVisitor();
    parser.visit(visitor);
    expect(visitor.getResult()).toBe(footnoteFixture.canonicalUsfmFromVisitor);
  });

  it('USJ → USFM → parse preserves note subtree (toJSON)', () => {
    const usfm = convertUSJDocumentToUSFM({ content: footnoteFixture.usjDocumentContent });
    const parser = new USFMParser({ silentConsole: true });
    parser.load(usfm).parse();
    const doc = parser.toJSON() as {
      content?: Array<{ content?: Array<Record<string, unknown>> }>;
    };
    const note = doc.content?.[0]?.content?.[0];
    expect(note).toEqual(footnoteFixture.noteNestedBdInFqa);
  });

  it('round-trips Jonah 4:1-style footnote (\\fqa … \\f* then \\v on same line; no double \\f*)', () => {
    const usfm = String.raw`\p \v 1 Jonah, however, was greatly displeased, and he became angry.\f + \fr 4:1 \ft Or \fqa It was exceedingly evil to Jonah, and he became angry\f* \v 2 So he prayed to the LORD, saying, “O LORD, is this not what I said while I was still in my own country? This is why I was so quick to flee toward Tarshish. I knew that You are a gracious and compassionate God, slow to anger, abounding in loving devotion — One who relents from sending disaster.`;
    const parser = new USFMParser({ silentConsole: true });
    parser.load(usfm).parse();
    const j1 = parser.toJSON();
    const back = convertUSJDocumentToUSFM(j1);
    const p2 = new USFMParser({ silentConsole: true });
    p2.load(back).parse();
    expect(p2.toJSON()).toEqual(j1);
    expect(back).not.toMatch(/\\f\*\s*\\f\*/);
  });

  /**
   * Two consecutive `\\f … \\f*` footnotes on the same paragraph line, separated by plain text and
   * followed by a verse marker. Each note's last span is `\\fqa` and ends with a single `\\f*`.
   * USJ→USFM must emit each note close exactly once and preserve verse text after the second note.
   */
  it('round-trips two consecutive \\fqa footnotes (Jonah 3:3) — no double \\f*, verse text preserved', () => {
    const usfm = String.raw`\p Now Nineveh was an exceedingly great city,\f + \fr 3:3 \ft Or \fqa was a great city to God\f* requiring a three-day journey.\f + \fr 3:3 \ft Literally \fqa great city, a three-day journey\f* \v 4 On the first day of his journey, Jonah set out into the city and proclaimed, "Forty more days and Nineveh will be overturned!"`;
    const parser = new USFMParser({ silentConsole: true });
    parser.load(usfm).parse();
    const j1 = parser.toJSON();

    const para = (j1 as { content?: unknown[] }).content?.[0] as
      | { content: unknown[] }
      | undefined;
    const notes = para?.content?.filter(
      (n) => n && typeof n === 'object' && (n as { type?: string }).type === 'note'
    );
    expect(notes?.length).toBe(2);

    const back = convertUSJDocumentToUSFM(j1);
    expect(back).not.toMatch(/\\f\*\s*\\f\*/);
    expect(back).toContain(String.raw`\fqa was a great city to God\f*`);
    expect(back).toContain(String.raw`\fqa great city, a three-day journey\f*`);
    expect(back).toContain('requiring a three-day journey.');

    const p2 = new USFMParser({ silentConsole: true });
    p2.load(back).parse();
    expect(p2.toJSON()).toEqual(j1);
  });

  it('legacy \\+bd USFM parses like canonical and visitor drops the + prefix', () => {
    const parser = new USFMParser({ silentConsole: true });
    parser.load(footnoteFixture.alternateUsfmLegacyPlusPrefix).parse();
    const visitor = new USFMVisitor();
    parser.visit(visitor);
    expect(visitor.getResult()).toBe(footnoteFixture.canonicalUsfmFromVisitor);
    const j1 = parser.toJSON();
    parser.load(footnoteFixture.canonicalUsfmFromVisitor).parse();
    const j2 = parser.toJSON();
    expect(j2).toEqual(j1);
  });
});

describe('USJ root version → \\usfm marker', () => {
  it('emits \\usfm {version} after \\id when the USJ document has a version field', () => {
    const usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { code: 'JON', content: ['Autogenerated BSB by bsb2usfm'], type: 'book', marker: 'id' },
        { type: 'para', marker: 'h', content: ['Jonah'] },
        { type: 'para', marker: 'toc1', content: ['Jonah'] },
        { type: 'para', marker: 'toc2', content: ['Jonah'] },
        { type: 'para', marker: 'toc3', content: ['JON'] },
        { type: 'para', marker: 'mt2', content: ['Jonah'] },
        { type: 'para', marker: 'mt1', content: [] },
      ],
    };
    const result = convertUSJDocumentToUSFM(usj);
    // \usfm 3.1 must appear after \id and before \h
    expect(result).toMatch(/\\id\b[^\n]*\n\\usfm 3\.1\n\\h /);
    // Each para marker is present
    expect(result).toContain('\\h Jonah');
    expect(result).toContain('\\toc1 Jonah');
    expect(result).toContain('\\mt1');
  });

  it('omits \\usfm when the USJ document has no version field', () => {
    const usj = {
      type: 'USJ',
      content: [
        { code: 'GEN', content: [], type: 'book', marker: 'id' },
        { type: 'para', marker: 'h', content: ['Genesis'] },
      ],
    };
    const result = convertUSJDocumentToUSFM(usj);
    expect(result).not.toContain('\\usfm');
    expect(result).toContain('\\h Genesis');
  });

  it('roundtrips the full JON header block with exact fidelity (no double spaces, no trailing spaces)', () => {
    const original = [
      '\\id JON Autogenerated BSB by bsb2usfm',
      '\\usfm 3.1',
      '\\h Jonah',
      '\\toc1 Jonah',
      '\\toc2 Jonah',
      '\\toc3 JON',
      '\\mt2 Jonah',
      '\\mt1',
    ].join('\n');

    const p = new USFMParser({ silentConsole: true });
    p.load(original).parse();
    const usj = p.toJSON();
    const back = convertUSJDocumentToUSFM(usj);
    expect(back).toBe(original);
  });

  it('does not double-emit \\usfm when roundtripping USFM that already contains \\usfm', () => {
    // The parser absorbs \usfm into the root version field (not a content node),
    // so convertUSJDocumentToUSFM emits it exactly once from the version field.
    const p = new USFMParser({ silentConsole: true });
    p.load('\\id GEN\n\\usfm 3.1\n\\h Genesis').parse();
    const usj = p.toJSON();
    const back = convertUSJDocumentToUSFM(usj);
    const occurrences = (back.match(/\\usfm/g) || []).length;
    expect(occurrences).toBe(1);
    expect(back).toMatch(/\\usfm 3\.1/);
  });
});
