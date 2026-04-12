import type { ScriptureSession } from '@usfm-tools/editor';
import type { AlignmentDocument } from '@usfm-tools/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Multi-source alignment documents on {@link ScriptureSession}: list, activate, load JSON.
 */
export function useAlignmentDocuments(session: ScriptureSession) {
  const [bump, setBump] = useState(0);
  const refresh = useCallback(() => setBump((n) => n + 1), []);

  useEffect(() => {
    const unsub = session.onAlignmentDocumentsChange(refresh);
    return unsub;
  }, [session, refresh]);

  const keys = useMemo(() => {
    void bump;
    return session.getAlignmentDocumentKeys();
  }, [session, bump]);

  const documents = useMemo(() => {
    void bump;
    return session.getAlignmentDocuments();
  }, [session, bump]);

  const activeKey = useMemo(() => {
    void bump;
    return session.getActiveAlignmentDocumentKey();
  }, [session, bump]);

  const setActiveKey = useCallback(
    (key: string) => {
      const ok = session.setActiveAlignmentDocumentKey(key);
      if (ok) refresh();
      return ok;
    },
    [session, refresh],
  );

  const loadFromJson = useCallback(
    (json: string) => {
      session.loadAlignmentDocumentFromJson(json);
      refresh();
    },
    [session, refresh],
  );

  const docByKey = useCallback(
    (key: string): AlignmentDocument | undefined => {
      const i = keys.indexOf(key);
      return i >= 0 ? documents[i] : undefined;
    },
    [keys, documents],
  );

  return {
    keys,
    documents,
    activeKey,
    setActiveKey,
    loadFromJson,
    docByKey,
    refresh,
  };
}
