/**
 * Tests for the releases module (createDcsRelease, listDcsReleases).
 */
import { createDcsRelease, listDcsReleases } from '../src/releases';

function makeFetch(status: number, body: unknown): typeof fetch {
  return (_url: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response);
}

const FAKE_RELEASE = {
  id: 42,
  tag_name: 'v1.0.0',
  name: 'Version 1.0.0',
  html_url: 'https://git.door43.org/unfoldingWord/en_ult/releases/tag/v1.0.0',
  published_at: '2024-01-01T00:00:00Z',
  draft: false,
};

describe('createDcsRelease', () => {
  it('creates a release and returns mapped fields', async () => {
    const result = await createDcsRelease({
      host: 'git.door43.org',
      token: 'test-token',
      owner: 'unfoldingWord',
      repo: 'en_ult',
      tag: 'v1.0.0',
      name: 'Version 1.0.0',
      fetch: makeFetch(201, FAKE_RELEASE),
    });

    expect(result.id).toBe(42);
    expect(result.tagName).toBe('v1.0.0');
    expect(result.name).toBe('Version 1.0.0');
    expect(result.htmlUrl).toBe('https://git.door43.org/unfoldingWord/en_ult/releases/tag/v1.0.0');
    expect(result.isDraft).toBe(false);
  });

  it('includes optional body in the request', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedBody: any = null;
    const capturingFetch: typeof fetch = (_url, init) => {
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        statusText: 'Created',
        json: () => Promise.resolve(FAKE_RELEASE),
        text: () => Promise.resolve(JSON.stringify(FAKE_RELEASE)),
      } as Response);
    };

    await createDcsRelease({
      token: 'tok',
      owner: 'org',
      repo: 'repo',
      tag: 'v2.0.0',
      name: 'v2',
      body: 'Changelog entry',
      fetch: capturingFetch,
    });

    expect(capturedBody?.body).toBe('Changelog entry');
  });

  it('throws on non-ok response', async () => {
    await expect(
      createDcsRelease({
        token: 'tok',
        owner: 'org',
        repo: 'repo',
        tag: 'v1',
        name: 'v1',
        fetch: makeFetch(403, { message: 'Forbidden' }),
      }),
    ).rejects.toThrow('403');
  });

  it('sends isDraft and isPrerelease flags', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let captured: any = null;
    const capFetch: typeof fetch = (_url, init) => {
      captured = JSON.parse(init!.body as string) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        status: 201,
        statusText: 'Created',
        json: () => Promise.resolve({ ...FAKE_RELEASE, draft: true }),
        text: () => Promise.resolve(JSON.stringify({ ...FAKE_RELEASE, draft: true })),
      } as Response);
    };

    const result = await createDcsRelease({
      token: 'tok',
      owner: 'org',
      repo: 'repo',
      tag: 'v1-draft',
      name: 'Draft',
      isDraft: true,
      isPrerelease: true,
      fetch: capFetch,
    });

    expect(captured?.draft).toBe(true);
    expect(captured?.prerelease).toBe(true);
    expect(result.isDraft).toBe(true);
  });
});

describe('listDcsReleases', () => {
  it('returns an array of mapped releases', async () => {
    const releases = await listDcsReleases({
      owner: 'unfoldingWord',
      repo: 'en_ult',
      fetch: makeFetch(200, [FAKE_RELEASE, { ...FAKE_RELEASE, id: 43, tag_name: 'v0.9.0' }]),
    });

    expect(releases).toHaveLength(2);
    expect(releases[0]!.tagName).toBe('v1.0.0');
    expect(releases[1]!.tagName).toBe('v0.9.0');
  });

  it('returns empty array when response is not an array', async () => {
    const releases = await listDcsReleases({
      owner: 'org',
      repo: 'repo',
      fetch: makeFetch(200, { unexpected: true }),
    });
    expect(releases).toEqual([]);
  });

  it('throws on non-ok response', async () => {
    await expect(
      listDcsReleases({
        owner: 'org',
        repo: 'repo',
        fetch: makeFetch(404, { message: 'Not Found' }),
      }),
    ).rejects.toThrow('404');
  });

  it('skips array elements that are not objects', async () => {
    const releases = await listDcsReleases({
      owner: 'org',
      repo: 'repo',
      fetch: makeFetch(200, [FAKE_RELEASE, null, 'string', 123]),
    });
    expect(releases).toHaveLength(1);
    expect(releases[0]!.id).toBe(42);
  });
});
