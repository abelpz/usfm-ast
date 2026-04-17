import {
  useScriptureSession,
  type ScriptureSessionController,
} from '@/hooks/useScriptureSession';
import type { DcsStoredCredentials, DcsStoredTarget } from '@/lib/dcs-storage';
import { cn } from '@/lib/utils';
import type { JournalStore } from '@usfm-tools/editor-core';
import { memo, useEffect, useRef } from 'react';

export type EditorPanelProps = {
  initialUsfm: string;
  collabActive: boolean;
  wsRelay: string;
  dcsCreds: DcsStoredCredentials | null;
  dcsTarget: DcsStoredTarget | null;
  /** Project target language (BCP-47) for RTL/LTR editor layout. */
  targetLanguage?: string;
  /** Local translation project: persist OT journal to repo-relative `journal/<BOOK>.jsonl`. */
  projectBookJournalStore?: JournalStore;
  /** Collab room id (book code) when using {@link projectBookJournalStore}. */
  localBookCode?: string;
  onEditorChange?: () => void;
  onController?: (c: ScriptureSessionController | null) => void;
  className?: string;
};

export const EditorPanel = memo(function EditorPanel({
  initialUsfm,
  collabActive,
  wsRelay,
  dcsCreds,
  dcsTarget,
  targetLanguage,
  projectBookJournalStore,
  localBookCode,
  onEditorChange,
  onController,
  className,
}: EditorPanelProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const ctrl = useScriptureSession({
    mountRef,
    initialUsfm,
    collabActive,
    wsRelay,
    dcsCreds,
    dcsTarget,
    targetLanguage,
    projectBookJournalStore,
    localBookCode,
    onEditorChange,
  });

  useEffect(() => {
    onController?.(ctrl ?? null);
  }, [ctrl, onController]);

  return (
    <div
      ref={mountRef}
      className={cn(
        'pm text-foreground relative h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-2xl border border-border bg-card p-4 shadow-sm',
        className,
      )}
    />
  );
});
