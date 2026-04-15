import type { ScriptureSession, SourceTextSession } from '@usfm-tools/editor';
import { useCallback, useEffect, useRef } from 'react';
import { mountSourcePanel } from '@/lib/mount-source-panel';

type Props = {
  session: ScriptureSession;
  onError?: (err: Error) => void;
  onSourceSession?: (source: SourceTextSession | null) => void;
  /** Auto-load this USFM as reference text on mount (e.g. translate-from-source). */
  prefillSourceUsfm?: string;
  /** Open the file/DCS drawer once after mount (e.g. new source tab). */
  openDrawerOnMount?: boolean;
};

export function SourcePanel({ session, onError, onSourceSession, prefillSourceUsfm, openDrawerOnMount }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onSourceSessionRef = useRef(onSourceSession);
  const onErrorRef = useRef(onError);
  onSourceSessionRef.current = onSourceSession;
  onErrorRef.current = onError;

  const relaySource = useCallback((source: SourceTextSession | null) => {
    onSourceSessionRef.current?.(source);
  }, []);

  const relayError = useCallback((err: Error) => {
    (onErrorRef.current ?? ((e: Error) => console.warn('Source panel error:', e)))(err);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return mountSourcePanel(el, session, {
      onError: relayError,
      onSourceSession: relaySource,
      prefillSourceUsfm,
      openDrawerOnMount,
    });
    // openDrawerOnMount is intentionally read only on first mount for this DOM mount (new tab).
  }, [session, prefillSourceUsfm, relaySource, relayError]);

  return (
    <div
      ref={ref}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
    />
  );
}
