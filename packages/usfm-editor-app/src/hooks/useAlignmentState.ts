/**
 * Alignment UI state. Verse token lists come from `ScriptureSession.getTranslationTokens` /
 * `getReferenceTokens` (same verse pairing as legacy `tokensForPair` in `alignment-panel.ts`).
 */
import type { ScriptureSession } from '@usfm-tools/editor';
import type { SourceCompatibility, UsjDocument } from '@usfm-tools/editor-core';
import { parseDocumentIdentityFromUsj, tokenizeTranslationDocument } from '@usfm-tools/editor-core';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useAlignmentState(
  session: ScriptureSession,
  overlayOpen: boolean,
) {
  const [compat, setCompat] = useState<SourceCompatibility | null>(null);
  const [bump, setBump] = useState(0);
  const [verseSid, setVerseSid] = useState('');
  const [selectedRef, setSelectedRef] = useState<number[]>([]);
  const [selectedTrans, setSelectedTrans] = useState<number[]>([]);

  // When overlay opens/closes, sync selection and compat; source presence drives inline UI.
  useEffect(() => {
    if (!overlayOpen) return;
    setSelectedRef([]);
    setSelectedTrans([]);
    if (session.isAlignmentSourceLoaded()) {
      setCompat(session.getAlignmentSourceCompatibility());
      setVerseSid((prev) => {
        if (prev) return prev;
        const transKeys = Object.keys(tokenizeTranslationDocument(session.store.getFullUSJ())).sort();
        return transKeys[0] ?? session.getAlignmentSourceVerseSids()[0] ?? '';
      });
    } else {
      setCompat(null);
    }
  }, [overlayOpen, session]);

  const refresh = useCallback(() => setBump((n) => n + 1), []);

  useEffect(() => {
    const u1 = session.onChange(refresh);
    const u2 = session.onAlignmentChange(refresh);
    return () => {
      u1();
      u2();
    };
  }, [session, refresh]);

  const verseSids = useMemo(() => {
    void bump;
    const transKeys = Object.keys(tokenizeTranslationDocument(session.store.getFullUSJ()));
    if (transKeys.length > 0) {
      return transKeys.sort();
    }
    const srcKeys = session.isAlignmentSourceLoaded() ? session.getAlignmentSourceVerseSids() : [];
    return srcKeys;
  }, [session, bump]);

  useEffect(() => {
    if (verseSids.length && !verseSids.includes(verseSid)) {
      setVerseSid(verseSids[0]!);
    }
  }, [verseSids, verseSid]);

  const useExistingLayer = useCallback(
    (layerKey: string, sourceUsj: UsjDocument) => {
      session.setActiveAlignmentDocumentKey(layerKey);
      const c = session.loadAlignmentSource(sourceUsj, { stripSource: true });
      setCompat(c);
      setSelectedRef([]);
      setSelectedTrans([]);
      setVerseSid((prev) => {
        if (prev) return prev;
        const transKeys = Object.keys(tokenizeTranslationDocument(session.store.getFullUSJ())).sort();
        return transKeys[0] ?? session.getAlignmentSourceVerseSids()[0] ?? '';
      });
    },
    [session],
  );

  const startNewLayer = useCallback(
    (sourceUsj: UsjDocument) => {
      session.createLayerForSource(sourceUsj);
      const c = session.loadAlignmentSource(sourceUsj, { stripSource: true });
      setCompat(c);
      setSelectedRef([]);
      setSelectedTrans([]);
      setVerseSid((prev) => {
        if (prev) return prev;
        const transKeys = Object.keys(tokenizeTranslationDocument(session.store.getFullUSJ())).sort();
        return transKeys[0] ?? session.getAlignmentSourceVerseSids()[0] ?? '';
      });
    },
    [session],
  );

  const resetToPickSource = useCallback(() => {
    session.clearAlignmentSource();
    setCompat(null);
    setSelectedRef([]);
    setSelectedTrans([]);
  }, [session]);

  const referenceLabel = useCallback((usj: UsjDocument) => {
    const raw = parseDocumentIdentityFromUsj(usj);
    if (!raw) return null;
    const clean = raw
      .replace(/\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*/i, '')
      .replace(/\s+\d{4}\b.*/i, '')
      .replace(/\s+\d{2}:\d{2}:\d{2}\b.*/i, '')
      .trim();
    return clean || null;
  }, []);

  return {
    compat,
    setCompat,
    verseSid,
    setVerseSid,
    verseSids,
    selectedRef,
    setSelectedRef,
    selectedTrans,
    setSelectedTrans,
    useExistingLayer,
    startNewLayer,
    resetToPickSource,
    referenceLabel,
    bump,
    refresh,
  };
}
