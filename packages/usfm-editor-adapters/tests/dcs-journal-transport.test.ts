import type { JournalEntry } from '@usfm-tools/editor-core';

import { createDcsJournalTransport } from '../src/dcs-journal-transport';

const sampleEntry = (id: string): JournalEntry => ({
  id,
  userId: 'u',
  timestamp: 1,
  sequence: 1,
  vectorClock: { u1: 1 },
  chapter: 1,
  layer: 'content',
  operations: [],
  baseSnapshotId: 'snap',
});

describe('createDcsJournalTransport', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('pullEntriesSince parses journal JSON from Gitea file response', async () => {
    const entries = [sampleEntry('a')];
    const b64 = Buffer.from(JSON.stringify(entries), 'utf8').toString('base64');
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: 'file', content: b64, sha: 'abc' }),
    }) as unknown as typeof fetch;

    const t = createDcsJournalTransport({
      baseUrl: 'https://example.com',
      token: 't',
      owner: 'o',
      repo: 'r',
      path: 'j/journal.json',
      branch: 'main',
    });

    const out = await t.pullEntriesSince({});
    expect(out).toEqual(entries);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/repos/o/r/contents/j/journal.json'),
      expect.any(Object)
    );
  });

  it('pushEntries PUTs base64-encoded JSON with branch and sha', async () => {
    const putJson = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ content: { sha: 'new' } }) });
    let call = 0;
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      call += 1;
      if (init?.method === 'PUT') return putJson();
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ type: 'file', content: Buffer.from('[]', 'utf8').toString('base64'), sha: 'old' }),
      });
    }) as unknown as typeof fetch;

    const t = createDcsJournalTransport({
      baseUrl: 'https://g.example',
      token: 'tok',
      owner: 'o',
      repo: 'r',
      path: 'x.json',
    });

    await t.pushEntries([sampleEntry('1')]);

    expect(putJson).toHaveBeenCalled();
    const putInit = (globalThis.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === 'PUT')?.[1];
    expect(putInit?.method).toBe('PUT');
    const body = JSON.parse(String(putInit?.body));
    expect(body.branch).toBe('main');
    expect(body.sha).toBe('old');
    expect(typeof body.content).toBe('string');
  });
});
