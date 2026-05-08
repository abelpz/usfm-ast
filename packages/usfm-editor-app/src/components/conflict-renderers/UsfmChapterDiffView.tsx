/**
 * USFM chapter diff renderer — read-only, editor-themed.
 *
 * Features:
 * - Always shows ALL chapters in the chapter strip.  Chapters in
 *   chapterIndices are marked with a red dot.  Each conflicting chapter
 *   Whole-chapter resolution is controlled by the parent (e.g. panel header), not duplicated here.
 * - Default pane tab is "Resolve": a vertical stack of paragraph cards.
 *   Each conflicting card shows two clickable SideBlocks — click to select,
 *   click again to clear.  No Mine/Theirs buttons needed.
 * - Paragraph layout SideBlocks are plain text (no word-level diff) so structure picks are not confused with content merge.
 * - Verse drill-down (when needed) shows word-level highlights in verse cards only; after a layout pick,
 *   the paragraph pair is hidden so only verses (and a back control) remain.
 * - Additional tabs: Yours / Theirs / Base / Raw diff.
 * - Alignment-only verses use a dashed blue accent; optional detail panel expands for group wiring.
 * - ProseMirror-look rendering via .usfm-verse/.usfm-verse-num/.usfm-para.
 * - Purely controlled for nested picks — parent owns state via new props.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Code2, RotateCcw, X } from 'lucide-react';
import { USFMParser } from '@usfm-tools/parser';
import { splitUsjByChapter, stripAlignments, type ChapterSlice } from '@usfm-tools/editor-core';
import type { UsjDocument } from '@usfm-tools/editor-core';
import { PlainTextDiffView } from './PlainTextDiffView';
import {
  collectSegments,
  diffSegments,
  segmentText,
  fingerprintsFromAlignmentMap,
  unifiedLineDiff,
  collectParagraphs,
  diffParagraphs,
  enrichWithVerses,
  mergeParaDisplaySegments,
  wordDiff,
  tokenizeWords,
  diffWordAlignments,
  alignmentGroupPickKey,
  resolveAlignmentGroupSide,
  mergedAlignmentGroups,
  type RenderSegment,
  type DiffedSegment,
  type SegmentChange,
  type DiffLine,
  type EnrichedParagraphHunk,
  type VerseHunk,
  type WordToken,
  type VerseAlignment,
  type AlignGroup,
  type AlignmentChange,
  type AlignmentGroupPicks,
  type SidePick,
} from './usfm-diff-logic';
import type { HunkRequirements } from './usfm-stitch';

export type { RenderSegment, DiffedSegment, SegmentChange } from './usfm-diff-logic';
export { collectSegments, diffSegments } from './usfm-diff-logic';

export interface UsfmChapterDiffViewProps {
  oursText: string;
  theirsText: string;
  baseText?: string;
  /** Chapter numbers that have merge conflicts (used only for marking, not filtering). */
  chapterIndices?: number[];
  /** Optional externally controlled active chapter. */
  activeChapter?: number | null;
  /** Hide the internal chapter strip when an outer workspace navigator is present. */
  showChapterStrip?: boolean;
  oursLabel?: string;
  theirsLabel?: string;
  baseLabel?: string;

  // ── Nested-pick control props (all optional — purely controlled) ──────────
  chapterPicks?: Map<number, 'ours' | 'theirs'>;
  paragraphPicks?: Map<string, 'ours' | 'theirs'>;
  versePicks?: Map<string, 'ours' | 'theirs'>;
  alignmentGroupPicks?: AlignmentGroupPicks;
  /** Whole-chapter picks are expected from the parent shell (e.g. dialog header), not rendered inside this view. */
  onChapterPick?: (chapter: number, side: 'ours' | 'theirs' | null) => void;
  onParagraphPick?: (hunkId: string, side: 'ours' | 'theirs' | null) => void;
  onVersePick?: (hunkId: string, side: 'ours' | 'theirs' | null) => void;
  onAlignmentGroupPick?: (verseHunkId: string, groupId: string, side: 'ours' | 'theirs' | null) => void;
  onActiveChapterChange?: (chapter: number) => void;
  /**
   * Called once per chapter whenever the diff is (re)computed so the parent
   * dialog knows the full hunk structure for readiness gating.
   */
  onHunksDiscovered?: (info: HunkRequirements) => void;
}

type PaneTab = 'hunks' | 'ours' | 'theirs' | 'base' | 'raw';

// ---------------------------------------------------------------------------
// Alignment colour palette (matches GROUP_STYLES from AlignmentEditor)
// ---------------------------------------------------------------------------

/** Maps `AlignGroup.paletteIdx % length` to a Tailwind underline class. */
const ALIGNMENT_UNDERLINES = [
  'underline decoration-blue-500/70 decoration-solid decoration-2',
  'underline decoration-emerald-500/70 decoration-solid decoration-2',
  'underline decoration-amber-500/70 decoration-solid decoration-2',
  'underline decoration-pink-500/70 decoration-solid decoration-2',
  'underline decoration-violet-500/70 decoration-solid decoration-2',
  'underline decoration-teal-500/70 decoration-solid decoration-2',
];

/** Maps `AlignGroup.paletteIdx % length` to border + background classes. */
const ALIGNMENT_BORDERS = [
  'border-blue-500/50 bg-blue-500/10',
  'border-emerald-500/50 bg-emerald-500/10',
  'border-amber-500/50 bg-amber-500/10',
  'border-pink-500/50 bg-pink-500/10',
  'border-violet-500/50 bg-violet-500/10',
  'border-teal-500/50 bg-teal-500/10',
];

// ---------------------------------------------------------------------------
// USJ parsing helpers
// ---------------------------------------------------------------------------

function parseUsj(usfm: string): UsjDocument | null {
  try {
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm || '\\id XXX\n');
    return p.toJSON() as UsjDocument;
  } catch {
    return null;
  }
}

function allSlices(usj: UsjDocument): ChapterSlice[] {
  return splitUsjByChapter(usj);
}

function chapterLabel(ch: number): string {
  return ch === 0 ? 'Title & intro' : `Chapter ${ch}`;
}

// ---------------------------------------------------------------------------
// Rendering helpers — change classes
// ---------------------------------------------------------------------------

function changeBgClass(change: SegmentChange): string {
  if (change === 'removed') return 'border-l-2 border-red-400 bg-red-50/60 dark:bg-red-950/20';
  if (change === 'added') return 'border-l-2 border-green-500 bg-green-50/60 dark:bg-green-950/20';
  if (change === 'modified') return 'border-l-2 border-yellow-400 bg-yellow-50/60 dark:bg-yellow-950/20';
  if (change === 'alignment-only') return 'border-l-2 border-blue-400 bg-blue-50/60 dark:bg-blue-950/20';
  return '';
}

// ---------------------------------------------------------------------------
// Paragraph grouping & segment rendering (for ScripturePane / full-chapter view)
// ---------------------------------------------------------------------------

interface ParaGroup {
  marker?: string;
  change: SegmentChange;
  inline: DiffedSegment[];
}

function groupByParagraph(segments: DiffedSegment[]): ParaGroup[] {
  const groups: ParaGroup[] = [];
  let current: ParaGroup | null = null;
  for (const seg of segments) {
    if (seg.kind === 'para-break') {
      if (current) groups.push(current);
      current = { marker: seg.marker, change: seg.change, inline: [] };
    } else {
      if (!current) current = { marker: undefined, change: 'unchanged', inline: [] };
      current.inline.push(seg);
    }
  }
  if (current && current.inline.length > 0) groups.push(current);
  return groups;
}

/** Render one inline segment using the correct ProseMirror-like markup. */
function renderInlineSegment(seg: DiffedSegment, key: number): React.ReactNode {
  const changeCls = changeBgClass(seg.change);
  if (seg.kind === 'verse') {
    // Use .usfm-verse / .usfm-verse-num to match the editor's verse-nodeview
    // markup so the document-theme --usfm-verse-* tokens apply automatically.
    return (
      <span key={key} className={`usfm-verse ${changeCls}`} data-verse={seg.verseNum}>
        <span className="usfm-verse-num">{seg.verseNum}</span>
        {seg.change === 'alignment-only' && (
          <span className="usfm-diff-alignment-badge ml-1 text-[9px] font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded px-1 align-middle">
            ≅ alignment
          </span>
        )}
      </span>
    );
  }
  if (seg.kind === 'footnote') {
    return (
      <sup key={key} className={`usfm-char usfm-diff-footnote ${changeCls}`} data-marker={seg.marker ?? 'f'} title={seg.text}>
        ‡
      </sup>
    );
  }
  return <span key={key} className={changeCls || undefined}>{seg.text}</span>;
}

function renderGroups(groups: ParaGroup[]): React.ReactNode[] {
  return groups.map((group, gi) => (
    <div key={gi} className={`usfm-para ${changeBgClass(group.change)}`} data-marker={group.marker ?? 'p'}>
      {group.inline.map((seg, si) => renderInlineSegment(seg, si))}
    </div>
  ));
}

// ---------------------------------------------------------------------------
// ScripturePane — display segments as ProseMirror-look read-only view
// ---------------------------------------------------------------------------

function ScripturePane({ segments, label }: { segments: DiffedSegment[]; label: string }) {
  const hasContent = segments.some(
    (s) => s.kind === 'text' || s.kind === 'verse' || s.kind === 'intro-heading' || s.kind === 'heading-text',
  );
  const groups = useMemo(() => groupByParagraph(segments), [segments]);
  return (
    <div className="usfm-diff-scripture-pane">
      <div className="usfm-diff-pane-label text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">
        {label}
      </div>
      <div className="ProseMirror usfm-diff-prosemirror-root" contentEditable={false} data-usfm-theme="document" suppressContentEditableWarning>
        {hasContent ? renderGroups(groups) : <p className="text-xs text-muted-foreground italic">No content</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RawUsfmDiffPane
// ---------------------------------------------------------------------------

function RawUsfmDiffPane({ oursText, theirsText }: { oursText: string; theirsText: string }) {
  const lines = useMemo(() => unifiedLineDiff(oursText, theirsText), [oursText, theirsText]);
  return (
    <div className="usfm-diff-raw-pane">
      <pre className="usfm-diff-raw text-xs leading-snug font-mono overflow-x-auto whitespace-pre-wrap break-all">
        {lines.map((l: DiffLine, i: number) => (
          <div
            key={i}
            className={
              l.kind === 'add'
                ? 'bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200'
                : l.kind === 'remove'
                  ? 'bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200'
                  : 'text-muted-foreground'
            }
          >
            <span className="select-none mr-2 opacity-60 font-bold">
              {l.kind === 'add' ? '+' : l.kind === 'remove' ? '−' : ' '}
            </span>
            {l.text || '\u00A0'}
          </div>
        ))}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers for the Hunks pane
// ---------------------------------------------------------------------------

/**
 * Punctuation that should attach to the preceding word (no space before).
 * Matches strings that START with closing/trailing punctuation.
 */
const ATTACHES_LEFT = /^[.,;:!?)\]}»"'\u2019\u201D]/;

/**
 * Punctuation that should attach to the following word (no space after).
 * Matches strings that END with opening/leading punctuation.
 */
const ATTACHES_RIGHT = /[¡¿([{«"'\u2018\u201C]$/;

/**
 * Extract plain text from display segments for use as `wordDiff` input.
 *
 * Two alignment strategies produce very different segment granularity:
 * - Aligned USFM: one tiny segment per word/punctuation, e.g. ['vivir', '.', 'Ellos']
 * - Un-aligned USFM: one big run per text node, e.g. ['vivir. Ellos dicen...']
 *
 * Strategy: join segments with a synthetic space ONLY when both sides lack
 * whitespace at the boundary AND the incoming segment is not attaching
 * punctuation (like '.' or ',') and the outgoing segment does not end with
 * opening punctuation (like '¡' or '"').  This produces the same joined
 * string regardless of segmentation, so the LCS finds the correct matches.
 *
 * The synthetic spaces are whitespace tokens in `wordDiff` and are always
 * classified `unchanged`, so they never create false-positive highlights.
 */
function extractPlainText(segs: DiffedSegment[]): string {
  let out = '';
  for (const s of segs) {
    if (s.kind !== 'text' && s.kind !== 'intro-heading' && s.kind !== 'heading-text') continue;
    const needsSpace =
      out.length > 0 &&
      !/\s$/.test(out) &&
      !/^\s/.test(s.text) &&
      !ATTACHES_LEFT.test(s.text) &&
      !ATTACHES_RIGHT.test(out);
    if (needsSpace) out += ' ';
    out += s.text;
  }
  return out;
}

// ---------------------------------------------------------------------------
// SideBlock — clickable block showing one side's scripture content
// ---------------------------------------------------------------------------

/**
 * A full-block clickable card that shows one side's content.
 * Clicking it selects (or de-selects) this side as the pick at the current level.
 * When `wordTokens` are provided, text segments render individual word spans
 * with red/green highlights for removed/added words.
 * When `wordAlignment` is provided, aligned words receive palette-coloured
 * underlines matching the editor's AlignmentEditor visual style.
 */
/**
 * Visual block for one side of a conflict hunk.
 *
 * `side === 'ours'`   → reference (what's currently in the project).  Read-only; no action buttons.
 * `side === 'theirs'` → incoming change.  Has Accept / Decline buttons (or Keep / Remove when isOnlyBlock).
 * `isOnlyBlock`       → the hunk has only this side (ours-only or theirs-only).
 */
function SideBlock({
  side,
  label,
  segments,
  wordTokens,
  wordAlignment,
  currentPick,
  onPick,
  isOnlyBlock = false,
  disabled = false,
}: {
  side: 'ours' | 'theirs';
  label: string;
  segments: DiffedSegment[];
  wordTokens?: WordToken[];
  wordAlignment?: VerseAlignment;
  currentPick: 'ours' | 'theirs' | undefined;
  onPick: (side: 'ours' | 'theirs' | null) => void;
  isOnlyBlock?: boolean;
  disabled?: boolean;
}) {
  // Map each text-like segment index → the WordToken slice to render.
  //
  // Aligned USFM produces one tiny text segment per word with no surrounding
  // whitespace.  extractPlainText normalises this by inserting a synthetic
  // space between segments, so wordDiff produces space tokens that are not
  // present in any single segment's .text.
  //
  // This useMemo walks the segments with a cursor and:
  //   1. When the token stream points at a synthetic inter-segment space
  //      (isSpace === true AND the current segment's text doesn't start with
  //      whitespace), it includes that space token in the CURRENT segment's
  //      slot so words don't run together visually.
  //   2. Then consumes tokenizeWords(seg.text).length tokens for the
  //      segment's own content.
  //
  // Result: the per-segment token slices correctly cover the full stream with
  // no duplicated or skipped tokens, regardless of whether the USFM was
  // aligned (many tiny segments) or un-aligned (one big segment per run).
  const segmentTokens = useMemo<Map<number, WordToken[]>>(() => {
    const map = new Map<number, WordToken[]>();
    if (!wordTokens || wordTokens.length === 0) return map;
    let cursor = 0;
    segments.forEach((seg, i) => {
      if (seg.kind !== 'text' && seg.kind !== 'intro-heading' && seg.kind !== 'heading-text') return;
      const slotTokens: WordToken[] = [];
      // Include the synthetic inter-segment space (if present) so that words
      // from adjacent tiny aligned-USFM segments stay visually separated.
      if (cursor < wordTokens.length && wordTokens[cursor].isSpace && !/^\s/.test(seg.text)) {
        slotTokens.push(wordTokens[cursor++]);
      }
      // Consume the tokens that correspond to this segment's own text.
      const segWordCount = tokenizeWords(seg.text).length;
      for (let k = 0; k < segWordCount && cursor < wordTokens.length; k++) {
        slotTokens.push(wordTokens[cursor++]);
      }
      if (slotTokens.length > 0) map.set(i, slotTokens);
    });
    return map;
  }, [segments, wordTokens]);

  // For alignment-only rendering: per-segment, per-token underline classes.
  // Walks wordAlignment.words in document order, matching each rendered word
  // token to a \w entry to determine its palette underline class.
  const segmentAlignmentClasses = useMemo<Map<number, string[]>>(() => {
    if (!wordAlignment || wordAlignment.words.length === 0) return new Map();
    const result = new Map<number, string[]>();
    let wordIdx = 0;
    segments.forEach((seg, si) => {
      if (seg.kind !== 'text' && seg.kind !== 'intro-heading' && seg.kind !== 'heading-text') return;
      const toks = tokenizeWords(seg.text);
      const classes: string[] = [];
      for (const tok of toks) {
        if (/^\s+$/.test(tok)) { classes.push(''); continue; }
        const word = wordAlignment.words[wordIdx];
        if (word && word.text === tok) {
          wordIdx++;
          if (word.groupId !== undefined) {
            const group = wordAlignment.groups.find((g) => g.id === word.groupId);
            const pidx = (group?.paletteIdx ?? 0) % ALIGNMENT_UNDERLINES.length;
            classes.push(ALIGNMENT_UNDERLINES[pidx]);
          } else {
            classes.push('');
          }
        } else {
          classes.push(''); // unmatched token — no alignment class
        }
      }
      result.set(si, classes);
    });
    return result;
  }, [wordAlignment, segments]);

  // Group segments preserving original indices (needed to look up tokenSlices).
  type SideBlockGroupItem = { seg: DiffedSegment; origIdx: number };
  type SideBlockGroup = { marker?: string; items: SideBlockGroupItem[] };
  const groups = useMemo<SideBlockGroup[]>(() => {
    const result: SideBlockGroup[] = [];
    let current: SideBlockGroup | null = null;
    segments.forEach((seg, origIdx) => {
      if (seg.kind === 'para-break') {
        if (current) result.push(current);
        current = { marker: seg.marker, items: [] };
      } else {
        if (!current) current = { marker: undefined, items: [] };
        current.items.push({ seg, origIdx });
      }
    });
    if (current && (current as SideBlockGroup).items.length > 0) result.push(current);
    return result;
  }, [segments]);

  const isOurs = side === 'ours';

  // ── Derived state ────────────────────────────────────────────────────────
  const isSelected = currentPick === side;
  const isHidden   = currentPick !== undefined && currentPick !== side;

  // Hide the unchosen block once a pick is made (changed hunks only).
  if (!isOnlyBlock && isHidden) return null;

  // When selected, suppress diff word-highlights so the chosen text reads cleanly.
  const suppressHighlights = isSelected;

  // ── Card styling ──────────────────────────────────────────────────────────
  //
  // Both sides are selectable cards. Ours = neutral border. Theirs = blue border
  // with a dot indicator when undecided. Selected = stronger border, no pointer.

  const cardCls = isOurs
    ? isSelected
      ? 'border-2 border-border rounded-md'
      : 'border border-border rounded-md hover:border-muted-foreground/50 cursor-pointer'
    : isSelected
      ? 'border-2 border-blue-500 rounded-md bg-blue-50/30 dark:bg-blue-950/10'
      : 'border-2 border-blue-400 dark:border-blue-500 rounded-md hover:border-blue-600 cursor-pointer';

  // ── Action bar helpers ────────────────────────────────────────────────────
  const iconBtn = 'rounded p-1 transition-colors flex items-center justify-center';
  const acceptBtn = `${iconBtn} text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200`;
  const declineBtn = `${iconBtn} text-muted-foreground hover:bg-muted`;
  const undoBtn = `${iconBtn} text-muted-foreground hover:bg-muted`;

  // When selected (and not isOnlyBlock), show only a small undo button.
  const selectedBar = isSelected && !isOnlyBlock ? (
    <div className="mt-2 pt-2 border-t border-border/60 flex justify-end">
      <button
        type="button"
        title="Undo"
        onClick={(e) => { e.stopPropagation(); onPick(null); }}
        className={undoBtn}
      >
        <RotateCcw className="size-3" />
      </button>
    </div>
  ) : null;

  // Placeholder — kept for the reference but unused in changed-hunk mode.
  const incomingActionBar = null;

  // currentPick aliases for isOnlyBlock action bars (these blocks have no counterpart to hide).
  const pickedOurs   = currentPick === 'ours';
  const pickedTheirs = currentPick === 'theirs';
  const noPick       = currentPick === undefined;

  // Single-side (ours-only / theirs-only) action bar.
  const onlyBlockActionBar = isOnlyBlock ? (
    <div className="mt-2 pt-2 border-t border-border/60 flex items-center gap-1.5">
      {isOurs ? (
        noPick ? (
          <>
            <button type="button" title="Keep" onClick={() => onPick('ours')}
              className={`${iconBtn} text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200`}>
              <Check className="size-3.5" />
            </button>
            <button type="button" title="Remove" onClick={() => onPick('theirs')} className={declineBtn}>
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            {pickedOurs
              ? <Check className="size-3.5 text-blue-600 dark:text-blue-400" aria-hidden />
              : <X className="size-3.5 text-muted-foreground" aria-hidden />}
            <button type="button" title="Undo" onClick={() => onPick(null)} className={`${undoBtn} ml-auto`}>
              <RotateCcw className="size-3" />
            </button>
          </>
        )
      ) : (
        noPick ? (
          <>
            <button type="button" title="Accept" onClick={() => onPick('theirs')} className={acceptBtn}>
              <Check className="size-3.5" />
            </button>
            <button type="button" title="Ignore" onClick={() => onPick('ours')} className={declineBtn}>
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            {pickedTheirs
              ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              : <X className="size-3.5 text-muted-foreground" aria-hidden />}
            <button type="button" title="Undo" onClick={() => onPick(null)} className={`${undoBtn} ml-auto`}>
              <RotateCcw className="size-3" />
            </button>
          </>
        )
      )}
    </div>
  ) : null;

  return (
    <div
      title={label}
      onClick={!isSelected && !disabled && !isOnlyBlock ? () => onPick(side) : undefined}
      className={[
        'transition-all overflow-hidden',
        cardCls,
        disabled ? 'opacity-50 pointer-events-none' : '',
      ].join(' ')}
    >
      <div className="relative px-3 pt-3 pb-2">
        {/* Blue dot on theirs when undecided; check when selected */}
        {!isOurs && (
          <span className="absolute top-2 right-2" aria-hidden>
            {isSelected
              ? <Check className="size-3 text-blue-500" />
              : <span className="block size-2 rounded-full bg-blue-500 ring-2 ring-background" />}
          </span>
        )}
      <div className="ProseMirror text-sm leading-relaxed" contentEditable={false} data-usfm-theme="document" suppressContentEditableWarning>
        {groups.map((group, gi) => (
          <div key={gi} className="usfm-para" data-marker={group.marker ?? 'p'}>
            {group.items.map(({ seg, origIdx }) => {
              if (seg.kind === 'verse') {
                return (
                  <span key={origIdx} className="usfm-verse" data-verse={seg.verseNum}>
                    <span className="usfm-verse-num">{seg.verseNum}</span>
                  </span>
                );
              }
              if (seg.kind === 'footnote') {
                return (
                  <sup key={origIdx} className="usfm-char" data-marker={seg.marker ?? 'f'} title={seg.text}>
                    ‡
                  </sup>
                );
              }
              // text / intro-heading / heading-text
              const tokens = segmentTokens.get(origIdx);
              if (tokens && tokens.length > 0) {
                return (
                  <span key={origIdx}>
                    {tokens.map((t, k) => {
                      const cls = t.isSpace || suppressHighlights
                        ? ''
                        : t.change === 'removed'
                          ? 'bg-red-200/70 dark:bg-red-900/40 text-red-900 dark:text-red-200 rounded-sm px-0.5'
                          : t.change === 'added'
                            ? 'bg-green-200/70 dark:bg-green-900/40 text-green-900 dark:text-green-200 rounded-sm px-0.5'
                            : '';
                      return (
                        <span key={k} className={cls || undefined}>{t.text}</span>
                      );
                    })}
                  </span>
                );
              }
              // Alignment underline rendering (for alignment-only verses)
              const alignClasses = segmentAlignmentClasses.get(origIdx);
              if (alignClasses && alignClasses.length > 0) {
                const toks = tokenizeWords(seg.text);
                return (
                  <span key={origIdx}>
                    {toks.map((t, k) => (
                      <span key={k} className={alignClasses[k] || undefined}>{t}</span>
                    ))}
                  </span>
                );
              }
              return <span key={origIdx}>{seg.text}</span>;
            })}
          </div>
        ))}
      </div>
        {selectedBar}
        {onlyBlockActionBar}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlignmentChangesPanel — read-only collapsible source-group chip panel
// ---------------------------------------------------------------------------

/**
 * Displays alignment differences between two sides of a verse in a
 * style familiar from the editor's AlignmentEditor / AlignmentBox:
 * coloured group cards with source-word header and translation chips.
 */
function AlignmentChangesPanel({
  mineAlignment,
  theirsAlignment,
  changes,
  oursLabel,
  theirsLabel,
}: {
  mineAlignment: VerseAlignment;
  theirsAlignment: VerseAlignment;
  changes: AlignmentChange[];
  oursLabel: string;
  theirsLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (changes.length === 0) return null;

  // Build a unified ordered group list from both sides, computing per-group
  // mine/theirs word lists and status for column rendering.
  interface GroupDisplay {
    id: string;
    source: AlignGroup['source'];
    paletteIdx: number;
    status: 'same' | 'removed' | 'added' | 'rerouted';
    mineWords: string[];
    theirsWords: string[];
  }

  const allGroups = new Map<string, GroupDisplay>();

  for (const g of mineAlignment.groups) {
    const words = g.translationIndices.map((i) => mineAlignment.words[i]?.text ?? '').filter(Boolean);
    allGroups.set(g.id, {
      id: g.id, source: g.source, paletteIdx: g.paletteIdx,
      status: 'same', mineWords: words, theirsWords: [],
    });
  }
  for (const g of theirsAlignment.groups) {
    const words = g.translationIndices.map((i) => theirsAlignment.words[i]?.text ?? '').filter(Boolean);
    const existing = allGroups.get(g.id);
    if (existing) {
      existing.theirsWords = words;
    } else {
      allGroups.set(g.id, {
        id: g.id, source: g.source, paletteIdx: g.paletteIdx,
        status: 'added', mineWords: [], theirsWords: words,
      });
    }
  }

  for (const ch of changes) {
    if (ch.kind === 'group-removed') {
      const e = allGroups.get(ch.mineGroup.id);
      if (e) e.status = 'removed';
    } else if (ch.kind === 'group-added') {
      const e = allGroups.get(ch.theirsGroup.id);
      if (e) e.status = 'added';
    } else if (ch.kind === 'group-rerouted') {
      const e = allGroups.get(ch.mineGroup.id);
      if (e) e.status = 'rerouted';
    }
  }

  const groups = [...allGroups.values()];

  const statusBadge = (status: GroupDisplay['status'], forMine: boolean) => {
    if (status === 'removed' && forMine) return null;
    if (status === 'added' && !forMine) return null;
    if (status === 'removed')
      return <span className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-1 rounded">Removed</span>;
    if (status === 'added')
      return <span className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-1 rounded">Added</span>;
    if (status === 'rerouted')
      return <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-1 rounded">Re-routed</span>;
    return null;
  };

  const renderColumn = (
    label: string,
    getWords: (g: GroupDisplay) => string[],
    isMissing: (g: GroupDisplay) => boolean,
    forMine: boolean,
  ) => (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      <div className="space-y-2">
        {groups.map((g) => {
          const words = getWords(g);
          const missing = isMissing(g);
          const borderCls = ALIGNMENT_BORDERS[g.paletteIdx % ALIGNMENT_BORDERS.length];
          return (
            <div
              key={g.id}
              className={`rounded border p-2 transition-opacity ${borderCls} ${missing ? 'opacity-30' : ''}`}
            >
              {/* Source word header */}
              <div className="flex items-baseline flex-wrap gap-x-1 mb-1.5">
                <span className="font-semibold text-[11px]">{g.source.content}</span>
                <sup className="text-[9px] text-muted-foreground font-mono">{g.source.strong}</sup>
                <span className="text-[9px] text-muted-foreground">· {g.source.lemma}</span>
                <span className="ml-auto">{statusBadge(g.status, forMine)}</span>
              </div>
              {/* Translation word chips */}
              <div className="flex flex-wrap gap-1">
                {words.length === 0 ? (
                  <span className="text-[9px] text-muted-foreground italic">none</span>
                ) : (
                  words.map((w, wi) => (
                    <span
                      key={wi}
                      className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 leading-none"
                    >
                      {w}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mt-2 border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Alignment detail, ${changes.length} groups`}
        title="Alignment detail"
        className="w-full flex items-center justify-between px-3 py-1.5 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/60 dark:hover:bg-blue-950/30 transition-colors"
      >
        <span className="flex items-center gap-1.5 tabular-nums text-blue-700 dark:text-blue-300" aria-hidden>
          <span>≅</span>
          <span>{changes.length}</span>
        </span>
        <span className="text-blue-700/80 dark:text-blue-300/80" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-3 grid grid-cols-2 gap-3 border-t">
          {renderColumn(oursLabel, (g) => g.mineWords, (g) => g.status === 'added', true)}
          {renderColumn(theirsLabel, (g) => g.theirsWords, (g) => g.status === 'removed', false)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VerseHunkCard — click-to-select at verse level
// ---------------------------------------------------------------------------

function VerseHunkCard({
  vh,
  oursLabel,
  theirsLabel,
  versePicks,
  alignmentGroupPicks,
  onVersePick,
  onAlignmentGroupPick,
  disabled,
}: {
  vh: VerseHunk;
  oursLabel: string;
  theirsLabel: string;
  versePicks: Map<string, 'ours' | 'theirs'>;
  alignmentGroupPicks: AlignmentGroupPicks;
  onVersePick: (id: string, side: 'ours' | 'theirs' | null) => void;
  onAlignmentGroupPick: (verseHunkId: string, groupId: string, side: 'ours' | 'theirs' | null) => void;
  disabled: boolean;
}) {
  // Narrow to 'changed' before useMemo so TypeScript can see the .ours/.theirs fields.
  const vhChanged = vh.kind === 'changed' ? vh : null;
  const { oursWordTokens, theirsWordTokens } = useMemo(() => {
    if (!vhChanged) return { oursWordTokens: [] as WordToken[], theirsWordTokens: [] as WordToken[] };
    const oText = extractPlainText(vhChanged.ours.displaySegments.map((s) => ({ ...s, change: 'unchanged' as const })));
    const tText = extractPlainText(vhChanged.theirs.displaySegments.map((s) => ({ ...s, change: 'unchanged' as const })));
    const { oursTokens, theirsTokens } = wordDiff(oText, tText);
    return { oursWordTokens: oursTokens, theirsWordTokens: theirsTokens };
  }, [vhChanged]);

  // For changed/alignment-only verses, compute alignment differences.
  const vhWithAlignment = vh.kind === 'alignment-only' || vh.kind === 'changed' ? vh : null;
  const alignmentChanges = useMemo<AlignmentChange[]>(() => {
    if (!vhWithAlignment) return [];
    return diffWordAlignments(vhWithAlignment.ours.alignment, vhWithAlignment.theirs.alignment);
  }, [vhWithAlignment]);

  const alignmentGroups = useMemo<AlignGroup[]>(() => {
    if (!vhWithAlignment) return [];
    return mergedAlignmentGroups(vhWithAlignment.ours.alignment, vhWithAlignment.theirs.alignment);
  }, [vhWithAlignment]);

  const toUnchanged = (segs: RenderSegment[]) =>
    segs.map((s) => ({ ...s, change: 'unchanged' as const }));

  function renderAlignmentStage(
    defaultSide: SidePick | null,
    mode: 'optional' | 'required',
  ): React.ReactNode {
    if (!vhWithAlignment || alignmentChanges.length === 0 || alignmentGroups.length === 0) return null;
    const unresolvedCount = alignmentGroups.filter((g) => (
      resolveAlignmentGroupSide(vh.id, g.id, defaultSide, alignmentGroupPicks) === null
    )).length;
    return (
      <div
        className="mt-2 border rounded-md px-3 py-2 bg-muted/20"
        role="region"
        aria-label={mode === 'required' ? 'Word alignment choices' : 'Word alignment details'}
      >
        <div className="space-y-2" aria-live={unresolvedCount > 0 ? 'polite' : undefined}>
          {alignmentGroups.map((group, idx) => {
            const key = alignmentGroupPickKey(vh.id, group.id);
            const explicit = alignmentGroupPicks.get(key);
            const effective = resolveAlignmentGroupSide(vh.id, group.id, defaultSide, alignmentGroupPicks);
            const tone = ALIGNMENT_BORDERS[group.paletteIdx % ALIGNMENT_BORDERS.length];
            return (
              <div key={group.id} className={`rounded border px-2 py-1 ${tone}`}>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-semibold text-muted-foreground">G{idx + 1}</span>
                  <span className="truncate text-muted-foreground">
                    {group.source.strong || 'no-strong'} / {group.source.lemma || 'no-lemma'}
                  </span>
                  {explicit && (
                    <span className="ml-auto size-1.5 rounded-full bg-amber-500" title="Override" aria-hidden />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAlignmentGroupPick(vh.id, group.id, explicit === 'ours' ? null : 'ours')}
                    className={[
                      'text-[10px] px-2 py-0.5 rounded border transition-colors',
                      effective === 'ours'
                        ? 'bg-blue-100 text-blue-700 border-blue-400 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    ].join(' ')}
                  >
                    {oursLabel}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAlignmentGroupPick(vh.id, group.id, explicit === 'theirs' ? null : 'theirs')}
                    className={[
                      'text-[10px] px-2 py-0.5 rounded border transition-colors',
                      effective === 'theirs'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    ].join(' ')}
                  >
                    {theirsLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (vh.kind === 'unchanged') {
    return (
      <div className="usfm-hunk-verse-card ml-4 pl-3 border-l border-dashed border-muted-foreground/30 py-2 opacity-70">
        <div className="mb-1.5">
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">v.{vh.ours.verseNum}</span>
        </div>
        <SideBlock
          side="ours"
          label="Same on both sides"
          segments={toUnchanged(vh.ours.displaySegments)}
          currentPick={undefined}
          onPick={() => {}}
          disabled
        />
      </div>
    );
  }

  // Alignment-only: text is identical but alignment wiring differs.
  // Show pickable SideBlocks with per-word underlines + collapsible change panel.
  if (vh.kind === 'alignment-only') {
    const alignPick = versePicks.get(vh.id) ?? null;
    return (
      <div className={`usfm-hunk-verse-card ml-4 pl-3 border-l border-dashed border-blue-400/50 py-2 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="mb-1.5">
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">v.{vh.ours.verseNum}</span>
        </div>
        <div className="space-y-1.5">
          <SideBlock
            side="ours"
            label={oursLabel}
            segments={toUnchanged(vh.ours.displaySegments)}
            wordAlignment={vh.ours.alignment}
            currentPick={alignPick ?? undefined}
            onPick={(s) => onVersePick(vh.id, s)}
            disabled={disabled}
          />
          <SideBlock
            side="theirs"
            label={theirsLabel}
            segments={toUnchanged(vh.theirs.displaySegments)}
            wordAlignment={vh.theirs.alignment}
            currentPick={alignPick ?? undefined}
            onPick={(s) => onVersePick(vh.id, s)}
            disabled={disabled}
          />
        </div>
        {renderAlignmentStage(alignPick, 'required')}
        <AlignmentChangesPanel
          mineAlignment={vh.ours.alignment}
          theirsAlignment={vh.theirs.alignment}
          changes={alignmentChanges}
          oursLabel={oursLabel}
          theirsLabel={theirsLabel}
        />
      </div>
    );
  }

  const pick = versePicks.get(vh.id);
  const verseNumForLabel =
    vh.kind === 'theirs-only'
      ? (vh as Extract<VerseHunk, { kind: 'theirs-only' }>).theirs.verseNum
      : vh.ours.verseNum;

  return (
    <div className={`usfm-hunk-verse-card ml-4 pl-3 border-l border-dashed border-muted-foreground/30 py-2 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground tabular-nums">v.{verseNumForLabel}</span>
      </div>

      {/* changed: reference (ours) + incoming (theirs) */}
      {vh.kind === 'changed' && (
        <div className="space-y-1.5">
          <SideBlock
            side="ours"
            label={oursLabel}
            segments={toUnchanged(vh.ours.displaySegments)}
            wordTokens={oursWordTokens}
            currentPick={pick}
            onPick={(s) => onVersePick(vh.id, s)}
            disabled={disabled}
          />
          <SideBlock
            side="theirs"
            label={theirsLabel}
            segments={toUnchanged(vh.theirs.displaySegments)}
            wordTokens={theirsWordTokens}
            currentPick={pick}
            onPick={(s) => onVersePick(vh.id, s)}
            disabled={disabled}
          />
          {renderAlignmentStage(pick ?? null, 'optional')}
        </div>
      )}

      {/* ours-only: they removed it — Keep or Remove decision */}
      {vh.kind === 'ours-only' && (
        <SideBlock
          side="ours"
          label={`${oursLabel} (removed by incoming)`}
          segments={toUnchanged(vh.ours.displaySegments)}
          currentPick={pick}
          onPick={(s) => onVersePick(vh.id, s)}
          isOnlyBlock
          disabled={disabled}
        />
      )}

      {/* theirs-only: they added it — Accept or Ignore decision */}
      {vh.kind === 'theirs-only' && (
        <SideBlock
          side="theirs"
          label={`${theirsLabel} (new addition)`}
          segments={toUnchanged(vh.theirs.displaySegments)}
          currentPick={pick}
          onPick={(s) => onVersePick(vh.id, s)}
          isOnlyBlock
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ParagraphHunkCard — click-to-select at paragraph level
// ---------------------------------------------------------------------------

/** Conflicting verses and whether the card should offer / default to verse-by-verse resolution. */
function getVerseDrillDownInfo(hunk: EnrichedParagraphHunk): {
  conflictingVerseHunks: VerseHunk[];
  showVerseDrillDown: boolean;
} {
  if (hunk.kind !== 'changed' && hunk.kind !== 'split') {
    return { conflictingVerseHunks: [], showVerseDrillDown: false };
  }
  const conflictingVerseHunks = hunk.verseHunks.filter((v) => v.kind !== 'unchanged');
  const hasAlignmentOnlyVerse = conflictingVerseHunks.some((v) => v.kind === 'alignment-only');
  /** Continuation verse-groups (\\p+\\q1) stitch verbatim on paragraph pick — no per-verse pass. */
  const isMultiMarkerChangedGroup =
    hunk.kind === 'changed' &&
    (hunk.ours.markerSequence.length > 1 || hunk.theirs.markerSequence.length > 1);
  const showVerseDrillDown =
    conflictingVerseHunks.length > 0 &&
    !isMultiMarkerChangedGroup &&
    (hunk.kind === 'split' ||
      conflictingVerseHunks.length > 1 ||
      hasAlignmentOnlyVerse);
  return { conflictingVerseHunks, showVerseDrillDown };
}

function ParagraphHunkCard({
  hunk,
  oursLabel,
  theirsLabel,
  paragraphPicks,
  versePicks,
  alignmentGroupPicks,
  onParagraphPick,
  onVersePick,
  onAlignmentGroupPick,
  chapterDisabled,
}: {
  hunk: EnrichedParagraphHunk;
  oursLabel: string;
  theirsLabel: string;
  paragraphPicks: Map<string, 'ours' | 'theirs'>;
  versePicks: Map<string, 'ours' | 'theirs'>;
  alignmentGroupPicks: AlignmentGroupPicks;
  onParagraphPick: (id: string, side: 'ours' | 'theirs' | null) => void;
  onVersePick: (id: string, side: 'ours' | 'theirs' | null) => void;
  onAlignmentGroupPick: (verseHunkId: string, groupId: string, side: 'ours' | 'theirs' | null) => void;
  chapterDisabled: boolean;
}) {
  const changeStructure = () => {
    onParagraphPick(hunk.id, null);
    if (hunk.kind === 'changed' || hunk.kind === 'split') {
      for (const vh of hunk.verseHunks) {
        if (versePicks.has(vh.id)) onVersePick(vh.id, null);
      }
    }
  };

  // Render unchanged paragraphs as read-only ProseMirror text (no controls).
  if (hunk.kind === 'unchanged') {
    const segments = hunk.ours.displaySegments.map((s) => ({ ...s, change: 'unchanged' as const }));
    return (
      <div className="usfm-hunk-para-unchanged py-1">
        <div className="ProseMirror text-sm leading-relaxed opacity-70" contentEditable={false} data-usfm-theme="document" suppressContentEditableWarning>
          {renderGroups(groupByParagraph(segments))}
        </div>
      </div>
    );
  }

  const paraPick = paragraphPicks.get(hunk.id);
  const isDisabled = chapterDisabled;

  const { showVerseDrillDown } = getVerseDrillDownInfo(hunk);
  const layoutStepVisible = !showVerseDrillDown || paraPick === undefined;
  const verseStepVisible = showVerseDrillDown && paraPick !== undefined;

  const toUnchanged = (segs: RenderSegment[]) =>
    segs.map((s) => ({ ...s, change: 'unchanged' as const }));

  const verseCards =
    (hunk.kind === 'changed' || hunk.kind === 'split' ? hunk.verseHunks : []).filter((vh) => {
      const num = vh.kind === 'theirs-only' ? vh.theirs.verseNum : vh.ours.verseNum;
      return num !== '_pre';
    });

  const iconBtn =
    'rounded p-1.5 transition-colors flex items-center justify-center text-muted-foreground hover:bg-muted';

  return (
    <div className={`usfm-hunk-para-card border rounded-md mb-3 overflow-hidden ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="px-3 py-2 space-y-2">
        {hunk.kind === 'changed' && layoutStepVisible && (
          <div className="space-y-2">
            <SideBlock
              side="ours"
              label={oursLabel}
              segments={toUnchanged(hunk.ours.displaySegments)}
              currentPick={paraPick}
              onPick={(s) => onParagraphPick(hunk.id, s)}
              disabled={isDisabled}
            />
            <SideBlock
              side="theirs"
              label={theirsLabel}
              segments={toUnchanged(hunk.theirs.displaySegments)}
              currentPick={paraPick}
              onPick={(s) => onParagraphPick(hunk.id, s)}
              disabled={isDisabled}
            />
          </div>
        )}

        {hunk.kind === 'split' && layoutStepVisible && (
          <div className="space-y-2">
            <SideBlock
              side="ours"
              label={oursLabel}
              segments={toUnchanged(mergeParaDisplaySegments(hunk.oursParas))}
              currentPick={paraPick}
              onPick={(s) => onParagraphPick(hunk.id, s)}
              disabled={isDisabled}
            />
            <SideBlock
              side="theirs"
              label={theirsLabel}
              segments={toUnchanged(mergeParaDisplaySegments(hunk.theirsParas))}
              currentPick={paraPick}
              onPick={(s) => onParagraphPick(hunk.id, s)}
              disabled={isDisabled}
            />
          </div>
        )}

        {hunk.kind === 'ours-only' && (
          <SideBlock
            side="ours"
            label={`${oursLabel} (removed by incoming)`}
            segments={toUnchanged(hunk.ours.displaySegments)}
            currentPick={paraPick}
            onPick={(s) => onParagraphPick(hunk.id, s)}
            isOnlyBlock
            disabled={isDisabled}
          />
        )}

        {hunk.kind === 'theirs-only' && (
          <SideBlock
            side="theirs"
            label={`${theirsLabel} (new addition)`}
            segments={toUnchanged(hunk.theirs.displaySegments)}
            currentPick={paraPick}
            onPick={(s) => onParagraphPick(hunk.id, s)}
            isOnlyBlock
            disabled={isDisabled}
          />
        )}

        {verseStepVisible && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button
                type="button"
                className={iconBtn}
                onClick={changeStructure}
                disabled={isDisabled}
                aria-label="Back to paragraph layout"
                title="Back to paragraph layout"
              >
                <RotateCcw className="size-4" />
              </button>
            </div>
            {verseCards.map((vh) => (
              <VerseHunkCard
                key={vh.id}
                vh={vh}
                oursLabel={oursLabel}
                theirsLabel={theirsLabel}
                versePicks={versePicks}
                alignmentGroupPicks={alignmentGroupPicks}
                onVersePick={onVersePick}
                onAlignmentGroupPick={onAlignmentGroupPick}
                disabled={isDisabled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HunksPane
// ---------------------------------------------------------------------------

function HunksPane({
  hunks,
  oursLabel,
  theirsLabel,
  paragraphPicks,
  versePicks,
  alignmentGroupPicks,
  onParagraphPick,
  onVersePick,
  onAlignmentGroupPick,
  chapterDisabled,
}: {
  hunks: EnrichedParagraphHunk[];
  oursLabel: string;
  theirsLabel: string;
  paragraphPicks: Map<string, 'ours' | 'theirs'>;
  versePicks: Map<string, 'ours' | 'theirs'>;
  alignmentGroupPicks: AlignmentGroupPicks;
  onParagraphPick: (id: string, side: 'ours' | 'theirs' | null) => void;
  onVersePick: (id: string, side: 'ours' | 'theirs' | null) => void;
  onAlignmentGroupPick: (verseHunkId: string, groupId: string, side: 'ours' | 'theirs' | null) => void;
  chapterDisabled: boolean;
}) {
  if (hunks.length === 0) {
    return <p className="text-xs text-muted-foreground italic py-2">No paragraph-level differences in this chapter.</p>;
  }
  return (
    <div className="usfm-hunks-pane space-y-1">
      {chapterDisabled && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5 mb-2">
          Chapter-level pick active — clear it above to resolve individual paragraphs.
        </div>
      )}
      {hunks.map((hunk) => (
        <ParagraphHunkCard
          key={hunk.id}
          hunk={hunk}
          oursLabel={oursLabel}
          theirsLabel={theirsLabel}
          paragraphPicks={paragraphPicks}
          versePicks={versePicks}
          alignmentGroupPicks={alignmentGroupPicks}
          onParagraphPick={onParagraphPick}
          onVersePick={onVersePick}
          onAlignmentGroupPick={onAlignmentGroupPick}
          chapterDisabled={chapterDisabled}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UsfmChapterDiffView({
  oursText,
  theirsText,
  baseText = '',
  chapterIndices = [],
  activeChapter: activeChapterProp,
  showChapterStrip = true,
  oursLabel = 'Yours (existing)',
  theirsLabel = 'From bundle',
  baseLabel = 'Base',
  chapterPicks = new Map(),
  paragraphPicks = new Map(),
  versePicks = new Map(),
  alignmentGroupPicks = new Map(),
  onParagraphPick,
  onVersePick,
  onAlignmentGroupPick,
  onActiveChapterChange,
  onHunksDiscovered,
}: UsfmChapterDiffViewProps) {
  const [internalActiveChapter, setInternalActiveChapter] = useState<number | null>(null);
  const [paneTab, setPaneTab] = useState<PaneTab>('hunks');

  // Parse original USJ (includes alignment markers — needed for fingerprinting)
  const oursUsjOrig = useMemo(() => parseUsj(oursText), [oursText]);
  const theirsUsjOrig = useMemo(() => parseUsj(theirsText), [theirsText]);
  const baseUsjOrig = useMemo(() => (baseText ? parseUsj(baseText) : null), [baseText]);

  if (!oursUsjOrig || !theirsUsjOrig) {
    return (
      <PlainTextDiffView
        oursText={oursText} theirsText={theirsText} baseText={baseText}
        oursLabel={oursLabel} theirsLabel={theirsLabel} baseLabel={baseLabel}
      />
    );
  }

  // Strip alignment so display segments are purely textual.
  const oursStripped = useMemo(() => (oursUsjOrig ? stripAlignments(oursUsjOrig) : null), [oursUsjOrig]);
  const theirsStripped = useMemo(() => (theirsUsjOrig ? stripAlignments(theirsUsjOrig) : null), [theirsUsjOrig]);
  const baseStripped = useMemo(() => (baseUsjOrig ? stripAlignments(baseUsjOrig) : null), [baseUsjOrig]);

  const oursDisplayUsj = useMemo(() => (oursStripped ? (oursStripped.editable as unknown as UsjDocument) : null), [oursStripped]);
  const theirsDisplayUsj = useMemo(() => (theirsStripped ? (theirsStripped.editable as unknown as UsjDocument) : null), [theirsStripped]);
  const baseDisplayUsj = useMemo(() => (baseStripped ? (baseStripped.editable as unknown as UsjDocument) : null), [baseStripped]);

  if (!oursDisplayUsj || !theirsDisplayUsj) {
    return (
      <PlainTextDiffView
        oursText={oursText} theirsText={theirsText} baseText={baseText}
        oursLabel={oursLabel} theirsLabel={theirsLabel} baseLabel={baseLabel}
      />
    );
  }

  const oursAlignments = oursStripped?.alignments ?? {};
  const theirsAlignments = theirsStripped?.alignments ?? {};

  const oursSlices = useMemo(() => allSlices(oursDisplayUsj), [oursDisplayUsj]);
  const theirsSlices = useMemo(() => allSlices(theirsDisplayUsj), [theirsDisplayUsj]);
  const baseSlices = useMemo(() => (baseDisplayUsj ? allSlices(baseDisplayUsj) : []), [baseDisplayUsj]);

  // Also need original (alignment-preserving) slices for paragraph collection
  const oursOrigSlices = useMemo(() => allSlices(oursUsjOrig), [oursUsjOrig]);
  const theirsOrigSlices = useMemo(() => allSlices(theirsUsjOrig), [theirsUsjOrig]);

  const allChapters = useMemo(
    () => [...new Set([...oursSlices.map((s) => s.chapter), ...theirsSlices.map((s) => s.chapter)])].sort((a, b) => a - b),
    [oursSlices, theirsSlices],
  );

  if (allChapters.length === 0) {
    return (
      <PlainTextDiffView
        oursText={oursText} theirsText={theirsText} baseText={baseText}
        oursLabel={oursLabel} theirsLabel={theirsLabel} baseLabel={baseLabel}
      />
    );
  }

  const firstConflicting = chapterIndices.length > 0
    ? allChapters.find((ch) => chapterIndices.includes(ch)) ?? allChapters[0]
    : allChapters[0];
  const currentChapter = activeChapterProp ?? internalActiveChapter ?? firstConflicting;

  const oursSlice = oursSlices.find((s) => s.chapter === currentChapter) ?? null;
  const theirsSlice = theirsSlices.find((s) => s.chapter === currentChapter) ?? null;
  const baseSlice = baseSlices.find((s) => s.chapter === currentChapter) ?? null;

  const oursOrigSlice = oursOrigSlices.find((s) => s.chapter === currentChapter) ?? null;
  const theirsOrigSlice = theirsOrigSlices.find((s) => s.chapter === currentChapter) ?? null;

  // Alignment fingerprints for current chapter
  const oursFingerprints = useMemo(
    () => fingerprintsFromAlignmentMap(oursAlignments, currentChapter),
    [oursAlignments, currentChapter],
  );
  const theirsFingerprints = useMemo(
    () => fingerprintsFromAlignmentMap(theirsAlignments, currentChapter),
    [theirsAlignments, currentChapter],
  );

  const oursSegs = useMemo(() => collectSegments(oursSlice?.nodes ?? []), [oursSlice]);
  const theirsSegs = useMemo(() => collectSegments(theirsSlice?.nodes ?? []), [theirsSlice]);
  const baseSegs = useMemo(() => (baseSlice ? collectSegments(baseSlice.nodes ?? []) : []), [baseSlice]);

  const { oursDiff, theirsDiff } = useMemo(
    () => diffSegments(oursSegs, theirsSegs, oursFingerprints, theirsFingerprints),
    [oursSegs, theirsSegs, oursFingerprints, theirsFingerprints],
  );
  const baseDiff = useMemo<typeof oursDiff>(
    () => baseSegs.map((s) => ({ ...s, change: 'unchanged' as const })),
    [baseSegs],
  );

  // Paragraph hunks for the Hunks pane
  const enrichedHunks = useMemo<EnrichedParagraphHunk[]>(() => {
    const oOrigNodes = oursOrigSlice?.nodes ?? [];
    const tOrigNodes = theirsOrigSlice?.nodes ?? [];
    const oDispNodes = oursSlice?.nodes ?? [];
    const tDispNodes = theirsSlice?.nodes ?? [];

    const oParas = collectParagraphs(currentChapter, oOrigNodes, oDispNodes);
    const tParas = collectParagraphs(currentChapter, tOrigNodes, tDispNodes);
    const paraHunks = diffParagraphs(oParas, tParas);
    return enrichWithVerses(paraHunks);
  }, [currentChapter, oursOrigSlice, theirsOrigSlice, oursSlice, theirsSlice]);

  // Notify parent about discovered hunks (only on meaningful changes)
  useEffect(() => {
    if (!onHunksDiscovered) return;
    const conflictingParas = enrichedHunks.filter((h) => h.kind !== 'unchanged');
    const paraReqs = conflictingParas.map((h) => {
      if (h.kind !== 'changed' && h.kind !== 'split') return { id: h.id, verseHunks: [] };
      const conflicting = h.verseHunks.filter((v) => v.kind !== 'unchanged');
      const hasAlignmentOnly = conflicting.some((v) => v.kind === 'alignment-only');
      const isMultiMarkerChangedGroup =
        h.kind === 'changed' &&
        (h.ours.markerSequence.length > 1 || h.theirs.markerSequence.length > 1);
      const needsVerseIds =
        conflicting.length > 0 &&
        !isMultiMarkerChangedGroup &&
        (h.kind === 'split' || conflicting.length > 1 || hasAlignmentOnly);
      return {
        id: h.id,
        verseHunks: needsVerseIds ? conflicting.map((v) => v.id) : [],
      };
    });
    onHunksDiscovered({ chapter: currentChapter, paragraphHunks: paraReqs });
  }, [currentChapter, enrichedHunks]);

  const oursRenderedText = segmentText(oursDiff);
  const theirsRenderedText = segmentText(theirsDiff);
  const isMarkupOnly = oursRenderedText === theirsRenderedText && oursText !== theirsText;
  const hasAlignmentOnlyChanges =
    oursDiff.some((s) => s.change === 'alignment-only') ||
    theirsDiff.some((s) => s.change === 'alignment-only');

  const hasBase = baseSlice !== null && baseDiff.length > 0;

  const currentChapterPick = chapterPicks.get(currentChapter);
  const isChapterDisabled = !!currentChapterPick;

  const handleActiveChapterChange = (chapter: number) => {
    if (activeChapterProp === undefined) setInternalActiveChapter(chapter);
    onActiveChapterChange?.(chapter);
  };

  return (
    <div className="usfm-diff-usfm flex flex-col gap-3">
      {showChapterStrip ? (
        <div className="usfm-diff-chapter-tabs flex gap-1 flex-wrap" role="tablist" aria-label="Chapters">
          {allChapters.map((ch) => {
            const isConflict = chapterIndices.includes(ch);
            const isActive = ch === currentChapter;
            const chPick = chapterPicks.get(ch);
            return (
              <button
                key={ch}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={[
                  'usfm-diff-chapter-tab px-3 py-1 text-xs rounded-md border transition-colors flex items-center gap-1.5',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium border-accent'
                    : 'border-border hover:bg-muted',
                ].join(' ')}
                onClick={() => handleActiveChapterChange(ch)}
              >
                {isConflict && !chPick && (
                  <span aria-label="has conflict" className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                )}
                {chPick && (
                  <span aria-label="resolved" className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                )}
                {chapterLabel(ch)}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Alignment-only banner */}
      {hasAlignmentOnlyChanges && !isMarkupOnly && (
        <div className="usfm-diff-alignment-banner flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded px-3 py-1.5">
          <span className="font-medium">≅ alignment</span>
          <span>Some verses differ only in word alignment, not in visible content.</span>
        </div>
      )}

      {/* Pane header: single technical-diff toggle icon */}
      <div className="flex items-center justify-end pb-2">
        <button
          type="button"
          onClick={() => setPaneTab((t) => t === 'raw' ? 'hunks' : 'raw')}
          title={paneTab === 'raw' ? 'Back to conflict view' : 'Technical diff'}
          aria-pressed={paneTab === 'raw'}
          className={[
            'rounded p-1 transition-colors',
            paneTab === 'raw'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          ].join(' ')}
        >
          <Code2 className="size-3.5" />
        </button>
      </div>

      {/* Active pane content */}
      <div className="usfm-diff-pane-content">
        {paneTab !== 'raw' && (
          <HunksPane
            hunks={enrichedHunks}
            oursLabel={oursLabel}
            theirsLabel={theirsLabel}
            paragraphPicks={paragraphPicks}
            versePicks={versePicks}
            alignmentGroupPicks={alignmentGroupPicks}
            onParagraphPick={onParagraphPick ?? (() => {})}
            onVersePick={onVersePick ?? (() => {})}
            onAlignmentGroupPick={onAlignmentGroupPick ?? (() => {})}
            chapterDisabled={isChapterDisabled}
          />
        )}
        {paneTab === 'raw' && <RawUsfmDiffPane oursText={oursText} theirsText={theirsText} />}
      </div>
    </div>
  );
}
