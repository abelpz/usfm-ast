/**
 * Throttled local selection/cursor broadcast for real-time collaboration.
 */

import { Plugin } from 'prosemirror-state';

const MAX_PER_SEC = 10;
const MIN_INTERVAL_MS = Math.ceil(1000 / MAX_PER_SEC);

export interface AwarenessPluginOptions {
  /** Called when the local selection or document changes (throttled). */
  onLocalPresence: (payload: {
    chapter: number;
    from: number;
    to: number;
  }) => void;
}

/**
 * ProseMirror plugin that forwards local selection (mapped to a simple chapter + PM position range).
 */
export function createAwarenessPlugin(options: AwarenessPluginOptions): Plugin {
  let lastEmit = 0;
  return new Plugin({
    appendTransaction(trs, _oldState, newState) {
      if (!trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
      const now = Date.now();
      if (now - lastEmit < MIN_INTERVAL_MS) return null;
      lastEmit = now;
      const { from, to } = newState.selection;
      options.onLocalPresence({
        chapter: 1,
        from,
        to,
      });
      return null;
    },
  });
}
