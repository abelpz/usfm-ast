import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import type { AlignmentMap } from '@usfm-tools/usj-core';
import type { ChapterSlice, GatewayWordToken, UsjDocument } from '@usfm-tools/usj-core';
import { splitUsjByChapter, tokenizeGatewayUsj } from '@usfm-tools/usj-core';
import { collectSegments, type RenderSegment } from './segments.js';
import { parseUsfmToUsjWithAlignments, type ParseUsfmOptions } from './parseUsfm.js';
import { stripAlignmentsForDisplay, type StripAlignmentsInput } from './stripAlignmentsForDisplay.js';
import { scriptureSelectionFromDom, type ScriptureSelectionRef } from './selectionRef.js';
import {
  buildPieceKeyToGatewayIndex,
  resolveWordTokenAlignment,
  verseSidFromParts,
  type WordTokenAlignment,
} from './wordAlignment.js';
import { buildTokenMetaByPieceKey, normalizeWordIdentity, splitWordsAndGaps, type VerseTokenMeta } from './wordTokens.js';

export type { WordTokenAlignment };

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
  /** Verse `sid` key for {@link AlignmentMap} / {@link tokenizeGatewayUsj}. */
  verseSid: string;
  /** 0-based gateway token index when mapped; use with {@link tokenizeGatewayUsj} for this verse. */
  gatewayTokenIndex?: number;
  /** Resolved alignment for this surface when milestones were stripped into `AlignmentMap`. */
  alignment: WordTokenAlignment | null;
  event: ReactMouseEvent<HTMLElement>;
};

/** Styling hook for per-word highlights / underlines (class names and/or inline style). */
export type WordDecorationInfo = {
  bookCode: string;
  chapter: number;
  verseNum: string;
  verseSid: string;
  surface: string;
  word: string;
  wordIndexInVerse: number;
  occurrenceInVerse: number;
  gatewayTokenIndex?: number;
  alignment: WordTokenAlignment | null;
};

/**
 * Payload delivered to {@link UsfmReadonlyViewProps.onReady} whenever a new
 * document finishes parsing. Use it to seed external navigation state.
 */
export type UsfmReadonlyViewReadyPayload = {
  /** The parsed USJ document — pass back as `usj` prop to skip re-parsing. */
  usj: UsjDocument;
  /** Book code, e.g. `"JHN"`. */
  bookCode: string;
  /** Ordered chapter numbers present in the document (may be non-contiguous). */
  chapters: readonly number[];
  /** Total number of chapters — same as `chapters.length`. */
  chapterCount: number;
};

export type UsfmReadonlyViewProps = {
  usfm?: string;
  usj?: UsjDocument | null;
  /**
   * Chapter to display. Fully controlled — update this prop to navigate.
   * Use `onReady` to learn which chapters are available.
   */
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
  /**
   * Called once after each new document finishes parsing (i.e. whenever
   * `usfm` or `usj` changes). Use the payload to seed external navigation
   * state — chapter list, book code, and the parsed `usj` are all provided
   * so you can drive prev/next without any extra parsing or refs.
   *
   * ```tsx
   * const [chapters, setChapters] = useState<readonly number[]>([]);
   * const [chapter, setChapter] = useState(1);
   *
   * <UsfmReadonlyView
   *   usfm={myUsfm}
   *   chapter={chapter}
   *   onReady={({ chapters }) => {
   *     setChapters(chapters);
   *     setChapter(chapters[0] ?? 1);
   *   }}
   * />
   *
   * const idx = chapters.indexOf(chapter);
   * <button disabled={idx <= 0} onClick={() => setChapter(chapters[idx - 1])}>Prev</button>
   * <span>{idx + 1} / {chapters.length}</span>
   * <button disabled={idx >= chapters.length - 1} onClick={() => setChapter(chapters[idx + 1])}>Next</button>
   * ```
   */
  onReady?: (payload: UsfmReadonlyViewReadyPayload) => void;
  /**
   * Optional per-word decoration from alignment + token identity.
   * Merge returned `className` with built-in token classes (e.g. `usfm-ro-hl` / `usfm-ro-ul` in default.css).
   */
  getWordDecoration?: (info: WordDecorationInfo) => { className?: string; style?: CSSProperties } | null | void;
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
  alignmentMap: AlignmentMap;
  gatewayByVerse: Record<string, GatewayWordToken[]>;
  getWordDecoration?: UsfmReadonlyViewProps['getWordDecoration'];
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
        const { wordIndexInVerse, occurrenceInVerse, gatewayTokenIndex } = meta;
        const verseSid = verseSidFromParts(ctx.bookCode, ctx.chapter, vRaw);
        const alignment =
          gatewayTokenIndex !== undefined
            ? resolveWordTokenAlignment(verseSid, gatewayTokenIndex, ctx.alignmentMap, ctx.gatewayByVerse[verseSid])
            : null;
        const deco = ctx.getWordDecoration?.({
          bookCode: ctx.bookCode,
          chapter: ctx.chapter,
          verseNum: vRaw,
          verseSid,
          surface: p.text,
          word: normalizeWordIdentity(p.text),
          wordIndexInVerse,
          occurrenceInVerse,
          gatewayTokenIndex,
          alignment,
        });
        const decoClass = deco && typeof deco === 'object' && 'className' in deco && deco.className ? deco.className : '';
        const decoStyle = deco && typeof deco === 'object' && 'style' in deco ? deco.style : undefined;

        return (
          <span
            key={pieceKey}
            className={['usfm-tok', segmentClass, ctx.onWordClick ? 'usfm-tok--clickable' : '', seg.kind === 'word' ? 'usfm-tok--usfmw' : '', decoClass]
              .filter(Boolean)
              .join(' ')}
            style={decoStyle}
            data-verse={vRaw}
            data-word-index={String(wordIndexInVerse)}
            data-occurrence={String(occurrenceInVerse)}
            data-word-identity={normalizeWordIdentity(p.text)}
            {...(gatewayTokenIndex !== undefined
              ? { 'data-gateway-index': String(gatewayTokenIndex), 'data-verse-sid': verseSid }
              : {})}
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
                      verseSid,
                      wordIndexInVerse,
                      occurrenceInVerse,
                      gatewayTokenIndex,
                      alignment,
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
  onReady,
  getWordDecoration,
}: UsfmReadonlyViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const stripAlignmentEffective = useMemo(() => {
    if (stripAlignmentProp !== undefined) return stripAlignmentProp;
    return parseOptions?.stripAlignment;
  }, [stripAlignmentProp, parseOptions?.stripAlignment]);

  const strip = stripAlignmentEffective !== false;

  const { usj, alignmentMap } = useMemo(() => {
    const empty: AlignmentMap = {};
    if (usjProp) {
      if (!strip) {
        return { usj: usjProp, alignmentMap: empty };
      }
      const { usj: strippedUsj, alignments } = stripAlignmentsForDisplay(usjProp as StripAlignmentsInput);
      return { usj: strippedUsj, alignmentMap: alignments };
    }
    if (!usfm?.trim()) {
      return { usj: null as UsjDocument | null, alignmentMap: empty };
    }
    const parsed = parseUsfmToUsjWithAlignments(usfm, { ...parseOptions, stripAlignment: strip });
    if (!parsed) {
      return { usj: null as UsjDocument | null, alignmentMap: empty };
    }
    return { usj: parsed.usj, alignmentMap: parsed.alignments };
  }, [usjProp, usfm, parseOptions, strip]);

  // Compute slices once; reused for chapters list, bookCode, segments, gatewayByVerse.
  const slices = useMemo(() => {
    if (!usj) return [] as ReturnType<typeof splitUsjByChapter>;
    return splitUsjByChapter(usj);
  }, [usj]);

  const chapters = useMemo(
    () => slices.map((s) => s.chapter),
    [slices],
  );

  // ── Notify parent when a new document is ready ────────────────────────────
  const docBookCode = slices[0]?.bookCode ?? 'UNK';
  useEffect(() => {
    if (!usj) return;
    onReady?.({ usj, bookCode: docBookCode, chapters, chapterCount: chapters.length });
  }, [usj, docBookCode, chapters, onReady]);

  const bookCode = useMemo(
    () => sliceForChapter(slices, chapter)?.bookCode ?? 'UNK',
    [slices, chapter],
  );

  const segments = useMemo(() => {
    const slice = sliceForChapter(slices, chapter);
    if (!slice) return [] as RenderSegment[];
    return collectSegments(slice.nodes);
  }, [slices, chapter]);

  const groups = useMemo(() => groupByParagraph(segments), [segments]);

  const gatewayByVerse = useMemo(() => {
    const slice = sliceForChapter(slices, chapter);
    if (!slice) return {} as Record<string, GatewayWordToken[]>;
    return tokenizeGatewayUsj({ content: slice.nodes });
  }, [slices, chapter]);

  const pieceToGw = useMemo(
    () => buildPieceKeyToGatewayIndex(groups, segmentDomKey, gatewayByVerse, bookCode, chapter),
    [groups, gatewayByVerse, bookCode, chapter],
  );

  const tokenMeta = useMemo(() => {
    const base = buildTokenMetaByPieceKey(groups, segmentDomKey);
    if (pieceToGw.size === 0) return base;
    const merged = new Map<string, VerseTokenMeta>();
    for (const [k, v] of base) {
      const gwi = pieceToGw.get(k);
      merged.set(k, gwi !== undefined ? { ...v, gatewayTokenIndex: gwi } : v);
    }
    return merged;
  }, [groups, pieceToGw]);

  const enrichSelection = useCallback(
    (sel: ScriptureSelectionRef | null): ScriptureSelectionRef | null => {
      if (!sel) return null;
      return {
        ...sel,
        wordTokens: sel.wordTokens.map((w) => {
          const sid = w.verseSid;
          const gi = w.gatewayTokenIndex;
          if (sid === undefined || gi === undefined) {
            return { ...w, alignment: undefined };
          }
          const al = resolveWordTokenAlignment(sid, gi, alignmentMap, gatewayByVerse[sid]);
          return { ...w, alignment: al };
        }),
      };
    },
    [alignmentMap, gatewayByVerse],
  );

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
          const raw = scriptureSelectionFromDom(root, bookCode, chapter);
          onSelectionChange(enrichSelection(raw));
          window.setTimeout(() => {
            const raw2 = scriptureSelectionFromDom(root, bookCode, chapter);
            onSelectionChange(enrichSelection(raw2));
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
  }, [onSelectionChange, bookCode, chapter, segments, enrichSelection]);

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
    alignmentMap,
    gatewayByVerse,
    getWordDecoration,
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
        data-chapter-count={String(chapters.length)}
        data-word-click={onWordClick ? '' : undefined}
        suppressContentEditableWarning
        aria-label={ariaLabel}
      >
        {hasContent ? renderGroups(groups, renderCtx) : <p className="usfm-ro-empty">No content in this chapter.</p>}
      </div>
    </div>
  );
}
