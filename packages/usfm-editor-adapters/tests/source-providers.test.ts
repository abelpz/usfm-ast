import { FileSourceTextProvider } from '../src/source-providers';

const MIN_USFM = String.raw`\id TIT EN
\c 1
\p
\v 1 One.
`;

describe('FileSourceTextProvider', () => {
  it('loads USFM from a File', async () => {
    const file = new File([MIN_USFM], 'book.usfm', { type: 'text/plain' });
    const p = new FileSourceTextProvider(file);
    const doc = await p.load();
    expect(doc.type).toBe('USJ');
    expect(p.id).toBe('file');
  });

  it('loads USJ from .json file', async () => {
    const usj = { type: 'USJ', content: [] };
    const file = new File([JSON.stringify(usj)], 'x.json', { type: 'application/json' });
    const doc = await new FileSourceTextProvider(file).load();
    expect(doc.type).toBe('USJ');
  });

  it('loads USX from .usx file', async () => {
    const usx = `<?xml version="1.0" encoding="UTF-8"?>
<usx version="3.0">
  <book code="TIT" style="id"/>
  <chapter number="1" style="c"/>
  <para style="p">
    <verse number="1" style="v"/>One.
  </para>
</usx>`;
    const file = new File([usx], 'book.usx', { type: 'application/xml' });
    const doc = await new FileSourceTextProvider(file).load();
    expect(doc.type).toBe('USJ');
  });
});

describe('DcsSourceTextProvider', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('fetches and parses USFM from Gitea contents JSON', async () => {
    const { DcsSourceTextProvider } = await import('../src/source-providers');
    const b64 = Buffer.from(MIN_USFM, 'utf8').toString('base64');
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: b64, name: 'f.usfm' }),
    }) as unknown as typeof fetch;

    const p = new DcsSourceTextProvider({
      baseUrl: 'https://d.example',
      owner: 'o',
      repo: 'r',
      filePath: 'f.usfm',
    });
    const doc = await p.load();
    expect(doc.type).toBe('USJ');
  });
});
