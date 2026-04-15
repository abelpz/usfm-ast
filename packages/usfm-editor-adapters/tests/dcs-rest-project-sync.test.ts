import { DcsRestProjectSync, gitBlobShaHex } from '../src/storage/dcs-rest-project-sync';

describe('gitBlobShaHex', () => {
  it('matches git blob SHA for UTF-8 content', async () => {
    const sha = await gitBlobShaHex('hello\n');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    const again = await gitBlobShaHex('hello\n');
    expect(again).toBe(sha);
  });
});

describe('DcsRestProjectSync', () => {
  it('ensureRemoteRepo returns created false when repo exists', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        full_name: 'u/r',
        name: 'r',
        html_url: 'https://h/u/r',
        owner: { login: 'u' },
        default_branch: 'main',
        empty: false,
      }),
    });
    const sync = new DcsRestProjectSync({
      host: 'git.door43.org',
      token: 't',
      owner: 'u',
      repo: 'r',
      branch: 'main',
      targetType: 'user',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const out = await sync.ensureRemoteRepo();
    expect(out.created).toBe(false);
    expect(out.owner).toBe('u');
    expect(out.repo).toBe('r');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
