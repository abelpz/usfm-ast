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
  const [step, setStep] = useState<'pick-source' | 'align'>('pick-source');
  const [compat, setCompat] = useState<SourceCompatibility | null>(null);
  const [bump, setBump] = useState(0);
  const [verseSid, setVerseSid] = useState('');
  const [selectedRef, setSelectedRef] = useState<number[]>([]);
  const [selectedTrans, setSelectedTrans] = useState<number[]>([]);

  // When overlay opens/closes, sync step with session state.
  useEffect(() => {
    if (!overlayOpen) return;
    setSelectedRef([]);
    setSelectedTrans([]);
    if (session.isAlignmentSourceLoaded()) {
      setCompat(session.getAlignmentSourceCompatibility());
      setStep('align');
      // Eagerly initialize verseSid when source is already loaded (e.g. re-opening the panel).
      setVerseSid((prev) => {
        if (prev) return prev;
        // Prefer a verse that exists in the translation; fall back to the source.
        const transKeys = Object.keys(tokenizeTranslationDocument(session.store.getFullUSJ())).sort();
        return transKeys[0] ?? session.getAlignmentSourceVerseSids()[0] ?? '';
      });
    } else {
      setStep('pick-source');
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
      // Translation has its own verse nodes — use only those for navigation so we never
      // show source-only verses where the translation has no words.
      return transKeys.sort();
    }
    // Translation store has no verse SIDs yet (e.g. new book, or verse nodes were written back
    // without sid attrs). Fall back to the alignment source's verse sids so the picker isn't
    // empty after the user picks a source.
    const srcKeys = session.isAlignmentSourceLoaded() ? session.getAlignmentSourceVerseSids() : [];
    return srcKeys;
  }, [session, bump]);

  useEffect(() => {
    if (verseSids.length && !verseSids.includes(verseSid)) {
      setVerseSid(verseSids[0]!);
    }
  }, [verseSids, verseSid]);

  /**
   * Use an existing layer: switch the active alignment layer to `layerKey` and load `sourceUsj`
   * as the editing reference. The user continues aligning the same text they previously aligned.
   */
  const useExistingLayer = useCallback(
    (layerKey: string, sourceUsj: UsjDocument) => {
      session.setActiveAlignmentDocumentKey(layerKey);
      const c = session.loadAlignmentSource(sourceUsj, { stripSource: true });
      setCompat(c);
      setStep('align');
      setSelectedRef([]);
      setSelectedTrans([]);
      // Eagerly set the first verse (prefer translation verses so the bank has words).
      setVerseSid((prev) => {
        if (prev) return prev;
        const transKeys = Object.keys(tokenizeTranslationDocument(session.store.getFullUSJ())).sort();
        return transKeys[0] ?? session.getAlignmentSourceVerseSids()[0] ?? '';
      });
    },
    [session],
  );

  /**
   * Start a brand-new alignment layer for a source the book has never been aligned to before.
   * Creates an empty `AlignmentDocument`, makes it active, and loads the reference for editing.
   */
  const startNewLayer = useCallback(
    (sourceUsj: UsjDocument) => {
      session.createLayerForSource(sourceUsj);
      const c = session.loadAlignmentSource(sourceUsj, { stripSource: true });
      setCompat(c);
      setStep('align');
      setSelectedRef([]);
      setSelectedTrans([]);
      // Eagerly set the first verse (prefer translation verses so the bank has words).
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
    setStep('pick-source');
    setSelectedRef([]);
    setSelectedTrans([]);
  }, [session]);

  const referenceLabel = useCallback((usj: UsjDocument) => {
    const raw = parseDocumentIdentityFromUsj(usj);
    if (!raw) return null;
    // Strip date / timezone junk: "NEH EN_ULT en_English_ltr Thu Aug 26 2021…" → "NEH EN_ULT en_English_ltr"
    const clean = raw
      .replace(/\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*/i, '')
      .replace(/\s+\d{4}\b.*/i, '')
      .replace(/\s+\d{2}:\d{2}:\d{2}\b.*/i, '')
      .trim();
    return clean || null;
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
    useExistingLayer,
    startNewLayer,
    resetToPickSource,
    referenceLabel,
    bump,
    refresh,
  };
}
