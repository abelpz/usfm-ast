import type { ScriptureSession, SourceTextSession } from '@usfm-tools/editor';
import { useEffect, useRef } from 'react';
import { mountSourcePanel } from '@/lib/mount-source-panel';

type Props = {
  session: ScriptureSession;
  onError?: (err: Error) => void;
  onSourceSession?: (source: SourceTextSession | null) => void;
  /** Auto-load this USFM as reference text on mount (e.g. translate-from-source). */
  prefillSourceUsfm?: string;
};

export function SourcePanel({ session, onError, onSourceSession, prefillSourceUsfm }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return mountSourcePanel(el, session, {
      onError: onError ?? ((err) => console.warn('Source panel error:', err)),
      onSourceSession,
      prefillSourceUsfm,
    });
  }, [session, onError, onSourceSession, prefillSourceUsfm]);

  return (
    <div
      ref={ref}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
    />
  );
}
