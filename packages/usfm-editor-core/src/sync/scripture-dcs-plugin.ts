/**
 * DCS / Gitea API transport for {@link JournalMergeSyncEngine} — stores the journal as a JSON
 * file in a repository (shared branch or `edit/<user>` workflows).
 */

import type { JournalEntry } from './types';
import type { JournalRemoteTransport } from './merge-sync-engine';

export interface ScriptureDcsPluginOptions {
  /** e.g. `https://git.door43.org` */
  baseUrl: string;
  /** Private access token (PAT) with `repo` scope. */
  token: string;
  owner: string;
  repo: string;
  /** Path to the journal file in the repo (default `usfm-ast/journal.json`). */
  path?: string;
  /** Branch (default `main`). */
  branch?: string;
}

interface GiteaFileResponse {
  sha?: string;
  content?: string;
  type?: string;
}

function decodeBase64Utf8(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  return atob(b64.replace(/\s/g, ''));
}

function encodeBase64Utf8(s: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64');
  }
  return btoa(s);
}

/** True if the entry's vector clock has at least one tick the caller has not seen yet. */
function entryHasUnseenTick(entry: JournalEntry, clock: Record<string, number>): boolean {
  for (const [uid, tick] of Object.entries(entry.vectorClock)) {
    if (tick > (clock[uid] ?? 0)) return true;
  }
  return false;
}

/**
 * Build a {@link JournalRemoteTransport} that reads/writes journal JSON via Gitea Contents API.
 */
export function createDcsJournalTransport(options: ScriptureDcsPluginOptions): JournalRemoteTransport {
  const path = options.path ?? 'usfm-ast/journal.json';
  const branch = options.branch ?? 'main';
  const base = options.baseUrl.replace(/\/$/, '');
  const pathSeg = path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  const api = `${base}/api/v1/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/contents/${pathSeg}`;

  const headers: Record<string, string> = {
    Authorization: `token ${options.token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  let lastSha: string | undefined;

  async function fetchFile(): Promise<{ sha?: string; text: string } | null> {
    const res = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`DCS GET ${path}: ${res.status}`);
    const data = (await res.json()) as GiteaFileResponse;
    if (data.type !== 'file' || !data.content) return { sha: data.sha, text: '[]' };
    lastSha = data.sha;
    return { sha: data.sha, text: decodeBase64Utf8(data.content) };
  }

  return {
    async pullEntriesSince(clock: Record<string, number>): Promise<JournalEntry[]> {
      const file = await fetchFile();
      if (!file) return [];
      let entries: JournalEntry[];
      try {
        entries = JSON.parse(file.text) as JournalEntry[];
      } catch {
        return [];
      }
      void clock;
      return entries;
    },

    async pushEntries(entries: JournalEntry[]): Promise<void> {
      const file = await fetchFile();
      const body = JSON.stringify(entries, null, 2);
      const sha = file?.sha ?? lastSha;
      const payload = {
        branch,
        content: encodeBase64Utf8(body),
        message: `Journal (${entries.length} entries)`,
        ...(sha ? { sha } : {}),
      };
      const res = await fetch(api, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const out = (await res.json()) as { content?: { sha?: string } };
        lastSha = out?.content?.sha ?? lastSha;
        return;
      }
      if (res.status === 409 || res.status === 422) {
        const again = await fetchFile();
        const retry = await fetch(api, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            branch,
            content: encodeBase64Utf8(body),
            message: `Journal (${entries.length} entries)`,
            sha: again?.sha,
          }),
        });
        if (!retry.ok) throw new Error(`DCS push conflict: ${retry.status}`);
        return;
      }
      throw new Error(`DCS push: ${res.status}`);
    },
  };
}
