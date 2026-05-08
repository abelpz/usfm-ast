/**
 * useYbinDocProvider — wires a YbinDocProvider to a live ScriptureSession.
 *
 * Lifecycle:
 *   1. On mount (or when ctrl / target change), loads `crdt/<BOOK>.ybin`
 *      from ProjectStorage into a fresh YbinDocProvider.
 *   2. Subscribes to `session.onChange` — on every editor save, serialises
 *      the current USJ to USFM and calls `provider.applyUsfmUpdate` so the
 *      Y.Doc stays in sync with the OT-based editor.
 *   3. Starts debounced persistence: Y.Doc updates → `crdt/*.ybin` in storage.
 *   4. On cleanup (unmount / dep change), unsubscribes, flushes, destroys.
 *
 * The prop `ybinTarget` is optional — when null the hook is a no-op so
 * existing callers that don't supply storage are unaffected.
 *
 * Returns the current YbinDocProvider (null while loading or when no target).
 * The provider's Y.Doc is the live CRDT document; attach awareness / collab
 * providers to it when the editor migrates to Yjs natively (Phase 5+).
 */

import { useEffect, useState } from 'react';
import type { ProjectStorage } from '@usfm-tools/types';
import { YbinDocProvider, convertUSJDocumentToUSFM } from '@usfm-tools/editor-adapters';
import type { ScriptureSessionController } from './useScriptureSession';

export type YbinStorageTarget = {
  storage: ProjectStorage;
  projectId: string;
  /** Relative path of the USFM file, e.g. `files/JHN.usfm`. */
  usfmPath: string;
};

/**
 * Manages a YbinDocProvider lifecycle bound to a live editor session.
 *
 * @param ctrl      Current session controller from `useScriptureSession`.
 * @param target    Storage, project ID, and USFM path — or null to opt out.
 * @param debounceMs Debounce for persist writes (default 2 s).
 */
export function useYbinDocProvider(
  ctrl: ScriptureSessionController | null,
  target: YbinStorageTarget | null,
  debounceMs = 2000,
): YbinDocProvider | null {
  const [provider, setProvider] = useState<YbinDocProvider | null>(null);

  // Stable key so effect only re-runs when identity changes.
  const targetKey = target
    ? `${target.projectId}::${target.usfmPath}`
    : null;

  useEffect(() => {
    if (!ctrl || !target || !targetKey) return;
    const { storage, projectId, usfmPath } = target;
    let cancelled = false;
    let currentProvider: YbinDocProvider | null = null;
    let offChange: (() => void) | null = null;

    void YbinDocProvider.load(storage, projectId, usfmPath).then((p) => {
      if (cancelled) {
        p.destroy();
        return;
      }
      currentProvider = p;
      setProvider(p);

      // Debounce-persist Y.Doc updates back to storage.
      p.startPersisting(storage, projectId, usfmPath, debounceMs);

      // On every editor content change, keep the Y.Doc in sync.
      offChange = ctrl.session.onChange(() => {
        try {
          const usj = ctrl.session.toUSJWithAlignments();
          const usfm = convertUSJDocumentToUSFM(usj);
          p.applyUsfmUpdate(usfm);
        } catch {
          // Non-fatal: CRDT state just lags one edit cycle.
        }
      });
    });

    return () => {
      cancelled = true;
      offChange?.();
      currentProvider?.destroy();
      setProvider(null);
    };
  }, [ctrl, targetKey, debounceMs]);

  return provider;
}
