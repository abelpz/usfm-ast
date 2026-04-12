/**
 * Live Door43 / Gitea API read tests. Requires `.env.door43` (see repo `.env.door43.example`).
 */

import { createDcsJournalTransport, DcsGitSyncAdapter } from '@usfm-tools/editor-adapters';
import { getDoor43Config, shouldRunDoor43ReadTests } from '../helpers/door43-env';

const describeDoor43 = shouldRunDoor43ReadTests() ? describe : describe.skip;

describeDoor43('Door43 DCS read integration', () => {
  const cfg = getDoor43Config()!;

  it('authenticates via GET /api/v1/user', async () => {
    const res = await fetch(`${cfg.baseUrl}/api/v1/user`, {
      headers: {
        Authorization: `token ${cfg.token}`,
        Accept: 'application/json',
      },
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { login?: string };
    expect(j.login).toBeTruthy();
  });

  it('resolves repository metadata', async () => {
    const url = `${cfg.baseUrl}/api/v1/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${cfg.token}`,
        Accept: 'application/json',
      },
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { name?: string; default_branch?: string };
    expect(j.name).toBe(cfg.repo);
  });

  it('reads journal path via createDcsJournalTransport (pullEntriesSince)', async () => {
    const transport = createDcsJournalTransport({
      baseUrl: cfg.baseUrl,
      token: cfg.token,
      owner: cfg.owner,
      repo: cfg.repo,
      branch: cfg.branch,
      path: cfg.journalPath,
    });
    const entries = await transport.pullEntriesSince({});
    expect(Array.isArray(entries)).toBe(true);
  });

  it('reads USFM path when DOOR43_USFM_PATH is set', async () => {
    if (!cfg.usfmPath) {
      expect(true).toBe(true);
      return;
    }
    const adapter = new DcsGitSyncAdapter({
      baseUrl: cfg.baseUrl,
      token: cfg.token,
      owner: cfg.owner,
      repo: cfg.repo,
      branch: cfg.branch,
      path: cfg.usfmPath,
    });
    const text = await adapter.checkout(cfg.branch);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThanOrEqual(0);
  });
});
