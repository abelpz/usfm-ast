import { ArrowDownToLine, Combine, Split, Trash2, Unlink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  verseSids: string[];
  verseSid: string;
  onVerseSid: (sid: string) => void;
  progress: { alignedWordCount: number; totalWordCount: number; percent: number };
  mergeDisabled: boolean;
  splitDisabled: boolean;
  insertDisabled: boolean;
  unlinkDisabled: boolean;
  onMerge: () => void;
  onSplit: () => void;
  onInsert: () => void;
  onUnlink: () => void;
  onClearVerse: () => void;
  alignmentLayerKeys?: string[];
  activeAlignmentKey?: string | null;
  onAlignmentLayerChange?: (key: string) => void;
};

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  /** Screen reader only; no visible tooltip. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button type="button" size="icon" variant="secondary" disabled={disabled} aria-label={label} onClick={onClick}>
      {children}
    </Button>
  );
}

export function AlignmentToolbar({
  verseSids,
  verseSid,
  onVerseSid,
  progress,
  mergeDisabled,
  splitDisabled,
  insertDisabled,
  unlinkDisabled,
  onMerge,
  onSplit,
  onInsert,
  onUnlink,
  onClearVerse,
  alignmentLayerKeys,
  activeAlignmentKey,
  onAlignmentLayerChange,
}: Props) {
  const showLayers =
    alignmentLayerKeys && alignmentLayerKeys.length > 1 && activeAlignmentKey != null && onAlignmentLayerChange;

  return (
    <div className="border-border bg-background border-b pb-3">
    <div className="flex flex-wrap items-center gap-2">
      {showLayers ? (
        <div className="flex items-center gap-2">
          <span className="sr-only">Layer</span>
          <Select value={activeAlignmentKey ?? ''} onValueChange={onAlignmentLayerChange}>
            <SelectTrigger className="h-9 w-[min(220px,50vw)]" aria-label="Alignment layer">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {alignmentLayerKeys!.map((k) => (
                <SelectItem key={k} value={k}>
                  {k === '__embedded__' ? 'Embedded (USFM)' : k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="sr-only">Verse</span>
        <Select value={verseSid} onValueChange={onVerseSid}>
          <SelectTrigger className="h-9 w-[min(280px,70vw)]" aria-label="Verse">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {verseSids.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
        {progress.percent}% ({progress.alignedWordCount}/{progress.totalWordCount})
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <IconButton label="Join selected boxes" disabled={mergeDisabled} onClick={onMerge}>
          <Combine className="size-4" aria-hidden />
        </IconButton>
        <IconButton
          label="Separate selected box or reference word"
          disabled={splitDisabled}
          onClick={onSplit}
        >
          <Split className="size-4" aria-hidden />
        </IconButton>
        <IconButton
          label="Add selected words to selected box"
          disabled={insertDisabled}
          onClick={onInsert}
        >
          <ArrowDownToLine className="size-4" aria-hidden />
        </IconButton>
        <IconButton label="Remove words from selected box" disabled={unlinkDisabled} onClick={onUnlink}>
          <Unlink className="size-4" aria-hidden />
        </IconButton>
        <IconButton label="Clear all links in this verse" disabled={false} onClick={onClearVerse}>
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      </div>
    </div>
    </div>
  );
}
