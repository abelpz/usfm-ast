/**
 * Tests for repo-contents module (listRepoContents, getFileContent,
 * createRepoFile, updateRepoFile, createOrUpdateRepoFile, deleteRepoFile).
 */
import {
  listRepoContents,
  getFileContent,
  createRepoFile,
  updateRepoFile,
  createOrUpdateRepoFile,
  deleteRepoFile,
} from '../src/repo-contents';

function json(status: number, body: unknown): typeof fetch {
  return (_url: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);
}

// ---------------------------------------------------------------------------
// listRepoContents
// ---------------------------------------------------------------------------

const DIR_ENTRIES = [
  { name: 'README.md', path: 'README.md', type: 'file', sha: 'abc', size: 100 },
  { name: 'src', path: 'src', type: 'dir', sha: 'def', size: 0 },
];

describe('listRepoContents', () => {
  it('parses array response', async () => {
    const result = await listRepoContents({
      owner: 'org',
      repo: 'repo',
      fetch: json(200, DIR_ENTRIES),
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('README.md');
    expect(result[0]!.type).toBe('file');
    expect(result[1]!.type).toBe('dir');
  });

  it('wraps single object in array', async () => {
    const result = await listRepoContents({
      owner: 'org',
      repo: 'repo',
      path: 'README.md',
      fetch: json(200, DIR_ENTRIES[0]),
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('README.md');
  });

  it('throws on non-ok status', async () => {
    await expect(
      listRepoContents({ owner: 'org', repo: 'repo', fetch: json(404, { message: 'Not Found' }) }),
    ).rejects.toThrow('404');
  });

  it('throws on unexpected response shape', async () => {
    await expect(
      listRepoContents({ owner: 'org', repo: 'repo', fetch: json(200, 'unexpected-string') }),
    ).rejects.toThrow('Invalid Door43 contents response');
  });

  it('normalizes Gitea symlink and submodule types', async () => {
    const mixed = [
      ...DIR_ENTRIES,
      { name: 'link', path: 'link', type: 'symlink', sha: 's1', size: 12 },
      { name: 'sub', path: 'sub', type: 'submodule', sha: 's2', size: 0 },
    ];
    const result = await listRepoContents({
      owner: 'org',
      repo: 'repo',
      fetch: json(200, mixed),
    });
    expect(result).toHaveLength(4);
    expect(result.find((e) => e.name === 'link')!.type).toBe('file');
    expect(result.find((e) => e.name === 'sub')!.type).toBe('dir');
  });
});

// ---------------------------------------------------------------------------
// getFileContent
// ---------------------------------------------------------------------------

function base64Utf8(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

const FILE_RESPONSE = {
  name: 'en_ult.usfm',
  path: 'content/en_ult.usfm',
  type: 'file',
  sha: 'sha123',
  content: base64Utf8('\\id TIT\n\\c 1\n'),
  encoding: 'base64',
};

describe('getFileContent', () => {
  it('decodes base64 content', async () => {
    const result = await getFileContent({
      owner: 'org',
      repo: 'repo',
      path: 'content/en_ult.usfm',
      fetch: json(200, FILE_RESPONSE),
    });
    expect(result.content).toBe('\\id TIT\n\\c 1\n');
    expect(result.sha).toBe('sha123');
    expect(result.name).toBe('en_ult.usfm');
    expect(result.path).toBe('content/en_ult.usfm');
  });

  it('throws on non-ok status', async () => {
    await expect(
      getFileContent({ owner: 'org', repo: 'repo', path: 'x', fetch: json(404, {}) }),
    ).rejects.toThrow('404');
  });

  it('throws when type is not file', async () => {
    await expect(
      getFileContent({
        owner: 'org',
        repo: 'repo',
        path: 'src',
        fetch: json(200, { ...FILE_RESPONSE, type: 'dir' }),
      }),
    ).rejects.toThrow('not a file');
  });

  it('throws when encoding is not base64', async () => {
    await expect(
      getFileContent({
        owner: 'org',
        repo: 'repo',
        path: 'x',
        fetch: json(200, { ...FILE_RESPONSE, encoding: 'utf-8' }),
      }),
    ).rejects.toThrow('Unexpected content encoding');
  });
});

// ---------------------------------------------------------------------------
// createRepoFile
// ---------------------------------------------------------------------------

const WRITE_RESPONSE = {
  content: { sha: 'new-sha' },
  commit: { sha: 'commit-sha', url: 'https://git.door43.org/commit/abc' },
};

describe('createRepoFile', () => {
  it('creates a file and returns write result', async () => {
    const result = await createRepoFile({
      token: 'tok',
      owner: 'org',
      repo: 'repo',
      path: 'content/file.usfm',
      content: '\\id GEN',
      message: 'add file',
      fetch: json(201, WRITE_RESPONSE),
    });
    expect(result.content.sha).toBe('new-sha');
    expect(result.commit.sha).toBe('commit-sha');
  });

  it('throws on non-ok status', async () => {
    await expect(
      createRepoFile({
        token: 'tok',
        owner: 'org',
        repo: 'repo',
        path: 'x',
        content: '',
        message: 'msg',
        fetch: json(422, { message: 'already exists' }),
      }),
    ).rejects.toThrow('422');
  });
});

// ---------------------------------------------------------------------------
// updateRepoFile
// ---------------------------------------------------------------------------

describe('updateRepoFile', () => {
  it('updates a file via PUT', async () => {
    let capturedMethod: string | undefined;
    const capFetch: typeof fetch = (_url, init) => {
      capturedMethod = init?.method;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(WRITE_RESPONSE),
        text: () => Promise.resolve(JSON.stringify(WRITE_RESPONSE)),
      } as Response);
    };

    const result = await updateRepoFile({
      token: 'tok',
      owner: 'org',
      repo: 'repo',
      path: 'file.usfm',
      content: 'updated',
      message: 'update',
      sha: 'existing-sha',
      fetch: capFetch,
    });

    expect(capturedMethod).toBe('PUT');
    expect(result.content.sha).toBe('new-sha');
  });
});

// ---------------------------------------------------------------------------
// createOrUpdateRepoFile
// ---------------------------------------------------------------------------

describe('createOrUpdateRepoFile', () => {
  it('goes straight to PUT when sha is provided', async () => {
    let capturedMethod: string | undefined;
    const capFetch: typeof fetch = (_url, init) => {
      capturedMethod = init?.method;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(WRITE_RESPONSE),
        text: () => Promise.resolve(JSON.stringify(WRITE_RESPONSE)),
      } as Response);
    };

    await createOrUpdateRepoFile({
      token: 'tok',
      owner: 'org',
      repo: 'repo',
      path: 'file.usfm',
      content: 'updated',
      message: 'update',
      sha: 'existing-sha',
      fetch: capFetch,
    });

    expect(capturedMethod).toBe('PUT');
  });

  it('tries POST first when sha is absent', async () => {
    let firstMethod: string | undefined;
    const capFetch: typeof fetch = (_url, init) => {
      if (!firstMethod) firstMethod = init?.method;
      return Promise.resolve({
        ok: true,
        status: 201,
        statusText: 'Created',
        json: () => Promise.resolve(WRITE_RESPONSE),
        text: () => Promise.resolve(JSON.stringify(WRITE_RESPONSE)),
      } as Response);
    };

    await createOrUpdateRepoFile({
      token: 'tok',
      owner: 'org',
      repo: 'repo',
      path: 'new-file.usfm',
      content: 'hello',
      message: 'create',
      fetch: capFetch,
    });

    expect(firstMethod).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// deleteRepoFile
// ---------------------------------------------------------------------------

describe('deleteRepoFile', () => {
  it('calls DELETE and resolves on success', async () => {
    let capturedMethod: string | undefined;
    const capFetch: typeof fetch = (_url, init) => {
      capturedMethod = init?.method;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{}'),
      } as Response);
    };

    await expect(
      deleteRepoFile({
        token: 'tok',
        owner: 'org',
        repo: 'repo',
        path: 'file.usfm',
        fileSha: 'sha123',
        message: 'delete',
        fetch: capFetch,
      }),
    ).resolves.toBeUndefined();

    expect(capturedMethod).toBe('DELETE');
  });

  it('throws on non-ok status', async () => {
    await expect(
      deleteRepoFile({
        token: 'tok',
        owner: 'org',
        repo: 'repo',
        path: 'file.usfm',
        fileSha: 'sha123',
        message: 'delete',
        fetch: json(403, { message: 'Forbidden' }),
      }),
    ).rejects.toThrow('403');
  });
});
