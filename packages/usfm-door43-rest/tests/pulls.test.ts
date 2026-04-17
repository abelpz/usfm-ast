/**
 * Tests for mergePullRequestOrCloseIfNothingToMerge and compare-related helpers.
 */
import {
  closePullRequest,
  compareRefs,
  getPullRequest,
  mergePullRequestOrCloseIfNothingToMerge,
} from '../src/pulls';

function jsonResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
  } as Response;
}

describe('compareRefs', () => {
  it('parses total_commits from compare response', async () => {
    const fetchFn: typeof fetch = (url) => {
      expect(String(url)).toContain('/compare/');
      return Promise.resolve(
        jsonResponse(200, {
          total_commits: 0,
          commits: [],
          ahead_by: 0,
          behind_by: 2,
        }),
      );
    };
    const r = await compareRefs({
      token: 't',
      owner: 'o',
      repo: 'r',
      base: 'tit',
      head: 'u/tit',
      fetch: fetchFn,
    });
    expect(r.totalCommits).toBe(0);
    expect(r.aheadBy).toBe(0);
    expect(r.behindBy).toBe(2);
  });
});

describe('mergePullRequestOrCloseIfNothingToMerge', () => {
  it('returns merged true when merge API succeeds', async () => {
    let mergeCalls = 0;
    const fetchFn: typeof fetch = (url, init) => {
      const u = String(url);
      if (u.includes('/merge') && init?.method === 'POST') {
        mergeCalls += 1;
        return Promise.resolve(jsonResponse(200, {}));
      }
      return Promise.resolve(jsonResponse(404, {}));
    };

    const r = await mergePullRequestOrCloseIfNothingToMerge({
      token: 'tok',
      owner: 'o',
      repo: 'r',
      index: 3,
      baseRef: 'tit',
      headRef: 'u/tit',
      fetch: fetchFn,
    });

    expect(mergeCalls).toBe(1);
    expect(r.merged).toBe(true);
  });

  it('closes the PR and returns merged true when compare has nothing to integrate', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = (url, init) => {
      const u = String(url);
      if (u.includes('/pulls/3/merge') && init?.method === 'POST') {
        calls.push('merge');
        return Promise.resolve(jsonResponse(409, { message: 'not mergeable' }));
      }
      if (u.includes('/compare/')) {
        calls.push('compare');
        return Promise.resolve(
          jsonResponse(200, {
            total_commits: 0,
            commits: [],
            ahead_by: 0,
            behind_by: 0,
          }),
        );
      }
      if (u.includes('/pulls/3') && init?.method === 'PATCH') {
        calls.push('close');
        return Promise.resolve(jsonResponse(200, { state: 'closed' }));
      }
      if (u.includes('/pulls/3')) {
        calls.push('getPr');
        return Promise.resolve(
          jsonResponse(200, {
            number: 3,
            title: 't',
            state: 'open',
            html_url: 'https://git.door43.org/o/r/pulls/3',
            mergeable: false,
            merged: false,
            head: { label: '', ref: 'u/tit', sha: 'a' },
            base: { label: '', ref: 'tit', sha: 'b' },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    };

    const r = await mergePullRequestOrCloseIfNothingToMerge({
      token: 'tok',
      owner: 'o',
      repo: 'r',
      index: 3,
      baseRef: 'tit',
      headRef: 'u/tit',
      fetch: fetchFn,
    });

    expect(r.merged).toBe(true);
    expect(calls).toContain('compare');
    expect(calls).toContain('close');
  });

  it('returns merged false when compare shows commits remaining', async () => {
    const fetchFn: typeof fetch = (url, init) => {
      const u = String(url);
      if (u.includes('/merge') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(409, { message: 'conflict' }));
      }
      if (u.includes('/compare/')) {
        return Promise.resolve(
          jsonResponse(200, {
            total_commits: 2,
            commits: [{}, {}],
            ahead_by: 2,
            behind_by: 0,
          }),
        );
      }
      if (u.includes('/pulls/7')) {
        return Promise.resolve(
          jsonResponse(200, {
            number: 7,
            title: 't',
            state: 'open',
            html_url: 'https://git.door43.org/o/r/pulls/7',
            mergeable: false,
            merged: false,
            head: { label: '', ref: 'h', sha: 'a' },
            base: { label: '', ref: 'b', sha: 'c' },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    };

    const r = await mergePullRequestOrCloseIfNothingToMerge({
      token: 'tok',
      owner: 'o',
      repo: 'r',
      index: 7,
      baseRef: 'main',
      headRef: 'tit',
      fetch: fetchFn,
    });

    expect(r.merged).toBe(false);
  });

  it('returns merged true if GET shows PR already merged', async () => {
    const fetchFn: typeof fetch = (url, init) => {
      const u = String(url);
      if (u.includes('/merge') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(409, {}));
      }
      if (u.includes('/pulls/9') && !u.includes('/merge')) {
        return Promise.resolve(
          jsonResponse(200, {
            number: 9,
            title: 't',
            state: 'closed',
            html_url: 'https://git.door43.org/o/r/pulls/9',
            mergeable: false,
            merged: true,
            head: { label: '', ref: 'h', sha: 'a' },
            base: { label: '', ref: 'b', sha: 'c' },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    };

    const r = await mergePullRequestOrCloseIfNothingToMerge({
      token: 'tok',
      owner: 'o',
      repo: 'r',
      index: 9,
      baseRef: 'tit',
      headRef: 'u/tit',
      fetch: fetchFn,
    });

    expect(r.merged).toBe(true);
  });
});

describe('getPullRequest / closePullRequest', () => {
  it('getPullRequest maps merged', async () => {
    const pr = await getPullRequest({
      token: 't',
      owner: 'o',
      repo: 'r',
      index: 1,
      fetch: () =>
        Promise.resolve(
          jsonResponse(200, {
            number: 1,
            title: 'x',
            state: 'closed',
            html_url: 'https://h/o/r/pulls/1',
            mergeable: false,
            merged: true,
            head: { label: '', ref: 'a', sha: 's' },
            base: { label: '', ref: 'b', sha: 't' },
          }),
        ),
    });
    expect(pr.merged).toBe(true);
  });

  it('closePullRequest PATCHes state closed', async () => {
    let method: string | undefined;
    let body: string | undefined;
    await closePullRequest({
      token: 't',
      owner: 'o',
      repo: 'r',
      index: 2,
      fetch: (_u, init) => {
        method = init?.method;
        body = init?.body as string;
        return Promise.resolve(jsonResponse(200, {}));
      },
    });
    expect(method).toBe('PATCH');
    expect(body).toContain('closed');
  });
});
