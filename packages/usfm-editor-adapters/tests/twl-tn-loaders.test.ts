import { parseTnTsv, parseTwlTsv } from '../src/helps/twl-tn-loaders';

const TWL_SAMPLE = `Reference	ID	Tags	OrigWords	Occurrence	SupportReference
1:1	abc	kt	Παῦλος	1	rc://*/tw/dict/bible/names/paul
1:2	def	kt	δοῦλος	1	
`;

// unfoldingWord en_twl uses "TWLink" instead of "SupportReference"
const TWL_SAMPLE_UW = `Reference	ID	Tags	OrigWords	Occurrence	TWLink
1:1	abc	kt	\u05D3\u05B0\u05BC\u05D1\u05B7\u05E8	1	rc://*/tw/dict/bible/kt/wordofgod
1:2	def	name	\u05D9\u05D5\u05E0\u05D4	1	rc://*/tw/dict/bible/names/jonah
`;

const TN_SAMPLE = `Reference	ID	Tags	SupportReference	Quote	Occurrence	Note
1:1	n1	kt	rc://*/tw/dict/bible/kt/grace	χάρις	1	Gods grace
`;

describe('parseTwlTsv', () => {
  it('parses reference, origWords, occurrence, and support TW link', () => {
    const rows = parseTwlTsv(TWL_SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ref: { chapter: 1, verse: 1 },
      origWords: 'Παῦλος',
      occurrence: 1,
      resourceType: 'words-links',
    });
    expect(rows[0]!.links?.[0]).toMatchObject({ type: 'tw', id: 'bible/names/paul' });
    expect(rows[1]!.links).toBeUndefined();
  });

  it('accepts "TWLink" column name used by unfoldingWord en_twl repos', () => {
    const rows = parseTwlTsv(TWL_SAMPLE_UW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ref: { chapter: 1, verse: 1 }, resourceType: 'words-links' });
    // TWLink column should be parsed as the support reference → links resolved
    expect(rows[0]!.links?.[0]).toMatchObject({ type: 'tw', id: 'bible/kt/wordofgod' });
    expect(rows[1]!.links?.[0]).toMatchObject({ type: 'tw', id: 'bible/names/jonah' });
  });

  it('does not set content to the full pipe-joined row (standard TWL has no prose column)', () => {
    const rows = parseTwlTsv(TWL_SAMPLE);
    expect(rows[0]!.content).toBe('');
    expect(rows[0]!.content).not.toContain('|');
  });

  it('uses Note column as content when present', () => {
    const tsv = `Reference	ID	Tags	OrigWords	Occurrence	SupportReference	Note
1:1	x	kt	λόγος	1	rc://*/tw/dict/bible/kt/word	Short gloss here
`;
    const rows = parseTwlTsv(tsv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toBe('Short gloss here');
  });

  it('parses front:intro as book introduction', () => {
    const tsv = `Reference	ID	Tags	OrigWords	Occurrence	SupportReference
front:intro	x	kt	Title	1	
`;
    const rows = parseTwlTsv(tsv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ref).toEqual({ chapter: 0, verse: 0, segment: 'bookIntro' });
  });

  it('parses N:intro as chapter introduction', () => {
    const tsv = `Reference	ID	Tags	OrigWords	Occurrence	SupportReference
2:intro	x	kt	preface	1	
`;
    const rows = parseTwlTsv(tsv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ref).toEqual({ chapter: 2, verse: 0, segment: 'chapterIntro' });
  });

  it('keeps book intro TWL rows when OrigWords is empty but Note is present', () => {
    const tsv = `Reference	ID	Tags	OrigWords	Occurrence	SupportReference	Note
front:intro	x	kt		0		Intro prose only
`;
    const rows = parseTwlTsv(tsv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ref).toEqual({ chapter: 0, verse: 0, segment: 'bookIntro' });
    expect(rows[0]!.origWords).toBe('');
    expect(rows[0]!.content).toBe('Intro prose only');
  });
});

describe('parseTnTsv', () => {
  it('parses quote, note, and support link', () => {
    const rows = parseTnTsv(TN_SAMPLE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ref: { chapter: 1, verse: 1 },
      origWords: 'χάρις',
      occurrence: 1,
      content: 'Gods grace',
    });
    expect(rows[0]!.links?.[0]).toMatchObject({ type: 'tw' });
  });

  it('parses front:intro and chapter intro references', () => {
    const tsv = `Reference	ID	Tags	SupportReference	Quote	Occurrence	Note
front:intro	n0	kt		Opening	1	Book intro note
1:intro	n1	kt		Head	1	Ch1 intro
`;
    const rows = parseTnTsv(tsv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.ref).toEqual({ chapter: 0, verse: 0, segment: 'bookIntro' });
    expect(rows[1]!.ref).toEqual({ chapter: 1, verse: 0, segment: 'chapterIntro' });
  });

  it('keeps book/chapter intro TN rows when Quote is empty (unfoldingWord en_tn)', () => {
    const tsv = `Reference	ID	Tags	SupportReference	Quote	Occurrence	Note
front:intro	n0				0	Book intro body
1:intro	n1				0	Chapter intro body
`;
    const rows = parseTnTsv(tsv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.origWords).toBe('');
    expect(rows[0]!.content).toBe('Book intro body');
    expect(rows[0]!.occurrence).toBe(0);
    expect(rows[1]!.origWords).toBe('');
    expect(rows[1]!.content).toBe('Chapter intro body');
    expect(rows[1]!.occurrence).toBe(0);
  });
});
