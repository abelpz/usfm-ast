import {
  useScriptureSession,
  type ScriptureSessionController,
} from '@/hooks/useScriptureSession';
import type { DcsStoredCredentials, DcsStoredTarget } from '@/lib/dcs-storage';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

export type EditorPanelProps = {
  initialUsfm: string;
  collabActive: boolean;
  wsRelay: string;
  dcsCreds: DcsStoredCredentials | null;
  dcsTarget: DcsStoredTarget | null;
  onEditorChange?: () => void;
  onController?: (c: ScriptureSessionController | null) => void;
  className?: string;
};

export function EditorPanel({
  initialUsfm,
  collabActive,
  wsRelay,
  dcsCreds,
  dcsTarget,
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
    onEditorChange,
  });

  useEffect(() => {
    onController?.(ctrl ?? null);
  }, [ctrl, onController]);

  return (
    <div
      ref={mountRef}
      className={cn(
        'pm text-foreground min-h-[min(420px,55vh)] min-w-0 flex-1 rounded-2xl border border-border bg-card p-4 shadow-sm',
        className,
      )}
    />
  );
}
