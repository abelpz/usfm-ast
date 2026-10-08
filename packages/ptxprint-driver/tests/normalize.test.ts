import { USFMParser } from '@usfm-tools/parser';

import { normalizeToUsfm } from '../src/normalize/normalizeToUsfm';

describe('normalizeToUsfm', () => {
  it('passes through USFM', () => {
    const s = '\\id JHN\n\\c 1\n';
    expect(normalizeToUsfm({ format: 'usfm', text: s })).toMatch(/\\id JHN/);
  });

  it('converts USJ to USFM via parser round-trip shape', () => {
    const parser = new USFMParser();
    parser.parse('\\id JHN\n\\c 1\n\\p\n\\v 1 One.\n');
    const usj = parser.toJSON();
    const u = normalizeToUsfm({ format: 'usj', usj });
    expect(u).toMatch(/\\id\s+JHN/);
    expect(u).toMatch(/\\v\s+1/);
  });

  it('converts USX to USFM', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
<book code="JHN" style="id">JHN </book>
<chapter number="1" style="c" />
<para style="p">
<verse number="1" style="v" />Hello.
</para>
</usx>`;
    const u = normalizeToUsfm({ format: 'usx', xml });
    expect(u).toMatch(/\\id\s+JHN/);
    expect(u).toMatch(/\\c\s+1/);
  });
});
