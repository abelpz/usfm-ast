const LOCAL_ACTOR_ID_KEY = 'usfm-editor.localActorId.v1';

let memoryActorId: string | null = null;

function createRandomId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getOrCreateInstallActorId(): string {
  if (memoryActorId) return memoryActorId;
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(LOCAL_ACTOR_ID_KEY)?.trim();
      if (existing) {
        memoryActorId = existing;
        return existing;
      }
      const next = createRandomId();
      localStorage.setItem(LOCAL_ACTOR_ID_KEY, next);
      memoryActorId = next;
      return next;
    }
  } catch {
    // Fall back to a process-local id when persistent browser storage is unavailable.
  }
  memoryActorId = createRandomId();
  return memoryActorId;
}

export function getLocalJournalActorId(username: string | null | undefined): string {
  const account = username?.trim() || 'local';
  return `${account}@${getOrCreateInstallActorId()}`;
}
