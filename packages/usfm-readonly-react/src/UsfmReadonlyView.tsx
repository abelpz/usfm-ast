import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import type { ChapterSlice, UsjDocument } from '@usfm-tools/usj-core';
import { splitUsjByChapter, stripAlignments } from '@usfm-tools/usj-core';
import { collectSegments, type RenderSegment } from './segments.js';
import { parseUsfmToUsj, type ParseUsfmOptions } from './parseUsfm.js';
import { scriptureSelectionFromDom, type ScriptureSelectionRef } from './selectionRef.js';
import { buildTokenMetaByPieceKey, normalizeWordIdentity, splitWordsAndGaps, type VerseTokenMeta } from './wordTokens.js';

export type WordClickPayload = {
  /** Normalized form (trimmed of leading/trailing punctuation); used for occurrence matching. */
  word: string;
  /** Verbatim token text as rendered, including attached punctuation (e.g. `Isaac;`). */
  surface: string;
  bookCode: string;
  chapter: number;
  verseNum: string;
  wordIndexInVerse: number;
  occurrenceInVerse: number;
  event: ReactMouseEvent<HTMLElement>;
};

export type UsfmReadonlyViewProps = {
  usfm?: string;
  usj?: UsjDocument | null;
  chapter?: number;
  parseOptions?: ParseUsfmOptions;
  stripAlignment?: boolean;
  className?: string;
  /**
   * Extra class on the scripture root. Defaults to `"ProseMirror"` so
   * `@usfm-tools/editor-themes/markers.css` (and `base.css`) selectors match the same DOM
   * shell as the editor. Pass `""` to opt out. This package does **not** load ProseMirror JS.
   */
  proseMirrorClassName?: string;
  'aria-label'?: string;
  onVerseClick?: (verseNum: string, event: ReactMouseEvent) => void;
  onWordClick?: (payload: WordClickPayload) => void;
  onSelectionChange?: (payload: ScriptureSelectionRef | null) => void;
};

type ParaGroup = {
  marker?: string;
  inline: RenderSegment[];
};

function groupByParagraph(segments: RenderSegment[]): ParaGroup[] {
  const groups: ParaGroup[] = [];
  let current: ParaGroup | null = null;
  for (const seg of segments) {
    if (seg.kind === 'para-break') {
      if (current && current.inline.length > 0) groups.push(current);
      current = { marker: seg.marker, inline: [] };
    } else {
      if (!current) current = { marker: undefined, inline: [] };
      current.inline.push(seg);
    }
  }
  if (current && current.inline.length > 0) groups.push(current);
  return groups;
}

/** Advances on each `\v` segment in **document order** so tokens always get a verse even if USJ omits `enclosingVerse` on some strings. */
type VerseCursor = { verse: string };

type RenderCtx = {
  bookCode: string;
  chapter: number;
  onVerseClick?: UsfmReadonlyViewProps['onVerseClick'];
  onWordClick?: UsfmReadonlyViewProps['onWordClick'];
  tokenMeta: Map<string, VerseTokenMeta>;
  verseCursor: VerseCursor;
};

function renderTokenizedSegment(seg: RenderSegment, key: string, ctx: RenderCtx): ReactNode {
  if (
    seg.kind !== 'text' &&
    seg.kind !== 'intro-heading' &&
    seg.kind !== 'heading-text' &&
    seg.kind !== 'word'
  ) {
    return null;
  }

  const vRaw = (seg.enclosingVerse || ctx.verseCursor.verse || '').trim();

  const parts = splitWordsAndGaps(seg.text);
  /** Styling only on word tokens — no wrapper span around a run of text (verses can span several `.usfm-para`). */
  const segmentClass =
    seg.kind === 'word' ? 'usfm-inline-w' : `usfm-ro-text usfm-ro-text--${seg.kind}`;

  return (
    <Fragment key={key}>
      {parts.map((p, i) => {
        const pieceKey = `${key}-${i}`;
        if (p.kind === 'gap') {
          return <Fragment key={pieceKey}>{p.text}</Fragment>;
        }
        if (!vRaw) {
          return (
            <span key={pieceKey} className={['usfm-tok', 'usfm-tok--nov', segmentClass].filter(Boolean).join(' ')}>
              {p.text}
            </span>
          );
        }
        const meta = ctx.tokenMeta.get(pieceKey);
        if (!meta) {
          return (
            <span key={pieceKey} className={['usfm-tok', 'usfm-tok--nov', segmentClass].filter(Boolean).join(' ')}>
              {p.text}
            </span>
          );
        }
        const { wordIndexInVerse, occurrenceInVerse } = meta;
        return (
          <span
            key={pieceKey}
            className={['usfm-tok', segmentClass, ctx.onWordClick ? 'usfm-tok--clickable' : '', seg.kind === 'word' ? 'usfm-tok--usfmw' : '']
              .filter(Boolean)
              .join(' ')}
            data-verse={vRaw}
            data-word-index={String(wordIndexInVerse)}
            data-occurrence={String(occurrenceInVerse)}
            data-word-identity={normalizeWordIdentity(p.text)}
            {...(seg.kind === 'word' ? { 'data-usfm-w': '' } : {})}
            onClick={
              ctx.onWordClick
                ? (e) =>
                    ctx.onWordClick!({
                      word: normalizeWordIdentity(p.text),
                      surface: p.text,
                      bookCode: ctx.bookCode,
                      chapter: ctx.chapter,
                      verseNum: vRaw,
                      wordIndexInVerse,
                      occurrenceInVerse,
                      event: e,
                    })
                : undefined
            }
          >
            {p.text}
          </span>
        );
      })}
    </Fragment>
  );
}

function renderInlineSegment(seg: RenderSegment, key: string, ctx: RenderCtx): ReactNode {
  if (seg.kind === 'verse') {
    const n = seg.verseNum ?? '';
    ctx.verseCursor.verse = n;
    return (
      <span
        key={key}
        className="usfm-verse usfm-verse--marker"
        data-verse={n}
        onClick={ctx.onVerseClick ? (e) => ctx.onVerseClick!(n, e) : undefined}
        role={ctx.onVerseClick ? 'button' : undefined}
        tabIndex={ctx.onVerseClick ? 0 : undefined}
      >
        <span className="usfm-verse-num">{n}</span>
      </span>
    );
  }
  if (seg.kind === 'footnote') {
    return (
      <sup
        key={key}
        className="usfm-char usfm-ro-footnote"
        data-marker={seg.marker ?? 'f'}
        title={seg.text}
        {...(seg.enclosingVerse || ctx.verseCursor.verse
          ? { 'data-verse': (seg.enclosingVerse || ctx.verseCursor.verse).trim() }
          : {})}
      >
        ‡
      </sup>
    );
  }
  if (seg.kind === 'text' || seg.kind === 'intro-heading' || seg.kind === 'heading-text' || seg.kind === 'word') {
    return renderTokenizedSegment(seg, key, ctx);
  }
  return null;
}

function segmentDomKey(gi: number, si: number, seg: RenderSegment): string {
  const t = seg.text?.slice(0, 48) ?? '';
  return `${gi}-${si}-${seg.kind}-${seg.enclosingVerse ?? ''}-${seg.verseNum ?? ''}-${seg.marker ?? ''}-${t.length}-${t}`;
}

function renderGroups(groups: ParaGroup[], ctx: RenderCtx): ReactNode[] {
  return groups.map((group, gi) => {
    const nodes: ReactNode[] = [];
    for (let si = 0; si < group.inline.length; si++) {
      const seg = group.inline[si];
      nodes.push(renderInlineSegment(seg, segmentDomKey(gi, si, seg), ctx));
    }
    return (
      <div key={gi} className="usfm-para" data-marker={group.marker ?? 'p'}>
        {nodes}
      </div>
    );
  });
}

function sliceForChapter(slices: ChapterSlice[], chapter: number): ChapterSlice | null {
  return slices.find((s) => s.chapter === chapter) ?? null;
}

function normalizeUsj(doc: UsjDocument, strip: boolean): UsjDocument {
  if (!strip) return doc;
  const { editable } = stripAlignments(doc as Parameters<typeof stripAlignments>[0]);
  return editable as unknown as UsjDocument;
}

export function UsfmReadonlyView({
  usfm,
  usj: usjProp,
  chapter = 1,
  parseOptions,
  stripAlignment: stripAlignmentProp,
  className,
  proseMirrorClassName = 'ProseMirror',
  'aria-label': ariaLabel,
  onVerseClick,
  onWordClick,
  onSelectionChange,
}: UsfmReadonlyViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const stripAlignmentEffective = useMemo(() => {
    if (stripAlignmentProp !== undefined) return stripAlignmentProp;
    return parseOptions?.stripAlignment;
  }, [stripAlignmentProp, parseOptions?.stripAlignment]);

  const strip = stripAlignmentEffective !== false;

  const usj = useMemo(() => {
    if (usjProp) return normalizeUsj(usjProp, strip);
    if (!usfm?.trim()) return null;
    return parseUsfmToUsj(usfm, { ...parseOptions, stripAlignment: strip });
  }, [usjProp, usfm, parseOptions, strip]);

  const bookCode = useMemo(() => {
    if (!usj) return 'UNK';
    const slices = splitUsjByChapter(usj);
    return sliceForChapter(slices, chapter)?.bookCode ?? 'UNK';
  }, [usj, chapter]);

  const segments = useMemo(() => {
    if (!usj) return [] as RenderSegment[];
    const slices = splitUsjByChapter(usj);
    const slice = sliceForChapter(slices, chapter);
    if (!slice) return [];
    return collectSegments(slice.nodes);
  }, [usj, chapter]);

  const groups = useMemo(() => groupByParagraph(segments), [segments]);

  const tokenMeta = useMemo(() => buildTokenMetaByPieceKey(groups, segmentDomKey), [groups]);

  const hasContent = segments.some((s) =>
    ['text', 'verse', 'intro-heading', 'heading-text', 'word'].includes(s.kind),
  );

  useEffect(() => {
    if (!onSelectionChange) return;
    const root = rootRef.current;
    if (!root) return;
    const doc = root.ownerDocument;

    /** Browser timer id (`number`); avoid `ReturnType<typeof setTimeout>` which clashes with Node `Timeout` under `@types/node`. */
    let clearT: number | undefined;

    const scheduleClear = () => {
      if (clearT !== undefined) window.clearTimeout(clearT);
      clearT = window.setTimeout(() => onSelectionChange(null), 60);
    };

    /** Snap selection in the DOM and notify (run after pointer/keyboard gesture ends). */
    const flushCommitted = () => {
      if (clearT !== undefined) window.clearTimeout(clearT);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onSelectionChange(scriptureSelectionFromDom(root, bookCode, chapter));
          window.setTimeout(() => {
            onSelectionChange(scriptureSelectionFromDom(root, bookCode, chapter));
          }, 20);
        });
      });
    };

    /** While dragging, do not snap or update structured selection; only clear when selection leaves or collapses. */
    const onSelectionChangeClearOnly = () => {
      const sel = doc.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        scheduleClear();
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) scheduleClear();
    };

    doc.addEventListener('selectionchange', onSelectionChangeClearOnly);
    doc.addEventListener('mouseup', flushCommitted);
    doc.addEventListener('keyup', flushCommitted);
    doc.addEventListener('touchend', flushCommitted, { passive: true });

    return () => {
      doc.removeEventListener('selectionchange', onSelectionChangeClearOnly);
      doc.removeEventListener('mouseup', flushCommitted);
      doc.removeEventListener('keyup', flushCommitted);
      doc.removeEventListener('touchend', flushCommitted);
      if (clearT !== undefined) window.clearTimeout(clearT);
    };
  }, [onSelectionChange, bookCode, chapter, segments]);

  if (!usj) {
    return (
      <div className={className}>
        <p className="usfm-ro-empty">No USFM or invalid document.</p>
      </div>
    );
  }

  const verseCursor: VerseCursor = { verse: '' };
  const renderCtx: RenderCtx = {
    bookCode,
    chapter,
    onVerseClick,
    onWordClick,
    tokenMeta,
    verseCursor,
  };

  return (
    <div className={className}>
      <div
        ref={rootRef}
        className={[proseMirrorClassName, 'usfm-ro-root'].filter(Boolean).join(' ')}
        contentEditable={false}
        data-usfm-theme="document"
        data-book-code={bookCode}
        data-chapter={String(chapter)}
        data-word-click={onWordClick ? '' : undefined}
        suppressContentEditableWarning
        aria-label={ariaLabel}
      >
        {hasContent ? renderGroups(groups, renderCtx) : <p className="usfm-ro-empty">No content in this chapter.</p>}
      </div>
    </div>
  );
}
