import { parseUsxToUsjDocument, usjDocumentToUsx } from '../src/usx';

describe('USX ↔ USJ via USFM bridge', () => {
  const sample = `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="MRK" style="id">EN unfoldingWord® Simplified Text</book>
  <chapter number="1" style="c" sid="MRK 1" />
  <para style="p">
    <verse number="1" style="v" sid="MRK 1:1" />
    This is the Good News about Jesus Christ, the Son of God.
  </para>
</usx>
`;

  it('parseUsxToUsjDocument produces book + chapter + para', () => {
    const usj = parseUsxToUsjDocument(sample);
    expect(usj.type).toBe('USJ');
    expect(Array.isArray(usj.content)).toBe(true);
    const types = (usj.content as { type?: string }[]).map((n) => n?.type);
    expect(types).toContain('book');
    expect(types).toContain('chapter');
    expect(types).toContain('para');
  });

  it('usjDocumentToUsx emits well-formed USX', () => {
    const usj = parseUsxToUsjDocument(sample);
    const usx = usjDocumentToUsx(usj);
    expect(usx).toContain('<usx');
    expect(usx).toContain('</usx>');
    const round = parseUsxToUsjDocument(usx);
    expect(round.type).toBe('USJ');
    expect((round.content as unknown[]).length).toBeGreaterThan(0);
  });
});
