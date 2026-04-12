const STORAGE_KEY = 'usfm-editor-recent-projects';
const MAX_ENTRIES = 12;

export type RecentProjectSource = 'blank' | 'device' | 'dcs' | 'translate' | 'continue';

export type RecentProjectEntry = {
  id: string;
  name: string;
  bookCode: string;
  source: RecentProjectSource;
  /** DCS file location when source is dcs / translate-from-dcs */
  dcs?: { owner: string; repo: string; ref: string; path: string; host?: string };
  /** When source is translate: main document was opened with source text vs blank shell + reference. */
  translateOverSource?: boolean;
  timestamp: number;
};

function safeParse(raw: string | null): RecentProjectEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is RecentProjectEntry =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as RecentProjectEntry).id === 'string' &&
        typeof (x as RecentProjectEntry).name === 'string' &&
        typeof (x as RecentProjectEntry).bookCode === 'string' &&
        typeof (x as RecentProjectEntry).timestamp === 'number',
    );
  } catch {
    return [];
  }
}

export function loadRecentProjects(): RecentProjectEntry[] {
  return safeParse(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null).sort(
    (a, b) => b.timestamp - a.timestamp,
  );
}

export function addRecentProject(
  entry: Omit<RecentProjectEntry, 'id' | 'timestamp'> & { id?: string },
): RecentProjectEntry {
  const id = entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const full: RecentProjectEntry = {
    ...entry,
    id,
    timestamp: Date.now(),
  };
  const cur = loadRecentProjects().filter((p) => p.id !== id);
  cur.unshift(full);
  const next = cur.slice(0, MAX_ENTRIES);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return full;
}

export function removeRecentProject(id: string): void {
  const cur = loadRecentProjects().filter((p) => p.id !== id);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
  }
}
