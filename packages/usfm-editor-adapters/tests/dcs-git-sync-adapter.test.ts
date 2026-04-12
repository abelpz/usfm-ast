import { DocumentStore } from '@usfm-tools/editor-core';

import { DcsGitSyncAdapter } from '../src/dcs-git-sync-adapter';

const SAMPLE_USFM = String.raw`\id MAT EN
\c 1
\p
\v 1 Hello.
`;

describe('DcsGitSyncAdapter', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('commit encodes USFM from store and sends PUT', async () => {
    const put = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commit: { sha: 'c1' } }),
    });
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return put();
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          content: Buffer.from(SAMPLE_USFM, 'utf8').toString('base64'),
          sha: 's0',
        }),
      });
    }) as unknown as typeof fetch;

    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(SAMPLE_USFM);

    const adapter = new DcsGitSyncAdapter({
      baseUrl: 'https://git.example',
      token: 't',
      owner: 'o',
      repo: 'r',
      path: 'b.usfm',
    });

    const rev = await adapter.commit(store, 'msg', []);
    expect(rev).toBe('c1');
    expect(put).toHaveBeenCalled();
    const putCall = (globalThis.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    const body = JSON.parse(String(putCall![1].body));
    expect(body.message).toBe('msg');
    expect(body.branch).toBe('main');
  });

  it('checkout returns decoded file text', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        content: Buffer.from('plain', 'utf8').toString('base64'),
        sha: 's',
      }),
    }) as unknown as typeof fetch;

    const adapter = new DcsGitSyncAdapter({
      baseUrl: 'https://git.example',
      token: 't',
      owner: 'o',
      repo: 'r',
      path: 'f.txt',
    });

    const text = await adapter.checkout('main');
    expect(text).toBe('plain');
  });
});
