/**
 * Alignment UI state. Verse token lists come from `ScriptureSession.getTranslationTokens` /
 * `getReferenceTokens` (same verse pairing as legacy `tokensForPair` in `alignment-panel.ts`).
 */
import type { ScriptureSession, SourceTextSession } from '@usfm-tools/editor';
import type { SourceCompatibility, UsjDocument } from '@usfm-tools/editor-core';
import { parseDocumentIdentityFromUsj, tokenizeTranslationDocument } from '@usfm-tools/editor-core';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useAlignmentState(
  session: ScriptureSession,
  sourceTextSession: SourceTextSession | null,
  overlayOpen: boolean,
) {
  const [step, setStep] = useState<'pick-source' | 'align'>('pick-source');
  const [compat, setCompat] = useState<SourceCompatibility | null>(null);
  const [bump, setBump] = useState(0);
  const [verseSid, setVerseSid] = useState('');
  const [selectedRef, setSelectedRef] = useState<number[]>([]);
  const [selectedTrans, setSelectedTrans] = useState<number[]>([]);

  useEffect(() => {
    if (!overlayOpen) return;
    setSelectedRef([]);
    setSelectedTrans([]);
    if (session.isAlignmentSourceLoaded()) {
      setCompat(session.getAlignmentSourceCompatibility());
      setStep('align');
    } else {
      setStep('pick-source');
      setCompat(null);
    }
  }, [overlayOpen, session]);

  /**
   * When the reference column is loaded and the translation already has alignment groups with
   * source words, load that USJ and skip the picker if word-level match is exact / high / partial.
   */
  useEffect(() => {
    if (!overlayOpen) return;
    const refLoaded = Boolean(sourceTextSession?.isLoaded());
    if (!refLoaded || !session.canAutoDetectAlignmentSource()) return;
    const refUsj = sourceTextSession!.store.getFullUSJ() as UsjDocument;
    const c = session.loadAlignmentSource(refUsj, { stripSource: true });
    setCompat(c);
    const conf = c.wordMatch?.confidence;
    if (conf === 'exact' || conf === 'high' || conf === 'partial') {
      setStep('align');
    } else {
      session.clearAlignmentSource();
      setCompat(null);
    }
    // Deps intentionally limited: runs when overlay opens with current session/source.
  }, [overlayOpen, sourceTextSession, session]);

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
    const keys = Object.keys(tokenizeTranslationDocument(session.store.getFullUSJ()));
    return keys.sort();
  }, [session, bump]);

  useEffect(() => {
    if (verseSids.length && !verseSids.includes(verseSid)) {
      setVerseSid(verseSids[0]!);
    }
  }, [verseSids, verseSid]);

  const confirmSourceUsj = useCallback(
    (usj: UsjDocument) => {
      const c = session.loadAlignmentSource(usj, { stripSource: true });
      setCompat(c);
      setStep('align');
      setSelectedRef([]);
      setSelectedTrans([]);
    },
    [session],
  );

  const resetToPickSource = useCallback(() => {
    session.clearAlignmentSource();
    setCompat(null);
    setStep('pick-source');
    setSelectedRef([]);
    setSelectedTrans([]);
  }, [session]);

  const referenceLabel = useCallback((usj: UsjDocument) => {
    return parseDocumentIdentityFromUsj(usj) ?? 'Loaded document';
  }, []);

  return {
    step,
    setStep,
    compat,
    setCompat,
    verseSid,
    setVerseSid,
    verseSids,
    selectedRef,
    setSelectedRef,
    selectedTrans,
    setSelectedTrans,
    confirmSourceUsj,
    resetToPickSource,
    referenceLabel,
    bump,
    refresh,
    sourceTextSession,
  };
}
