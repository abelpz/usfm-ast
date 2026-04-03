import path from 'path';
import { USFMParser } from '../src';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const footnoteFixture = require(path.join(__dirname, 'fixtures/usfm/footnote.js')) as {
  noteNestedBdInFqa: Record<string, unknown>;
  canonicalUsfmFromVisitor: string;
  alternateUsfmLegacyPlusPrefix: string;
};

/**
 * Round-trip USJ ↔ USFM for this fixture is covered in `@usfm-tools/adapters`
 * (`footnote-nested-bd-roundtrip.test.ts`). Here we assert the fixture parses
 * and matches the expected note subtree.
 */
describe('fixtures/usfm/footnote.js (nested \\bd in \\fqa)', () => {
  it('parses canonical and alternate USFM to the same USJ note', () => {
    const p1 = new USFMParser({ silentConsole: true });
    p1.load(footnoteFixture.canonicalUsfmFromVisitor).parse();
    const n1 = (p1.toJSON() as { content: Array<{ content: unknown[] }> }).content[0].content[0];

    const p2 = new USFMParser({ silentConsole: true });
    p2.load(footnoteFixture.alternateUsfmLegacyPlusPrefix).parse();
    const n2 = (p2.toJSON() as { content: Array<{ content: unknown[] }> }).content[0].content[0];

    expect(n1).toEqual(footnoteFixture.noteNestedBdInFqa);
    expect(n2).toEqual(n1);
  });
});
