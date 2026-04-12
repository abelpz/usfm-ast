import { convertUSJDocumentToUSFM } from '@usfm-tools/editor-adapters';
import { serializeToUSJ, type ScriptureSession } from '@usfm-tools/editor';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

type Props = {
  session: ScriptureSession;
  visible: boolean;
};

export function UsfmSourcePane({ session, visible }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const syncingRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errRef = useRef(false);

  /** Mirror the WYSIWYG slice into the textarea. When `bypassFocusGuard` is true, run even if the textarea is focused (pane open / navigation). */
  const fillFromSession = useCallback(
    (bypassFocusGuard: boolean) => {
      const ta = taRef.current;
      if (!ta) return;
      if (!bypassFocusGuard && document.activeElement === ta) return;
      syncingRef.current = true;
      try {
        const next = convertUSJDocumentToUSFM(serializeToUSJ(session.contentView.state));
        if (ta.value !== next) {
          ta.value = next;
          ta.classList.remove('ring-2', 'ring-destructive/40');
          errRef.current = false;
        }
      } finally {
        syncingRef.current = false;
      }
    },
    [session],
  );

  const pushFromEditor = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      fillFromSession(false);
    }, 140);
  }, [fillFromSession]);

  useLayoutEffect(() => {
    if (!visible) return;
    fillFromSession(true);
  }, [visible, session, fillFromSession]);

  useEffect(() => {
    return session.onChange(() => {
      if (visible) pushFromEditor();
    });
  }, [session, visible, pushFromEditor]);

  function scheduleApplySource() {
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    applyTimerRef.current = setTimeout(() => {
      applyTimerRef.current = null;
      if (syncingRef.current) return;
      const ta = taRef.current;
      if (!ta) return;
      try {
        session.applyLiveUsfmFromVisibleWindow(ta.value);
        ta.classList.remove('ring-2', 'ring-destructive/40');
        errRef.current = false;
      } catch {
        ta.classList.add('ring-2', 'ring-destructive/40');
        errRef.current = true;
      }
    }, 320);
  }

  if (!visible) return null;

  return (
    <div className="border-border bg-muted/15 flex min-h-0 min-w-[220px] flex-[0_0_38%] flex-col border-l">
      <div className="text-muted-foreground border-border border-b px-3 py-2 text-xs font-medium">
        USFM source (live)
      </div>
      <textarea
        ref={taRef}
        className={cn(
          'font-mono text-foreground min-h-[200px] w-full flex-1 resize-none border-0 bg-transparent p-3 text-sm outline-none',
        )}
        spellCheck={false}
        aria-label="USFM source"
        onInput={scheduleApplySource}
      />
    </div>
  );
}
