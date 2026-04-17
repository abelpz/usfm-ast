import {
  ensureRepoUsesMainDefaultBranch,
  getRepoInfo,
  listRepoGitTree,
  listUserOrgs,
} from '@usfm-tools/door43-rest';

describe('@usfm-tools/door43-rest repo-manage', () => {
  it('getRepoInfo returns null on 404', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    const r = await getRepoInfo({
      host: 'git.door43.org',
      owner: 'nobody',
      repo: 'missing',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(r).toBeNull();
  });

  it('listUserOrgs parses array', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [
        { username: 'z_org', full_name: 'Z' },
        { username: 'a_org', full_name: 'A' },
      ],
    });
    const orgs = await listUserOrgs({
      host: 'git.door43.org',
      token: 'tok',
      pageSize: 100,
      maxPages: 1,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(orgs.map((o: { username: string }) => o.username)).toEqual(['a_org', 'z_org']);
  });

  it('listRepoGitTree retries branch from default_branch when ref is missing', async () => {
    const seq = [
      { ok: false, status: 404, json: async () => ({}) },
      {
        ok: true,
        status: 200,
        json: async () => ({
          full_name: 'o/r',
          name: 'r',
          html_url: 'https://git.door43.org/o/r',
          owner: { login: 'o' },
          default_branch: 'master',
        }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({
          commit: { tree: { sha: 'tree-root' } },
        }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({ tree: [] as unknown[] }),
      },
    ];
    let n = 0;
    const fetchMock = jest.fn().mockImplementation(() => {
      const r = seq[n++]!;
      return Promise.resolve({
        ok: r.ok,
        status: r.status,
        statusText: r.ok ? 'OK' : 'Not Found',
        json: r.json,
      });
    });
    const out = await listRepoGitTree({
      host: 'git.door43.org',
      token: 'tok',
      owner: 'o',
      repo: 'r',
      ref: 'main',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(out).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/branches/main');
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/repos/o/r');
    expect(String(fetchMock.mock.calls[2]![0])).toContain('/branches/master');
    expect(String(fetchMock.mock.calls[3]![0])).toContain('/git/trees/tree-root');
  });

  it('listRepoGitTree resolves tree via git/commits when branch payload omits commit.tree', async () => {
    const oid = 'a'.repeat(40);
    const seq = [
      {
        ok: true,
        status: 200,
        json: async () => ({
          commit: { id: oid, message: 'init' },
        }),
      },
      { ok: false, status: 404, json: async () => ({}) },
      {
        ok: true,
        status: 200,
        json: async () => ({
          sha: oid,
          commit: {
            message: 'init',
            tree: { sha: 'tree-root', url: 'https://example/git/trees/tree-root' },
          },
        }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({ tree: [] as unknown[] }),
      },
    ];
    let n = 0;
    const fetchMock = jest.fn().mockImplementation(() => {
      const r = seq[n++]!;
      return Promise.resolve({
        ok: r.ok,
        status: r.status,
        statusText: 'OK',
        json: r.json,
      });
    });
    const out = await listRepoGitTree({
      host: 'git.door43.org',
      token: 'tok',
      owner: 'o',
      repo: 'r',
      ref: 'main',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(out).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/branches/main');
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/commits/main');
    expect(String(fetchMock.mock.calls[2]![0])).toContain(`/git/commits/${oid}`);
    expect(String(fetchMock.mock.calls[3]![0])).toContain('/git/trees/tree-root');
  });

  it('listRepoGitTree resolves root tree sha from commit.tree.url when tree.sha is absent', async () => {
    const treeOid = 'b'.repeat(40);
    const seq = [
      {
        ok: true,
        status: 200,
        json: async () => ({
          commit: {
            id: 'a'.repeat(40),
            tree: {
              url: `https://git.door43.org/api/v1/repos/o/r/git/trees/${treeOid}`,
            },
          },
        }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({ tree: [] as unknown[] }),
      },
    ];
    let n = 0;
    const fetchMock = jest.fn().mockImplementation(() => {
      const r = seq[n++]!;
      return Promise.resolve({
        ok: r.ok,
        status: r.status,
        statusText: 'OK',
        json: r.json,
      });
    });
    const out = await listRepoGitTree({
      host: 'git.door43.org',
      token: 'tok',
      owner: 'o',
      repo: 'r',
      ref: 'main',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(out).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/branches/main');
    expect(String(fetchMock.mock.calls[1]![0])).toContain(`/git/trees/${treeOid}`);
  });

  it('ensureRepoUsesMainDefaultBranch creates main from default and PATCHes default', async () => {
    const seq = [
      {
        ok: true,
        status: 200,
        json: async () => ({
          full_name: 'o/r',
          name: 'r',
          html_url: 'https://git.door43.org/o/r',
          owner: { login: 'o' },
          default_branch: 'master',
          empty: false,
        }),
      },
      { ok: false, status: 404, json: async () => ({}) },
      { ok: true, status: 201, json: async () => ({}) },
      { ok: true, status: 200, json: async () => ({ commit: { tree: { sha: 'root' } } }) },
      { ok: true, status: 200, json: async () => ({}) },
    ];
    let n = 0;
    const fetchMock = jest.fn().mockImplementation(() => {
      const r = seq[n++]!;
      return Promise.resolve({
        ok: r.ok,
        status: r.status,
        statusText: r.ok ? 'OK' : 'Not Found',
        json: r.json,
      });
    });
    const out = await ensureRepoUsesMainDefaultBranch({
      host: 'git.door43.org',
      token: 'tok',
      owner: 'o',
      repo: 'r',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(out).toEqual({ changed: true, previousDefault: 'master' });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/branches/main');
    expect(String(fetchMock.mock.calls[2]![0])).toContain('/branches');
    expect(String(fetchMock.mock.calls[2]![0])).not.toContain('/branches/main');
    expect(String(fetchMock.mock.calls[4]![0])).toMatch(/\/repos\/o\/r$/);
  });
});
