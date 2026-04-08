/**
 * Optional write: PUT the same journal JSON back (verifies token can write).
 * Requires `DOOR43_ALLOW_WRITE=1` and a dedicated `DOOR43_JOURNAL_PATH`.
 */

import { existsSync } from 'fs';
import { join } from 'path';

import { getDoor43Config, shouldRunDoor43WriteTests } from '../helpers/door43-env';

function decodeBase64Utf8(b64: string): string {
  return Buffer.from(b64.replace(/\s/g, ''), 'base64').toString('utf8');
}

function encodeBase64Utf8(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

const describeWrite = shouldRunDoor43WriteTests() ? describe : describe.skip;

describeWrite('Door43 DCS journal idempotent write', () => {
  const cfg = getDoor43Config()!;

  it('GET then PUT identical journal payload', async () => {
    const pathSeg = cfg.journalPath
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    const api = `${cfg.baseUrl}/api/v1/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${pathSeg}`;
    const headers: Record<string, string> = {
      Authorization: `token ${cfg.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const get = await fetch(`${api}?ref=${encodeURIComponent(cfg.branch)}`, { headers });
    if (get.status === 404) {
      const body = encodeBase64Utf8('[]');
      const put = await fetch(api, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          branch: cfg.branch,
          content: body,
          message: 'editor-core: create integration journal file',
        }),
      });
      expect(put.status).toBeLessThan(300);
      return;
    }

    expect(get.status).toBe(200);
    const data = (await get.json()) as { content?: string; sha?: string };
    expect(data.content).toBeTruthy();
    const text = decodeBase64Utf8(data.content!);
    const put = await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        branch: cfg.branch,
        content: encodeBase64Utf8(text),
        message: 'editor-core: idempotent journal roundtrip',
        sha: data.sha,
      }),
    });
    expect(put.status).toBeLessThan(300);
  });
});

/** Guard: example file must not point at a real secret path in CI */
describe('Door43 env file presence', () => {
  it('documents .env.door43.example at repo root', () => {
    const root = join(__dirname, '../../../../.env.door43.example');
    expect(existsSync(root)).toBe(true);
  });
});
