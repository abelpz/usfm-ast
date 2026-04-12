import type { ScriptureSession, SourceTextSession } from '@usfm-tools/editor';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlignmentEditor } from '@/components/alignment/AlignmentEditor';

type Props = {
  session: ScriptureSession;
  sourceTextSession: SourceTextSession | null;
  open: boolean;
  onClose: () => void;
  /** Mirrors app theme (`document` / `document-dark`) for `data-usfm-theme`. */
  usfmTheme?: 'document' | 'document-dark';
};

export function AlignmentPanel({
  session,
  sourceTextSession,
  open,
  onClose,
  usfmTheme = 'document',
}: Props) {
  if (!open) return null;

  return (
    <div
      className="bg-background fixed inset-0 z-40 flex flex-col"
      data-usfm-theme={usfmTheme}
    >
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="mr-1 size-4" />
          Back to editor
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <AlignmentEditor
          session={session}
          sourceTextSession={sourceTextSession}
          overlayOpen={open}
        />
      </div>
    </div>
  );
}
