import type { ScriptureSession } from '@usfm-tools/editor';
import type { Door43LanguageOption } from '@/dcs-client';
import type { SourceSlotSnapshot } from '@/components/alignment/AlignmentSourcePicker';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlignmentEditor } from '@/components/alignment/AlignmentEditor';

type Props = {
  session: ScriptureSession;
  /** All source slots from ReferenceColumn (for the alignment source picker). */
  sourceSlots: ReadonlyArray<SourceSlotSnapshot>;
  open: boolean;
  onClose: () => void;
  dcsAuth: { host: string; token?: string } | null;
  /** Called when user wants to add a DCS language from the alignment picker. */
  onRequestAddDcsLanguage: (lang: Door43LanguageOption) => void;
  /** Mirrors app theme (`document` / `document-dark`) for `data-usfm-theme`. */
  usfmTheme?: 'document' | 'document-dark';
};

export function AlignmentPanel({
  session,
  sourceSlots,
  open,
  onClose,
  dcsAuth,
  onRequestAddDcsLanguage,
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
          sourceSlots={sourceSlots}
          overlayOpen={open}
          dcsAuth={dcsAuth}
          onRequestAddDcsLanguage={onRequestAddDcsLanguage}
        />
      </div>
    </div>
  );
}
