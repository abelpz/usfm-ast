import { ConflictSolverPanel, type ConflictResolution } from '@/components/ConflictSolverPanel';
import type { FileConflict } from '@usfm-tools/types';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

export type SyncConflictDialogProps = {
  open: boolean;
  conflicts: FileConflict[];
  onClose: () => void;
  /** Apply chosen side and persist to project storage. */
  onResolve: (
    path: string,
    choice: 'ours' | 'theirs' | 'merged',
    mergedText?: string,
  ) => void;
  defaultOursLabel?: string;
  defaultTheirsLabel?: string;
};

export function SyncConflictDialog({
  open,
  conflicts,
  onClose,
  onResolve,
  defaultOursLabel,
  defaultTheirsLabel,
}: SyncConflictDialogProps) {
  if (!open || conflicts.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="usfm-conflict-dialog w-[95vw] max-w-[min(95vw,1600px)] sm:max-w-[min(95vw,1600px)] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <ConflictSolverPanel
          conflicts={conflicts}
          onClose={onClose}
          onResolve={onResolve}
          defaultOursLabel={defaultOursLabel}
          defaultTheirsLabel={defaultTheirsLabel}
          className="h-full"
        />
      </DialogContent>
    </Dialog>
  );
}
