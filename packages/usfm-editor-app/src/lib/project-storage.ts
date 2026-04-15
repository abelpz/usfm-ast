import { IndexedDbProjectStorage } from '@usfm-tools/editor-adapters';
import type { ProjectStorage } from '@usfm-tools/types';

let _instance: ProjectStorage | null = null;

/** App-level singleton; swap implementation for tests or alternate backends (OPFS, DCS sync, …). */
export function getProjectStorage(): ProjectStorage {
  const cur = _instance ?? new IndexedDbProjectStorage();
  _instance = cur;
  return cur;
}
