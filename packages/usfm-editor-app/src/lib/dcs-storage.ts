export const DCS_CREDS_KEY = 'usfm-dcs-credentials' as const;
export const DCS_TARGET_KEY = 'usfm-dcs-target' as const;

export type DcsStoredCredentials = {
  host: string;
  token: string;
  username: string;
  tokenId?: number;
};

export type DcsStoredTarget = {
  owner: string;
  repo: string;
  branch: string;
  usfmPath: string;
  journalPath: string;
  syncEnabled: boolean;
};

export function loadDcsCredentials(): DcsStoredCredentials | null {
  try {
    const raw = localStorage.getItem(DCS_CREDS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as DcsStoredCredentials;
    if (!o.host || !o.token || !o.username) return null;
    return o;
  } catch {
    return null;
  }
}

export function loadDcsTarget(): DcsStoredTarget | null {
  try {
    const raw = localStorage.getItem(DCS_TARGET_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as DcsStoredTarget;
    if (!o.owner || !o.repo || !o.usfmPath) return null;
    return {
      owner: o.owner,
      repo: o.repo,
      branch: o.branch || 'main',
      usfmPath: o.usfmPath,
      journalPath: o.journalPath || 'usfm-ast/journal.json',
      syncEnabled: Boolean(o.syncEnabled),
    };
  } catch {
    return null;
  }
}
