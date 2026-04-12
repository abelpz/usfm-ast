import {
  convertUSJDocumentToUSFM,
  parseUsxToUsjDocument,
  usjDocumentToUsx,
} from '../src/index';

describe('@usfm-tools/editor-adapters', () => {
  it('re-exports convertUSJDocumentToUSFM', () => {
    const usfm = convertUSJDocumentToUSFM({
      type: 'USJ',
      version: '3.1',
      content: [],
    } as Parameters<typeof convertUSJDocumentToUSFM>[0]);
    expect(typeof usfm).toBe('string');
  });

  it('round-trips minimal USX through USJ', () => {
    const usx = `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="TIT" style="id"/>
  <para style="mt">Titus</para>
</usx>`;
    const usj = parseUsxToUsjDocument(usx);
    expect(usj.type).toBe('USJ');
    const back = usjDocumentToUsx(usj);
    expect(back).toContain('usx');
    expect(back).toContain('Titus');
  });
});
