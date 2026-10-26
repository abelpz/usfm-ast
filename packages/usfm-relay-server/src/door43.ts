/**
 * Who may join a room when the relay serves a Door43 app (AUTH_MODE=door43): somebody signed in to the Door43 host the
 * room names, who can read the repository the room is about. The room is `host|owner/repo|key`.
 */

export type Door43Room = { host: string; owner: string; repo: string; key: string };

const ROOM = /^([a-z0-9.-]+(?::\d{1,5})?)\|([^/|\s]+)\/([^/|\s]+)\|(.+)$/i;

export function parseRoom(roomId: string): Door43Room | null {
  const m = ROOM.exec(roomId);
  if (!m || !m[4]!.trim()) return null;
  return { host: m[1]!.toLowerCase(), owner: m[2]!, repo: m[3]!, key: m[4]! };
}

/** A host as written in ALLOWED_HOSTS; a local one is spoken to over http. */
export function hostAllowed(host: string, allowed: string | undefined): boolean {
  return (allowed ?? '')
    .split(',')
    .map((one) => one.trim().toLowerCase())
    .filter(Boolean)
    .includes(host.toLowerCase());
}

const baseOf = (host: string) => (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? `http://${host}` : `https://${host}`);

export async function checkDoor43(p: {
  host: string;
  owner: string;
  repo: string;
  token: string;
  fetch?: typeof fetch;
}): Promise<{ login: string; name: string } | { denied: 'auth' | 'access' }> {
  const get = p.fetch ?? fetch;
  const headers = { Authorization: `token ${p.token}`, Accept: 'application/json' };
  const base = baseOf(p.host);
  let login = '';
  let name = '';
  try {
    const me = await get(`${base}/api/v1/user`, { headers });
    if (!me.ok) return { denied: 'auth' };
    const body = (await me.json()) as { login?: string; username?: string; full_name?: string };
    login = (body.login || body.username || '').trim().toLowerCase();
    name = (body.full_name || '').trim() || login;
  } catch {
    return { denied: 'auth' };
  }
  if (!login) return { denied: 'auth' };
  try {
    const repo = await get(`${base}/api/v1/repos/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repo)}`, { headers });
    if (!repo.ok) return { denied: 'access' };
  } catch {
    return { denied: 'access' };
  }
  return { login, name };
}
