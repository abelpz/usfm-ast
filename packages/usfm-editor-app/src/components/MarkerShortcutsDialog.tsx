import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DEFAULT_MARKER_SHORTCUTS,
  getStoredMarkerShortcuts,
  labelForMarker,
  MARKER_SHORTCUT_LABELS,
  SHORTCUT_SPECIAL,
  setStoredMarkerShortcuts,
  type MarkerShortcut,
} from '@/marker-shortcuts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Convert a KeyboardEvent to a ProseMirror-style key binding string. */
function eventToKeyBinding(e: KeyboardEvent): string {
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return '';
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Mod');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  // Single printable character: use uppercase; otherwise use the key name as-is.
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(k);
  return parts.join('-');
}

/** Pretty-print a ProseMirror binding for display (Mod → Ctrl/⌘, etc.). */
function displayBinding(binding: string): string {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  return binding
    .split('-')
    .map((part) => {
      if (part === 'Mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'Shift') return isMac ? '⇧' : 'Shift';
      if (part === 'Alt') return isMac ? '⌥' : 'Alt';
      return part;
    })
    .join(isMac ? '' : '+');
}

interface RowProps {
  shortcut: MarkerShortcut;
  onChange: (next: MarkerShortcut) => void;
  onDelete: () => void;
}

function ShortcutRow({ shortcut, onChange, onDelete }: RowProps) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startRecording = useCallback(() => {
    setRecording(true);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();
      const binding = eventToKeyBinding(e.nativeEvent);
      if (!binding) return;
      if (e.key === 'Escape') {
        setRecording(false);
        inputRef.current?.blur();
        return;
      }
      onChange({ ...shortcut, key: binding });
      setRecording(false);
      inputRef.current?.blur();
    },
    [recording, onChange, shortcut],
  );

  return (
    <div className="flex items-center gap-2">
      {/* Marker picker */}
      <select
        className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
        value={shortcut.marker}
        onChange={(e) => onChange({ ...shortcut, marker: e.target.value })}
      >
        {MARKER_SHORTCUT_LABELS.map((m) => (
          <option key={m.marker} value={m.marker}>
            {m.label}
          </option>
        ))}
        {/* If the stored marker isn't in the preset list, show it as an extra option */}
        {!MARKER_SHORTCUT_LABELS.some((m) => m.marker === shortcut.marker) && (
          <option value={shortcut.marker}>{labelForMarker(shortcut.marker)}</option>
        )}
      </select>

      {/* Key binding recorder */}
      <div className="relative shrink-0">
        <input
          ref={inputRef}
          readOnly
          className={`border-input bg-background w-36 cursor-pointer rounded-md border px-2 py-1 text-center text-xs font-mono transition-colors ${
            recording
              ? 'border-primary ring-ring/50 ring-2 outline-none'
              : 'hover:border-foreground/40'
          }`}
          value={recording ? 'Press keys…' : displayBinding(shortcut.key)}
          aria-label="Key binding — click then press your desired shortcut"
          onFocus={startRecording}
          onKeyDown={handleKeyDown}
          onBlur={() => setRecording(false)}
        />
        {!recording && (
          <Keyboard className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2" />
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive size-7 shrink-0"
        aria-label="Remove shortcut"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function MarkerShortcutsDialog({ open, onOpenChange }: Props) {
  const [shortcuts, setShortcuts] = useState<MarkerShortcut[]>(() => getStoredMarkerShortcuts());

  // Re-load from storage whenever the dialog opens.
  useEffect(() => {
    if (open) setShortcuts(getStoredMarkerShortcuts());
  }, [open]);

  const handleChange = useCallback((idx: number, next: MarkerShortcut) => {
    setShortcuts((prev) => prev.map((s, i) => (i === idx ? next : s)));
  }, []);

  const handleDelete = useCallback((idx: number) => {
    setShortcuts((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAdd = useCallback(() => {
    setShortcuts((prev) => [
      ...prev,
      { marker: SHORTCUT_SPECIAL.VERSE, key: '' },
    ]);
  }, []);

  const handleReset = useCallback(() => {
    setShortcuts([...DEFAULT_MARKER_SHORTCUTS]);
  }, []);

  const handleSave = useCallback(() => {
    const valid = shortcuts.filter((s) => s.marker && s.key);
    setStoredMarkerShortcuts(valid);
    onOpenChange(false);
  }, [shortcuts, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Marker shortcuts</DialogTitle>
          <DialogDescription>
            Assign keyboard shortcuts to insert USFM markers. Click a key binding field and press
            your desired key combination.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {shortcuts.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No shortcuts configured. Click "Add shortcut" to create one.
            </p>
          )}
          {shortcuts.map((sc, idx) => (
            <ShortcutRow
              key={idx}
              shortcut={sc}
              onChange={(next) => handleChange(idx, next)}
              onDelete={() => handleDelete(idx)}
            />
          ))}
        </div>

        <div className="flex justify-start">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleAdd}>
            <Plus className="size-3.5" />
            Add shortcut
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            Reset to defaults
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
