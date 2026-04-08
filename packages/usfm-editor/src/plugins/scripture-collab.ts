import type { Operation } from '@usfm-tools/editor-core';

import type { ScripturePlugin } from '../scripture-plugin';
import type { ScriptureSession } from '../scripture-session';

/**
 * Chapter-scoped OT bridge: keeps optional per-chapter **local pending** content operations
 * (not yet acknowledged by the server) and merges incoming remote ops via
 * {@link ScriptureSession.applyRemoteContentOperations} using {@link transformOpLists}
 * from editor-core.
 */
export class ScriptureCollabPlugin implements ScripturePlugin {
  readonly name = 'scripture-collab';

  private readonly localPending = new Map<number, Operation[]>();

  /** Replace pending client ops for a chapter (e.g. from your outgoing buffer). */
  setLocalPending(chapter: number, ops: Operation[]): void {
    this.localPending.set(chapter, [...ops]);
  }

  getLocalPending(chapter: number): Operation[] {
    return [...(this.localPending.get(chapter) ?? [])];
  }

  /** Merge `remoteOps` against pending locals; updates the session and stores transformed pending. */
  applyRemote(session: ScriptureSession, chapter: number, remoteOps: Operation[]): void {
    const local = this.getLocalPending(chapter);
    const { clientPrime } = session.applyRemoteContentOperations(chapter, remoteOps, local);
    this.localPending.set(chapter, clientPrime);
  }

  destroy(): void {
    this.localPending.clear();
  }
}
