/**
 * ThreePaneConflictView — Phase 5 conflict UX
 *
 * Layout:
 *   ┌─────────────────────┬──────────────────────┐
 *   │  Ours  (read-only)  │  Theirs (read-only)  │
 *   └─────────────────────┴──────────────────────┘
 *   ┌──────────────────────────────────────────────┐
 *   │  Custom  (editable)                          │
 *   └──────────────────────────────────────────────┘
 *
 * The editable pane is pre-populated with `initialValue` (usually the
 * auto-stitch result or `oursText`).  The user can freely edit it, copy
 * from either side, or type their own content.  The parent receives
 * updates via `onChange` and commits the result on "Apply".
 *
 * Read-only panes diff the current custom value against each side and
 * show a small badge with the number of differing lines.
 */

import { useCallback, useMemo, useRef } from 'react';
import { ArrowDownToLine, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count lines that differ between `a` and `b` (symmetric). */
function differingLineCount(a: string, b: string): number {
  const la = a.split('\n');
  const lb = b.split('\n');
  const len = Math.max(la.length, lb.length);
  let diff = 0;
  for (let i = 0; i < len; i++) {
    if (la[i] !== lb[i]) diff++;
  }
  return diff;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ReadOnlyPaneProps = {
  label: string;
  text: string;
  diffLines: number;
  onCopyDown: () => void;
  className?: string;
};

function ReadOnlyPane({ label, text, diffLines, onCopyDown, className }: ReadOnlyPaneProps) {
  return (
    <div className={cn('flex min-h-0 flex-col rounded-md border bg-muted/20', className)}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-semibold text-foreground/80">{label}</span>
        <div className="flex items-center gap-2">
          {diffLines > 0 && (
            <span
              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              title={`${diffLines} line${diffLines === 1 ? '' : 's'} differ from custom`}
            >
              {diffLines} Δ
            </span>
          )}
          {diffLines === 0 && text.length > 0 && (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
              ✓ same
            </span>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            title={`Copy "${label}" into the custom pane`}
            onClick={onCopyDown}
          >
            <ArrowDownToLine className="size-3.5" />
          </Button>
        </div>
      </div>
      {/* Body */}
      <pre
        className="scrollbar-panel-y min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground/80"
        aria-label={`${label} content (read-only)`}
      >
        {text || <span className="italic text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface ThreePaneConflictViewProps {
  oursText: string;
  theirsText: string;
  /** Pre-populated value for the editable pane (auto-merged stitch or oursText). */
  value: string;
  onChange: (newValue: string) => void;
  oursLabel?: string;
  theirsLabel?: string;
  /** Extra class for the root container. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ThreePaneConflictView({
  oursText,
  theirsText,
  value,
  onChange,
  oursLabel = 'Yours (local)',
  theirsLabel = 'Theirs (remote)',
  className,
}: ThreePaneConflictViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const oursDiff = useMemo(() => differingLineCount(oursText, value), [oursText, value]);
  const theirsDiff = useMemo(() => differingLineCount(theirsText, value), [theirsText, value]);

  const handleCopyOurs = useCallback(() => {
    onChange(oursText);
    textareaRef.current?.focus();
  }, [onChange, oursText]);

  const handleCopyTheirs = useCallback(() => {
    onChange(theirsText);
    textareaRef.current?.focus();
  }, [onChange, theirsText]);

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard may be unavailable — ignore */
    }
  }, [value]);

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {/* Row 1: Ours + Theirs (read-only) */}
      <div className="grid min-h-0 flex-none grid-cols-2 gap-2" style={{ height: '40%', minHeight: '8rem' }}>
        <ReadOnlyPane
          label={oursLabel}
          text={oursText}
          diffLines={oursDiff}
          onCopyDown={handleCopyOurs}
        />
        <ReadOnlyPane
          label={theirsLabel}
          text={theirsText}
          diffLines={theirsDiff}
          onCopyDown={handleCopyTheirs}
        />
      </div>

      {/* Row 2: Custom editable pane */}
      <div className="flex min-h-0 flex-1 flex-col rounded-md border bg-background">
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
          <span className="text-xs font-semibold text-foreground/80">Custom (edit)</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {value.split('\n').length} lines
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              title="Copy custom text to clipboard"
              onClick={handleCopyToClipboard}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'scrollbar-panel-y min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed text-foreground',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0',
          )}
          aria-label="Custom merge result (editable)"
          spellCheck={false}
          placeholder="Type your own resolution here, or copy from Yours / Theirs above…"
        />
      </div>
    </div>
  );
}
