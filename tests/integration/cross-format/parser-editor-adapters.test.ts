/**
 * Cross-package checks: published `dist` entries must resolve (run after `bun run build` or use `bun run test:integration`).
 */
import { convertUSJDocumentToUSFM, parseUsxToUsjDocument } from '@usfm-tools/editor-adapters';
import { USFMParser } from '@usfm-tools/parser';

describe('integration: parser + editor-adapters', () => {
  it('round-trips sample USFM through parser JSON and convertUSJDocumentToUSFM', () => {
    const usfm = String.raw`\id TIT EN
\c 1
\p
\v 1 Hello.`;
    const parser = new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON();
    const out = convertUSJDocumentToUSFM(usj as Parameters<typeof convertUSJDocumentToUSFM>[0]);
    expect(out).toMatch(/\\id/);
    expect(out).toMatch(/\\c\s*1/);
    expect(out).toContain('Hello.');
  });

  it('parses USX via editor-adapters then emits USFM', () => {
    const usx = `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="TIT" style="id"/>
  <para style="mt">Titus</para>
</usx>`;
    const usj = parseUsxToUsjDocument(usx);
    expect(usj.type).toBe('USJ');
    const usfm = convertUSJDocumentToUSFM(usj as Parameters<typeof convertUSJDocumentToUSFM>[0]);
    expect(usfm).toMatch(/\\id/);
    expect(usfm).toContain('Titus');
  });
});
