/**
 * Web Worker: helps panel computation.
 *
 * Receives a {@link HelpsWorkerRequest} via postMessage and replies with a
 * {@link HelpsWorkerResponse}.  All heavy filtering, sorting, and
 * alignment-matching runs here — off the main thread.
 *
 * This file has no ProseMirror, no DOM, and no IndexedDB imports.
 * It only imports from `helps-compute.ts` which is a pure-data module.
 */

import type { HelpEntry } from '@usfm-tools/types';
import {
  computeChapterHelps,
  computeIntroHelps,
  type ProcessedHelpEntry,
  type StoreSnapshot,
} from '../lib/helps-compute';

// ─── Message protocol ─────────────────────────────────────────────────────────

export type HelpsWorkerRequest =
  | {
      type: 'computeChapter';
      /** Unique request id so the hook can discard stale responses. */
      requestId: number;
      twl: HelpEntry[];
      tn: HelpEntry[];
      chapter: number;
      source: StoreSnapshot | null;
    }
  | {
      type: 'computeIntro';
      requestId: number;
      twl: HelpEntry[];
      tn: HelpEntry[];
    };

export type HelpsWorkerResponse = {
  requestId: number;
  entries: ProcessedHelpEntry[];
};

// ─── Handler ─────────────────────────────────────────────────────────────────

self.addEventListener('message', (evt: MessageEvent<HelpsWorkerRequest>) => {
  const req = evt.data;
  let entries: ProcessedHelpEntry[];
  if (req.type === 'computeChapter') {
    entries = computeChapterHelps(req.twl, req.tn, req.chapter, req.source);
  } else {
    entries = computeIntroHelps(req.twl, req.tn);
  }
  const response: HelpsWorkerResponse = { requestId: req.requestId, entries };
  self.postMessage(response);
});
