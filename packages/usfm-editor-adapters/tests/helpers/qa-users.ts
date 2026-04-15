/**
 * Gitea token lifecycle helpers for QA integration tests.
 *
 * Each test user has a username + password (stored in `.env.qa`).
 * Tests acquire a short-lived PAT via Gitea Basic Auth at setup time and
 * revoke it immediately on teardown so no credentials linger on the server.
 *
 * Usage:
 * ```ts
 * const qa  = skipIfNoQaCredentials();
 * let sessions: QaSession[] = [];
 *
 * beforeAll(async () => {
 *   sessions = await loginAllQaUsers(qa);
 * });
 * afterAll(async () => {
 *   await logoutAllQaUsers(sessions);
 * });
 * ```
 */

import type { QaEnv, QaUserEnv } from './qa-env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A logged-in QA user with a short-lived Gitea PAT. */
export type QaSession = {
  host: string;
  username: string;
  /** Short-lived PAT acquired for this test run. */
  token: string;
  /** Gitea token ID — needed to delete the token on teardown. */
  tokenId: number;
};

// ---------------------------------------------------------------------------
// Gitea token API helpers
// ---------------------------------------------------------------------------

function basicAuthHeader(username: string, password: string): string {
  // Node `Buffer` available in Jest / Node environment.
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

function apiBase(host: string): string {
  return `${host.replace(/\/$/, '')}/api/v1`;
}

/**
 * Create a new Gitea PAT for `username` using Basic Auth (username + password).
 * Token name includes a timestamp so parallel runs don't clash.
 */
export async function acquireQaToken(
  host: string,
  user: QaUserEnv,
): Promise<{ token: string; tokenId: number }> {
  const tokenName = `usfm-ast-test-${Date.now()}`;
  const url = `${apiBase(host)}/users/${encodeURIComponent(user.username)}/tokens`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(user.username, user.password),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name: tokenName }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `QA login failed for ${user.username} on ${host}: HTTP ${res.status} — ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as { id: number; sha1: string };
  if (!data.sha1 || !data.id) {
    throw new Error(`QA login: unexpected token response for ${user.username}`);
  }
  return { token: data.sha1, tokenId: data.id };
}

/**
 * Revoke a previously acquired PAT.
 * Errors are logged but not thrown so teardown always completes.
 */
export async function revokeQaToken(session: QaSession, user: QaUserEnv): Promise<void> {
  const url = `${apiBase(session.host)}/users/${encodeURIComponent(session.username)}/tokens/${session.tokenId}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: basicAuthHeader(user.username, user.password),
        Accept: 'application/json',
      },
    });
    if (!res.ok && res.status !== 404) {
      console.warn(`[QA] Could not revoke token for ${session.username}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[QA] Token revocation failed for ${session.username}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers for test setup / teardown
// ---------------------------------------------------------------------------

/**
 * Log in a single QA user and return their session.
 *
 * @example
 * ```ts
 * const session = await loginQaUser(qa.host, qa.users[0]);
 * ```
 */
export async function loginQaUser(host: string, user: QaUserEnv): Promise<QaSession> {
  const { token, tokenId } = await acquireQaToken(host, user);
  return { host, username: user.username, token, tokenId };
}

/**
 * Log in both QA users concurrently and return their sessions.
 * Pass the result to `logoutAllQaUsers` in `afterAll`.
 */
export async function loginAllQaUsers(qa: QaEnv): Promise<[QaSession, QaSession]> {
  const [s1, s2] = await Promise.all(qa.users.map((u) => loginQaUser(qa.host, u)));
  return [s1!, s2!];
}

/**
 * Revoke the tokens for all sessions. Call in `afterAll`.
 * Accepts the original `QaEnv` to re-read passwords for the revocation request.
 */
export async function logoutAllQaUsers(sessions: QaSession[], qa: QaEnv): Promise<void> {
  await Promise.all(sessions.map((s, i) => revokeQaToken(s, qa.users[i]!)));
}

// ---------------------------------------------------------------------------
// Repo lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary test repository owned by `owner` (user or org).
 * Returns the repo name. The caller is responsible for deleting it in teardown
 * via `deleteTestRepo`.
 */
export async function createTestRepo(
  session: QaSession,
  options: {
    owner: string;
    repoPrefix: string;
    targetType: 'user' | 'org';
    private?: boolean;
  },
): Promise<string> {
  const name = `${options.repoPrefix}-${Date.now()}`;
  const base = apiBase(session.host);
  const enc = encodeURIComponent;

  const body = {
    name,
    private: options.private ?? false,
    auto_init: true,
    default_branch: 'main',
  };

  const url =
    options.targetType === 'org'
      ? `${base}/orgs/${enc(options.owner)}/repos`
      : `${base}/user/repos`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `token ${session.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createTestRepo failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }
  return name;
}

/**
 * Delete a test repository. Errors are logged but not thrown.
 */
export async function deleteTestRepo(
  session: QaSession,
  owner: string,
  repo: string,
): Promise<void> {
  const url = `${apiBase(session.host)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `token ${session.token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok && res.status !== 404) {
      console.warn(`[QA] Could not delete repo ${owner}/${repo}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[QA] Repo deletion failed for ${owner}/${repo}:`, err);
  }
}

/**
 * Add a collaborator to a repository with write access.
 * Used in tests to give User 2 access to a repo owned by User 1.
 */
export async function addCollaborator(
  session: QaSession,
  owner: string,
  repo: string,
  collaboratorUsername: string,
): Promise<void> {
  const url = `${apiBase(session.host)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(collaboratorUsername)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${session.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ permission: 'write' }),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `addCollaborator failed (${collaboratorUsername} → ${owner}/${repo}): HTTP ${res.status} — ${text.slice(0, 200)}`,
    );
  }
}
