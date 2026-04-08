/**
 * ProseMirror schema for USJ-shaped documents (subset focused on scripture editing).
 */

import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';

/** Visual / tooltip role for `\\ts` / `\\ts-s` / `\\ts-e` milestones. */
export type TranslatorSectionVariant = 'standalone' | 'start' | 'end';

export function translatorSectionVariantFromMarker(marker: string): TranslatorSectionVariant {
  const m = String(marker || 'ts');
  if (m === 'ts-e' || m.endsWith('-e')) return 'end';
  if (m === 'ts-s' || m.endsWith('-s')) return 'start';
  return 'standalone';
}

function milestoneIdForDisplay(sid: unknown, eid: unknown): string | null {
  if (typeof sid === 'string' && sid.length > 0) return sid;
  if (typeof eid === 'string' && eid.length > 0) return eid;
  return null;
}

function translatorSectionChrome(
  variant: TranslatorSectionVariant,
  idLabel: string | null,
  tsSection: number | null
): { title: string; ariaLabel: string } {
  const role =
    variant === 'start'
      ? 'Translator section (start)'
      : variant === 'end'
        ? 'Translator section (end)'
        : 'Translator section';
  let base = role;
  if (tsSection !== null) {
    base = `${role} ${tsSection}`;
  }
  if (!idLabel) return { title: base, ariaLabel: base };
  const withId = `${base} — ID: ${idLabel}`;
  return { title: withId, ariaLabel: withId };
}

const nodes: { [name: string]: NodeSpec } = {
  /** ProseMirror requires a `text` type for inline content. */
  text: {
    group: 'inline',
  },

  doc: {
    content: 'header? book_titles? book_introduction? chapter+',
    toDOM() {
      return ['div', { class: 'usfm-doc' }, 0] as const;
    },
  },

  /**
   * Book identification (`\\id`, `\\h`, `\\toc#`, …) — not main titles (`\\mt#`).
   * `book` (`\\id`) is **not** in the generic `block` group so chapter bodies cannot default to a
   * second `\\id` when pressing Enter at the end of a paragraph (ProseMirror `splitBlock` uses
   * `defaultBlockAt`, which would otherwise pick the first eligible textblock — `book` before `paragraph`).
   */
  header: {
    content: '(paragraph | raw_block | block_milestone | book)*',
    toDOM() {
      return ['aside', { class: 'usfm-header' }, ['div', { class: 'usfm-header-inner' }, 0]] as const;
    },
  },

  /** Book main titles (`\\mt#`, `\\mte#`) before the first `chapter`. */
  book_titles: {
    content: 'block*',
    toDOM() {
      return [
        'aside',
        { class: 'usfm-book-titles' },
        ['div', { class: 'usfm-book-titles-inner' }, 0],
      ] as const;
    },
  },

  /** Book introduction (`\\ip`, `\\is#`, `\\imt#`, …) — always present; may be collapsed when empty. */
  book_introduction: {
    attrs: {
      /** When true and content is empty, UI shows a compact “expand” affordance only. */
      collapsed: { default: true },
    },
    content: 'block+',
    toDOM(node) {
      const collapsed = node.attrs.collapsed !== false;
      return [
        'section',
        {
          class:
            'usfm-book-introduction' + (collapsed ? ' usfm-book-introduction--collapsed' : ''),
          'data-collapsed': collapsed ? 'true' : 'false',
        },
        ['div', { class: 'usfm-book-introduction-inner' }, 0],
      ] as const;
    },
  },

  /** One `\\c` section: attrs mirror `UsjChapter`; content is the label + block-level USJ. */
  chapter: {
    attrs: {
      sid: { default: null },
      altnumber: { default: null },
      pubnumber: { default: null },
      /** Context chapters in windowed mode: edits are rejected by readonly-guard. */
      readonly: { default: false },
    },
    content: 'chapter_label block+',
    toDOM(node) {
      const ro = Boolean(node.attrs.readonly);
      return [
        'section',
        {
          class: 'usfm-chapter' + (ro ? ' usfm-chapter--readonly' : ''),
          ...(ro ? { 'data-readonly': 'true' } : {}),
        },
        0,
      ] as const;
    },
  },

  /**
   * Chapter number label — always the first child of `chapter`.
   * Behaves like a paragraph that only accepts digit text.
   * The chapter number is derived from its text content, not from attrs.
   */
  chapter_label: {
    content: 'text*',
    marks: '',
    defining: true,
    toDOM() {
      return ['div', { class: 'usfm-chapter-label' }, 0] as const;
    },
  },

  /** `\\id` book line — only in {@link header}, not a generic `block` (see header `content`). */
  book: {
    attrs: {
      code: { default: 'UNK' },
    },
    content: 'inline*',
    toDOM(node) {
      const code = String(node.attrs.code ?? 'UNK');
      return [
        'div',
        { class: 'usfm-book', 'data-code': code },
        ['span', { class: 'usfm-book-code-field' }, code],
        ['span', { class: 'usfm-book-content' }, 0],
      ] as const;
    },
  },

  /** Generic paragraph / poetry / title (`UsjPara`) */
  paragraph: {
    group: 'block',
    attrs: {
      marker: { default: 'p' },
      sid: { default: null },
    },
    content: 'inline*',
    toDOM(node) {
      return ['p', { class: 'usfm-para', 'data-marker': node.attrs.marker }, 0] as const;
    },
  },

  /**
   * Block-level USJ milestone (`type: 'ms'`) — e.g. translator section `\\ts`, `\\ts-s`, `\\ts-e`.
   * Inline `ms` with empty content still uses {@link milestone_inline}.
   */
  block_milestone: {
    group: 'block',
    atom: true,
    attrs: {
      marker: { default: 'ts' },
      sid: { default: null },
      eid: { default: null },
      /** Sequential translator chunk index (1-based), assigned at USJ→PM; not serialized to USJ. */
      tsSection: { default: null },
      extra: { default: '{}' },
    },
    toDOM(node) {
      const marker = String(node.attrs.marker ?? 'ts');
      const isTs = marker === 'ts' || marker.startsWith('ts-');
      if (!isTs) {
        return [
          'div',
          { class: 'usfm-block-milestone', 'data-marker': marker },
        ] as const;
      }
      const variant = translatorSectionVariantFromMarker(marker);
      const idLabel = milestoneIdForDisplay(node.attrs.sid, node.attrs.eid);
      const tsSec = node.attrs.tsSection;
      const tsSection = typeof tsSec === 'number' && Number.isFinite(tsSec) ? tsSec : null;
      const { title, ariaLabel } = translatorSectionChrome(variant, idLabel, tsSection);
      const attrs: Record<string, string> = {
        class: `usfm-block-milestone usfm-block-milestone--translator usfm-block-milestone--ts-${variant}`,
        'data-marker': marker,
        'data-ts-variant': variant,
        title,
        'aria-label': ariaLabel,
      };
      if (tsSection !== null) attrs['data-ts-section'] = String(tsSection);
      return ['div', attrs] as const;
    },
  },

  /** Fallback for structural nodes we do not model yet (tables, sidebars, …) */
  raw_block: {
    group: 'block',
    attrs: {
      json: { default: '{}' },
    },
    content: '',
    toDOM(node) {
      return ['pre', { class: 'usfm-raw-block' }, String(node.attrs.json ?? '{}')] as const;
    },
  },

  /** `\\v` — inline atom */
  verse: {
    group: 'inline',
    inline: true,
    atom: true,
    attrs: {
      number: { default: '1' },
      sid: { default: null },
      altnumber: { default: null },
      pubnumber: { default: null },
    },
    toDOM(node) {
      return [
        'span',
        {
          class: 'usfm-verse',
          'data-verse': String(node.attrs.number),
        },
        String(node.attrs.number),
      ] as const;
    },
  },

  /** Footnote / cross-ref (`UsjNote`) */
  note: {
    group: 'inline',
    inline: true,
    attrs: {
      marker: { default: 'f' },
      caller: { default: '+' },
    },
    content: 'inline*',
    toDOM(node) {
      return [
        'span',
        { class: 'usfm-note', 'data-marker': node.attrs.marker, 'data-caller': node.attrs.caller },
        0,
      ] as const;
    },
  },

  /** `UsjFigure` */
  figure: {
    group: 'inline',
    inline: true,
    atom: true,
    attrs: {
      marker: { default: 'fig' },
      file: { default: null },
      size: { default: null },
      ref: { default: null },
    },
    toDOM(node) {
      return ['span', { class: 'usfm-figure', 'data-marker': node.attrs.marker }, 'Fig'] as const;
    },
  },

  /** Milestone / alignment token not modeled as marks (`UsjMilestone`) */
  milestone_inline: {
    group: 'inline',
    inline: true,
    atom: true,
    attrs: {
      marker: { default: '' },
      sid: { default: null },
      eid: { default: null },
      /** Sequential translator chunk index (1-based), assigned at USJ→PM; not serialized to USJ. */
      tsSection: { default: null },
      extra: { default: '{}' },
    },
    toDOM(node) {
      const marker = String(node.attrs.marker || 'ms');
      const isTs = marker === 'ts' || marker.startsWith('ts-');
      if (!isTs) {
        return [
          'span',
          {
            class: 'usfm-ms',
            'data-marker': marker,
            'aria-label': `USFM milestone \\\\${marker}`,
          },
        ] as const;
      }
      const variant = translatorSectionVariantFromMarker(marker);
      const idLabel = milestoneIdForDisplay(node.attrs.sid, node.attrs.eid);
      const tsSec = node.attrs.tsSection;
      const tsSection = typeof tsSec === 'number' && Number.isFinite(tsSec) ? tsSec : null;
      const { title, ariaLabel } = translatorSectionChrome(variant, idLabel, tsSection);
      const attrs: Record<string, string> = {
        class: `usfm-ms usfm-ms--translator usfm-ms--ts-${variant}`,
        'data-marker': marker,
        'data-ts-variant': variant,
        title,
        'aria-label': ariaLabel,
      };
      if (tsSection !== null) attrs['data-ts-section'] = String(tsSection);
      return ['span', attrs] as const;
    },
  },

  /** Unknown inline — preserves JSON */
  raw_inline: {
    group: 'inline',
    inline: true,
    attrs: {
      json: { default: '{}' },
    },
    content: '',
    toDOM(node) {
      return ['span', { class: 'usfm-raw-inline' }, String(node.attrs.json ?? '{}')] as const;
    },
  },

  /** Plain text line break or empty line inside note (rare); USJ uses string newlines */
  hard_break: {
    group: 'inline',
    inline: true,
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'] as const,
  },
};

const marks: { [name: string]: MarkSpec } = {
  /** Character style (`UsjChar` with marker bd, it, w, …) */
  char: {
    attrs: {
      marker: { default: 'bd' },
      extra: { default: '{}' },
    },
    inclusive: true,
    toDOM(node) {
      return [
        'span',
        { class: 'usfm-char', 'data-char-marker': String(node.attrs.marker) },
        0,
      ] as const;
    },
  },

  /** Milestone wrapper used for nested styles or `zaln` when kept in-document */
  milestone: {
    attrs: {
      marker: { default: '' },
      extra: { default: '{}' },
    },
    inclusive: false,
    toDOM(node) {
      return ['span', { class: 'usfm-milestone-mark', 'data-ms-marker': String(node.attrs.marker) }, 0] as const;
    },
  },
};

export const usfmSchema = new Schema({ nodes, marks });
