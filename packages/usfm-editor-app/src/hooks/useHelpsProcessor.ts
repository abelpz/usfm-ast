import type { DocumentStore } from '@usfm-tools/editor-core';
import type { HelpEntry } from '@usfm-tools/types';
import { startTransition, useEffect, useRef, useState } from 'react';

import type { HelpsContentPage } from '@/hooks/useAnnotatedSource';
import type { ProcessedHelpEntry } from '@/lib/helps-compute';
import { extractStoreSnapshot } from '@/lib/helps-snapshot';
import type { HelpsWorkerResponse } from '@/workers/helps-processor.worker';

/**
 * Runs TN/TWL filtering, sorting, and gateway-quote alignment off the main thread.
 * Main thread only builds a small {@link extractStoreSnapshot} and posts it to the worker.
 */
export function useHelpsProcessor(
  twl: HelpEntry[],
  tn: HelpEntry[],
  helpsPage: HelpsContentPage | null,
  /** Snapshot source; when null or not loaded, worker matches without gateway text. */
  sourceStore: DocumentStore | null,
  sourceLoaded: boolean,
  /** Bump when target or source USFM may have changed (chapter nav, edits). */
  revision: number,
): { processed: ProcessedHelpEntry[]; busy: boolean } {
  const [processed, setProcessed] = useState<ProcessedHelpEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/helps-processor.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (evt: MessageEvent<HelpsWorkerResponse>) => {
      const { requestId, entries } = evt.data;
      if (requestId !== requestSeqRef.current) return;
      startTransition(() => {
        setProcessed(entries);
        setBusy(false);
      });
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    if (!helpsPage) {
      startTransition(() => {
        setProcessed([]);
        setBusy(false);
      });
      return;
    }

    const id = ++requestSeqRef.current;
    setBusy(true);

    if (helpsPage.kind === 'introduction') {
      worker.postMessage({ type: 'computeIntro', requestId: id, twl, tn });
      return;
    }

    const chapter = helpsPage.chapter;
    const snapshot =
      sourceLoaded && sourceStore
        ? extractStoreSnapshot(sourceStore, chapter, twl, tn)
        : null;

    worker.postMessage({
      type: 'computeChapter',
      requestId: id,
      twl,
      tn,
      chapter,
      source: snapshot,
    });
  }, [twl, tn, helpsPage, sourceStore, sourceLoaded, revision]);

  return { processed, busy };
}
