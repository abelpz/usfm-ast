import {
  USFMMarkerRegistry,
  CharacterUSFMNode,
  MilestoneUSFMNode,
  ParagraphUSFMNode,
  ParsedTableCellNode,
  ParsedTableNode,
  ParsedTableRowNode,
  TextUSFMNode,
} from '@usfm-tools/parser';
import {
  BaseUSFMVisitor,
  ParagraphUSFMNode as ParagraphUSFMNodeInterface,
  CharacterUSFMNode as CharacterUSFMNodeInterface,
  NoteUSFMNode as NoteUSFMNodeInterface,
  TextUSFMNode as TextUSFMNodeInterface,
  MilestoneUSFMNode as MilestoneUSFMNodeInterface,
} from '@usfm-tools/types';
import { USFMFormatter, USFMOutputBuffer } from '@usfm-tools/formatter';
import type { USFMFormatterOptions } from '@usfm-tools/formatter';

/**
 * Whitespace handling strategies for text content
 */
export type WhitespaceHandling =
  | 'preserve' // Keep all whitespace as-is (multiple spaces + edges)
  | 'normalize' // Multiple spaces → single spaces, keep edges
  | 'trim-edges' // Keep multiple spaces, trim paragraph edges
  | 'normalize-and-trim'; // Multiple spaces → single + trim edges

/**
 * Options for configuring the USFM visitor behavior
 */
export interface USFMVisitorOptions {
  /** Formatter options to pass to USFMFormatter */
  formatterOptions?: USFMFormatterOptions;

  /** How to handle whitespace in text content (default: 'normalize-and-trim') */
  whitespaceHandling?: WhitespaceHandling;

  /** Whether to normalize line endings to \n (default: false) */
  normalizeLineEndings?: boolean;

  /**
   * USJ document version to emit as `\\usfm {version}` immediately after the `\\id` line.
   * When set (e.g. `"3.1"`), the visitor emits `\\usfm 3.1` on its own line between `\\id` and the
   * first paragraph marker. Pass `undefined` (default) to omit the marker entirely.
   */
  usjVersion?: string;

  /** @deprecated Use whitespaceHandling instead */
  preserveWhitespace?: boolean;

  /** @deprecated Use whitespaceHandling instead */
  trimParagraphEdges?: boolean;
}

/**
 * Book identification lines (`\\id`, registry `styleType: 'book'`) are parsed at document root with
 * `parseBook`: free text after the book code runs until the next **paragraph** marker or a line
 * break, so a following milestone or note on the same line would be mis-read as part of `\\id`.
 * USFM document structure treats book identification as its own division; see
 * [Document Structure](https://docs.usfm.bible/usfm/3.1.1/doc/index.html).
 *
 * If another marker ever shares `parseBook` at root, give it `styleType: 'book'` in
 * `packages/usfm-parser/src/constants/markers.ts` so visitors stay registry-driven.
 */
function isBookIdentificationMarker(marker: string): boolean {
  if (!marker || typeof marker !== 'string') return false;
  const info = USFMMarkerRegistry.getInstance().getMarkerInfo(marker);
  return info?.styleType === 'book';
}

/**
 * Matches parser note-content detection: markers with `context` including `NoteContent` in
 * {@link USFMMarkerRegistry} (footnote and cross-ref character types per USFM 3.1).
 *
 * @see https://docs.usfm.bible/usfm/3.1/char/notes/index.html — Character Types for Notes
 */
function isNoteContentMarkerName(marker: string): boolean {
  if (!marker || typeof marker !== 'string') return false;
  const info = USFMMarkerRegistry.getInstance().getMarkerInfo(marker);
  return Boolean(info?.context?.includes('NoteContent'));
}

/**
 * Subset of [note character markers](https://docs.usfm.bible/usfm/3.1/char/notes/index.html)
 * for which USFMVisitor may emit a generic `\\f*` / `\\x*` (instead of `\\marker*`) before
 * non-chained text in the same note — serialization detail, not the full NoteContent list
 * (those come from the registry’s `NoteContent` context).
 */
const NOTE_CONTENT_CHAR_MARKERS_REQUIRING_EXPLICIT_CLOSE = new Set([
  'fq',
  'fqa',
  'fk',
  'fl',
  'fv',
  'fw',
  'fdc',
  'fm',
  'fp',
]);

function noteContentMarkerRequiresExplicitClose(marker: string): boolean {
  return NOTE_CONTENT_CHAR_MARKERS_REQUIRING_EXPLICIT_CLOSE.has(marker);
}

/** Next sibling is another `\\fr` / `\\ft`-style span inside the same note (omit star between them in legacy USFM). */
function isSiblingNoteContentCharacterSpan(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const m = (node as { marker?: string }).marker;
  return typeof m === 'string' && isNoteContentMarkerName(m);
}

/**
 * Whitespace-only (or empty) nodes between footnote/cross-ref character spans (`\\fr`, `\\ft`, …).
 * USJ may include `" "` strings between siblings; USFM chains those spans without inner `\\marker*`.
 */
function isIgnorableBetweenNoteContentSpans(node: unknown): boolean {
  if (typeof node === 'string') {
    return node.trim() === '';
  }
  if (node && typeof node === 'object') {
    const o = node as { type?: string; content?: string };
    if (o.type === 'text' && typeof o.content === 'string') {
      return o.content.trim() === '';
    }
  }
  return false;
}

/** Index of the next non-ignorable sibling, or `-1` if none (used for note-content chaining). */
function indexOfNextSignificantSibling(siblings: unknown[], fromIndex: number): number {
  for (let i = fromIndex + 1; i < siblings.length; i++) {
    if (!isIgnorableBetweenNoteContentSpans(siblings[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * String attribute names declared for `marker` in the marker registry (`attributes` +
 * `implicitAttributes`), matching {@link USFMMarkerRegistry#getMarkerInfo} merge behavior.
 */
function stringAttributeKeysForMarker(marker: string): Set<string> | undefined {
  const info = USFMMarkerRegistry.getInstance().getMarkerInfo(marker);
  if (!info) return undefined;
  const keys = new Set<string>();
  const addStringKeys = (record?: Record<string, { type?: string }>) => {
    if (!record) return;
    for (const [name, spec] of Object.entries(record)) {
      if (spec.type === undefined || spec.type === 'string') {
        keys.add(name);
      }
    }
  };
  if ('attributes' in info && info.attributes) {
    addStringKeys(info.attributes);
  }
  if (info.implicitAttributes) {
    addStringKeys(info.implicitAttributes);
  }
  return keys.size > 0 ? keys : undefined;
}

function isInternalASTKey(key: string): boolean {
  return new Set([
    'type',
    'marker',
    'content',
    'index',
    'attributes',
    'constructor',
    'accept',
    'acceptWithContext',
    'getChildren',
    'getParent',
    'getNextSibling',
    'getPreviousSibling',
    'toJSON',
    'number',
    'caller',
    'category',
    'code',
  ]).has(key);
}

/** Paragraph nodes from legacy class AST or enhanced parser (`ParsedParagraphNode`, type `para`). */
function isParagraphASTNode(parent: unknown): parent is { content: unknown[] } {
  if (!parent || typeof parent !== 'object') return false;
  const p = parent as { type?: string; constructor?: { name?: string }; content?: unknown };
  if (p.type === 'para' || p.type === 'paragraph') return true;
  const name = p.constructor?.name;
  return name === 'ParagraphUSFMNode' || name === 'ParsedParagraphNode';
}

/** Footnote / cross-ref (`type: note` or registry marker type `note`). */
function isNoteLikeNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const o = node as { type?: string; marker?: string };
  if (o.type === 'note') return true;
  if (typeof o.marker === 'string' && o.marker) {
    const t = USFMMarkerRegistry.getInstance().getMarkerInfo(o.marker, 'type');
    if (t === 'note') return true;
  }
  return false;
}

/** Verse nodes (`\\v`, enhanced `ParsedVerseNode` / `type: verse`). */
function isVerseASTNode(parent: unknown): parent is { content: unknown[] } {
  if (!parent || typeof parent !== 'object') return false;
  const p = parent as { type?: string; constructor?: { name?: string }; content?: unknown };
  if (p.type === 'verse') return true;
  const name = p.constructor?.name;
  return name === 'ParsedVerseNode';
}

/**
 * Clean, simplified USFM visitor that uses the new USFMFormatter API
 */
// Export Universal Visitor System
export * from './universal-usfm-visitor';

export class USFMVisitor implements BaseUSFMVisitor {
  private readonly out = new USFMOutputBuffer();
  private options: Required<
    Omit<USFMVisitorOptions, 'preserveWhitespace' | 'trimParagraphEdges' | 'usjVersion'>
  > & {
    preserveWhitespace?: boolean;
    trimParagraphEdges?: boolean;
    usjVersion?: string;
  };
  private formatter: USFMFormatter;
  private contextStack: string[] = []; // Track marker context for nested markers
  private currentParent: any = null;
  private currentChildIndex: number = -1;
  /**
   * After emitting a book-identification line (registry `styleType: 'book'`, currently `\\id`),
   * `parseBook` only stops at paragraph markers or line breaks. Emit a newline before the next root
   * construct when it is not a paragraph marker (`type === 'paragraph'` in the registry) so
   * milestones, notes, characters, etc. are not absorbed into that line.
   */
  private afterBookIdentificationLine = false;
  constructor(options: USFMVisitorOptions = {}) {
    // Handle backward compatibility
    let whitespaceHandling: WhitespaceHandling = 'normalize-and-trim';

    if (options.whitespaceHandling) {
      whitespaceHandling = options.whitespaceHandling;
    } else if (
      options.preserveWhitespace !== undefined ||
      options.trimParagraphEdges !== undefined
    ) {
      // Legacy behavior mapping
      const preserveSpaces = options.preserveWhitespace || false;
      const trimEdges = options.trimParagraphEdges || false;

      if (preserveSpaces && trimEdges) {
        whitespaceHandling = 'trim-edges';
      } else if (preserveSpaces && !trimEdges) {
        whitespaceHandling = 'preserve';
      } else if (!preserveSpaces && trimEdges) {
        whitespaceHandling = 'normalize-and-trim';
      } else {
        whitespaceHandling = 'normalize';
      }
    }

    this.options = {
      formatterOptions: options.formatterOptions || {},
      whitespaceHandling,
      normalizeLineEndings: options.normalizeLineEndings || false,
      usjVersion: options.usjVersion,
      preserveWhitespace: options.preserveWhitespace,
      trimParagraphEdges: options.trimParagraphEdges,
    };

    this.formatter = new USFMFormatter(this.options.formatterOptions);
  }

  private consumeLeadingNewlineAfterBookIdentificationLineIfNeeded(nextMarker?: string): void {
    if (!this.afterBookIdentificationLine) return;
    let sameLineAsBookId = false;
    if (nextMarker !== undefined) {
      const info = USFMMarkerRegistry.getInstance().getMarkerInfo(nextMarker);
      sameLineAsBookId = info?.type === 'paragraph';
    }
    if (!sameLineAsBookId) {
      this.formatter.appendTextContentToBuffer(this.out, '\n');
    }
    this.afterBookIdentificationLine = false;
  }

  visitBook(node: ParagraphUSFMNodeInterface): string {
    const raw = node as any;
    const atRoot = this.contextStack.length === 0;
    this.contextStack.push('paragraph');
    this.formatter.mergeMarkerIntoBuffer(this.out, 'id');
    if (raw.code) {
      // Build the full \id line text in a single addTextContent call so the formatter's
      // parseIdContent sees "JON Title" as one unit and doesn't inject an extra space.
      const contentText = Array.isArray(raw.content)
        ? raw.content
            .map((x: unknown) => String(x))
            .filter((s: string) => s.trim())
            .join(' ')
        : '';
      const fullIdText = contentText ? `${raw.code} ${contentText}` : String(raw.code);
      this.formatter.appendTextContentToBuffer(this.out, fullIdText);
    }
    this.contextStack.pop();
    if (atRoot && isBookIdentificationMarker('id')) {
      // Emit \usfm {version} on its own line immediately after \id when a USJ version is known.
      // trimEnd() removes the structural trailing space that parseIdContent added after the book
      // code so addMarker can start a clean new line.
      if (this.options.usjVersion) {
        this.out.trimEnd();
        this.formatter.mergeMarkerIntoBuffer(this.out, 'usfm');
        this.formatter.appendTextContentToBuffer(this.out, this.options.usjVersion);
      }
      this.afterBookIdentificationLine = true;
    }
    return '';
  }

  visitChapter(node: ParagraphUSFMNodeInterface): string {
    const raw = node as any;
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded('c');
    }
    this.contextStack.push('paragraph');
    this.formatter.mergeMarkerIntoBuffer(this.out, 'c');
    if (raw.number != null && String(raw.number) !== '') {
      this.formatter.appendTextContentToBuffer(this.out, String(raw.number));
    }
    if (Array.isArray(raw.content) && raw.content.length > 0) {
      this.visitChildren(raw, raw.content);
    }
    this.contextStack.pop();
    return '';
  }

  visitVerse(node: CharacterUSFMNodeInterface): string {
    const raw = node as any;
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded('v');
    }
    this.contextStack.push('character');
    this.formatter.mergeMarkerIntoBuffer(this.out, 'v');
    if (raw.number != null && String(raw.number) !== '') {
      this.formatter.appendTextContentToBuffer(this.out, String(raw.number) + ' ');
    }
    if (Array.isArray(raw.content) && raw.content.length > 0) {
      this.visitChildren(raw, raw.content);
    }
    this.contextStack.pop();
    return '';
  }

  visitTable(node: ParsedTableNode): string {
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded('tr');
    }
    if (Array.isArray(node.content) && node.content.length > 0) {
      this.visitChildren(node, node.content);
    }
    return '';
  }

  visitTableRow(node: ParsedTableRowNode): string {
    this.contextStack.push('table-row');
    this.formatter.mergeMarkerIntoBuffer(this.out, 'tr');
    if (Array.isArray(node.content) && node.content.length > 0) {
      this.visitChildren(node, node.content);
    }
    this.contextStack.pop();
    return '';
  }

  /**
   * Table cells use character-style markers but are not closed with \\marker* in USFM;
   * the next cell marker ends the previous cell implicitly.
   */
  visitTableCell(node: ParsedTableCellNode): string {
    const marker = this.formatTableCellMarker(node);
    this.contextStack.push('table-cell');
    this.formatter.mergeMarkerIntoBuffer(this.out, marker);
    if (Array.isArray(node.content) && node.content.length > 0) {
      this.visitChildren(node, node.content);
    }
    this.contextStack.pop();
    return '';
  }

  /** Optional line break `//` (parser `ParsedOptbreakNode`). */
  visitOptbreak(_node: unknown): string {
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded(undefined);
    }
    this.formatter.appendTextContentToBuffer(this.out, '//');
    return '';
  }

  /** Scripture reference span `\\ref …|loc\\ref*`. */
  visitRef(node: { loc?: string; content?: unknown[] | string }): string {
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded('ref');
    }
    const raw = node as { loc?: string; content?: unknown[] | string };
    const loc = typeof raw.loc === 'string' ? raw.loc : '';
    this.formatter.appendTextContentToBuffer(this.out, '\\ref ');
    if (typeof raw.content === 'string' && raw.content.length > 0) {
      this.visitText({ content: raw.content } as TextUSFMNodeInterface);
    } else if (Array.isArray(raw.content) && raw.content.length > 0) {
      this.visitChildren(raw, raw.content);
    }
    if (loc) {
      this.formatter.appendTextContentToBuffer(this.out, '|' + loc);
    }
    this.formatter.mergeMarkerIntoBuffer(this.out, 'ref', true);
    return '';
  }

  private formatTableCellMarker(node: ParsedTableCellNode): string {
    const m = node.marker;
    if (!node.colspan) return m;
    const span = parseInt(node.colspan, 10);
    if (!Number.isFinite(span) || span <= 1) return m;
    const match = m.match(/^(thc|tcc|thr|tcr|th|tc)(\d+)$/);
    if (!match) return m;
    const [, prefix, startStr] = match;
    const start = parseInt(startStr, 10);
    const end = start + span - 1;
    return `${prefix}${start}-${end}`;
  }

  /**
   * Gets the current result string
   */
  getResult(): string {
    let result = this.out.build();

    // Apply line ending normalization if requested
    if (this.options.normalizeLineEndings) {
      result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    return result;
  }

  /**
   * Resets the visitor state for reuse
   */
  reset(): void {
    this.out.clear();
    this.contextStack = [];
    this.currentParent = null;
    this.currentChildIndex = -1;
    this.afterBookIdentificationLine = false;
  }

  /**
   * Helper method to visit children with position tracking
   */
  private visitChildren(parent: any, children: any[]): void {
    const prevParent = this.currentParent;
    const prevIndex = this.currentChildIndex;

    this.currentParent = parent;

    children.forEach((child, index) => {
      this.currentChildIndex = index;

      // Handle different types of children
      if (typeof child === 'string') {
        // Handle text content directly
        this.visitText({ content: child } as TextUSFMNodeInterface);
      } else if (
        child &&
        typeof child === 'object' &&
        'accept' in child &&
        typeof child.accept === 'function'
      ) {
        // Enhanced node with accept method
        child.accept(this);
      } else if (child && typeof child === 'object') {
        // Plain object - route based on type or marker
        this.routePlainObject(child);
      }
    });

    // Restore previous context
    this.currentParent = prevParent;
    this.currentChildIndex = prevIndex;
  }

  /**
   * Routes plain objects to the appropriate visitor method
   */
  private routePlainObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    // Determine object type and call appropriate visitor
    if (obj.type === 'book') {
      this.visitBook(obj as ParagraphUSFMNodeInterface);
    } else if (obj.type === 'chapter') {
      this.visitChapter(obj as ParagraphUSFMNodeInterface);
    } else if (obj.type === 'verse') {
      this.visitVerse(obj as CharacterUSFMNodeInterface);
    } else if (
      obj.type === 'para' ||
      obj.type === 'paragraph' ||
      (!obj.type && obj.marker && this.getMarkerType(obj.marker) === 'paragraph')
    ) {
      this.visitParagraph(obj as ParagraphUSFMNodeInterface);
    } else if (
      obj.type === 'note' ||
      (typeof obj.marker === 'string' && this.getMarkerType(obj.marker) === 'note')
    ) {
      // Must run before `char`: some USJ payloads wrongly use `type: "char"` for `\\f` / `\\x` (registry type `note`).
      this.visitNote(obj as NoteUSFMNodeInterface);
    } else if (
      obj.type === 'char' ||
      (!obj.type && obj.marker && this.getMarkerType(obj.marker) === 'character')
    ) {
      this.visitCharacter(obj as CharacterUSFMNodeInterface);
    } else if (
      obj.type === 'ms' ||
      (!obj.type && obj.marker && this.getMarkerType(obj.marker) === 'milestone')
    ) {
      this.visitMilestone(obj as MilestoneUSFMNodeInterface);
    } else if (obj.type === 'optbreak') {
      this.visitOptbreak(obj);
    } else if (obj.type === 'ref') {
      this.visitRef(obj);
    } else if (obj.content !== undefined && typeof obj.content === 'string') {
      // Text node
      this.visitText(obj as TextUSFMNodeInterface);
    } else if (typeof obj === 'string') {
      // Plain text
      this.visitText({ content: obj } as TextUSFMNodeInterface);
    }
  }

  /**
   * Gets marker type using the USFMMarkerRegistry
   */
  private getMarkerType(marker: string): string {
    const registry = USFMMarkerRegistry.getInstance();
    const markerType = registry.getMarkerInfo(marker, 'type');

    if (markerType) {
      return markerType;
    }

    // If not in registry, infer type based on common patterns
    if (marker.endsWith('-s') || marker.endsWith('-e')) {
      return 'milestone';
    }

    // Default to character if we can't determine
    return 'character';
  }

  /**
   * Visits a paragraph node and converts it to USFM format.
   */
  visitParagraph(node: ParagraphUSFMNodeInterface): string {
    const marker = node.marker;
    const atRoot = this.contextStack.length === 0;
    if (atRoot) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded(marker);
    }

    // Push paragraph context to stack
    this.contextStack.push('paragraph');

    // Add paragraph marker using formatter
    this.formatter.mergeMarkerIntoBuffer(this.out, marker);

    // Book identification (`\id`): code + optional description (see `isBookIdentificationMarker`)
    if (isBookIdentificationMarker(marker)) {
      // Check for code and content properties
      if ((node as any).code) {
        // Build the full \id line text in a single addTextContent call so the formatter's
        // parseIdContent sees "JON Title" as one unit and doesn't inject an extra space.
        const contentText = Array.isArray((node as any).content)
          ? (node as any).content
              .map((x: unknown) => String(x))
              .filter((s: string) => s.trim())
              .join(' ')
          : '';
        const fullIdText = contentText
          ? `${(node as any).code} ${contentText}`
          : String((node as any).code);
        this.formatter.appendTextContentToBuffer(this.out, fullIdText);
      }
    } else {
      // Visit children (content) for other paragraph types
      if (Array.isArray(node.content)) {
        this.visitChildren(node, node.content);
      }
      // Remove the structural trailing space that addMarker added for expected content when
      // this paragraph has no children (e.g. \mt1 with empty content array).
      if (!Array.isArray(node.content) || node.content.length === 0) {
        this.out.trimEnd();
      }
    }

    // Pop context from stack
    this.contextStack.pop();

    if (atRoot && isBookIdentificationMarker(marker)) {
      this.afterBookIdentificationLine = true;
    }

    return '';
  }

  /**
   * Visits a character node and converts it to USFM format.
   */
  visitCharacter(node: CharacterUSFMNodeInterface): string {
    const marker = node.marker;
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded(marker);
    }

    // USFM 3.x: nested character spans use the same marker name with explicit `\\marker*` closes;
    // the legacy `+` prefix is optional and not emitted here (see USFM nesting docs).
    const effectiveMarker = marker;

    // Push current context to stack
    this.contextStack.push('character');

    // Add opening marker using formatter
    this.formatter.mergeMarkerIntoBuffer(this.out, effectiveMarker);

    // Handle special content for verses, chapters, and ID markers
    if (marker === 'v' || marker === 'c') {
      // For verses and chapters, the content might be structured
      this.handleSpecialMarkerContent(node, marker);
    } else {
      // Visit children (content) FIRST
      if (Array.isArray(node.content)) {
        this.visitChildren(node, node.content);
      }
    }

    // Add attributes AFTER content (for non-special markers)
    if (marker !== 'v' && marker !== 'c') {
      const validAttributes = this.collectCharacterAttributes(node);
      if (Object.keys(validAttributes).length > 0) {
        this.formatter.appendAttributesToBuffer(this.out, validAttributes);
      }
    }

    const isVerse = marker === 'v';
    const isChapter = marker === 'c';
    const isNoteContent = isNoteContentMarkerName(marker);
    const siblings = Array.isArray(this.currentParent?.content)
      ? (this.currentParent.content as unknown[])
      : null;
    const j =
      siblings !== null && this.currentChildIndex >= 0
        ? indexOfNextSignificantSibling(siblings, this.currentChildIndex)
        : -1;
    const followingIsChainedNoteContentChar =
      j >= 0 && isSiblingNoteContentCharacterSpan(siblings![j]);
    const onlyWhitespaceOnlySiblingsFollow =
      j < 0 &&
      siblings !== null &&
      this.currentChildIndex < siblings.length - 1 &&
      siblings
        .slice(this.currentChildIndex + 1)
        .every(isIgnorableBetweenNoteContentSpans);
    // Footnote/cross-ref *content* chars (`\fr`, `\ft`, `\fqa`, …): USFM closes each span
    // **implicitly** when the next marker opens (`\ft` closes `\fr` without `\fr*`) or when the note
    // ends (`\f*` / `\x*`). USJ may insert whitespace-only siblings between those spans — still chain.
    // Emit `\marker*` only before non–note-content siblings (e.g. trailing verse text in the note) or
    // a whitespace-only tail inside the note (`\ft Ref\ft* \f*`).
    // Do **not** emit `\f*` here for the last footnote-char child — `visitNote` emits the single `\f*` / `\x*`.
    const needsExplicitCloseBeforeNonMarkerSibling =
      isNoteContent &&
      !followingIsChainedNoteContentChar &&
      (j >= 0 || onlyWhitespaceOnlySiblingsFollow);
    const needsClosing =
      !isVerse &&
      !isChapter &&
      (!isNoteContent || needsExplicitCloseBeforeNonMarkerSibling);

    if (needsClosing) {
      const noteCtx = this.contextStack.find((c) => typeof c === 'string' && c.startsWith('note:'));
      const useGenericNoteClose =
        isNoteContent &&
        noteCtx !== undefined &&
        noteContentMarkerRequiresExplicitClose(marker);
      const closeMarker = useGenericNoteClose
        ? (noteCtx as string).slice('note:'.length)
        : effectiveMarker;
      this.formatter.mergeMarkerIntoBuffer(this.out, closeMarker, true);
    }

    // Pop context from stack
    this.contextStack.pop();

    return '';
  }

  /**
   * Handles special content for verse and chapter markers
   */
  private handleSpecialMarkerContent(node: CharacterUSFMNodeInterface, marker: string): void {
    if (marker === 'v') {
      // For verses, add the verse number directly
      if ((node as any).number) {
        const verseNumber = (node as any).number;
        this.formatter.appendTextContentToBuffer(this.out, verseNumber + ' ');
      }

      // Visit children for verse content
      if (Array.isArray(node.content)) {
        this.visitChildren(node, node.content);
      }
    } else if (marker === 'c') {
      // For chapters, add the chapter number directly
      if ((node as any).number) {
        const chapterNumber = (node as any).number;
        this.formatter.appendTextContentToBuffer(this.out, chapterNumber);
      }

      // Visit children for chapter content
      if (Array.isArray(node.content)) {
        this.visitChildren(node, node.content);
      }
    }
  }

  /**
   * Visits a text node and converts it to USFM format.
   */
  visitText(node: TextUSFMNodeInterface): string {
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded(undefined);
    }
    // Use the correct property name - it should be 'content'
    let textContent = node.content || '';

    // Apply whitespace handling based on the strategy
    const { whitespaceHandling } = this.options;

    // Step 1: Handle space normalization
    const shouldNormalizeSpaces =
      whitespaceHandling === 'normalize' || whitespaceHandling === 'normalize-and-trim';
    if (shouldNormalizeSpaces) {
      // Only normalize multiple spaces to single spaces - preserve leading/trailing spaces as they are significant
      textContent = textContent.replace(/\s+/g, ' ');
    }

    // Step 2: Handle paragraph edge trimming
    const shouldTrimEdges =
      whitespaceHandling === 'trim-edges' || whitespaceHandling === 'normalize-and-trim';
    if (shouldTrimEdges && this.currentParent) {
      const siblings = Array.isArray(this.currentParent.content)
        ? this.currentParent.content
        : null;
      const isParagraphChild =
        isParagraphASTNode(this.currentParent) && siblings !== null;
      const isVerseChild = isVerseASTNode(this.currentParent) && siblings !== null;

      if (isParagraphChild || isVerseChild) {
        const isFirstChild = this.currentChildIndex === 0;
        const isLastChild = this.currentChildIndex === siblings!.length - 1;

        // Trim leading whitespace if this is the first child of a paragraph (verses: unchanged)
        if (isParagraphChild && isFirstChild) {
          textContent = textContent.trimStart();
        }

        // Trim trailing whitespace if this is the last child of a paragraph or verse
        if (isLastChild) {
          const prev =
            this.currentChildIndex > 0 ? siblings![this.currentChildIndex - 1] : undefined;
          const preserveWhitespaceOnlyAfterNote =
            prev !== undefined &&
            isNoteLikeNode(prev) &&
            textContent.length > 0 &&
            textContent.trim() === '';
          if (!preserveWhitespaceOnlyAfterNote) {
            textContent = textContent.trimEnd();
          }
        }
      }
    }

    // Add text content using formatter
    this.formatter.appendTextContentToBuffer(this.out, textContent);

    return '';
  }

  /**
   * Visits a milestone node and converts it to USFM format.
   */
  visitMilestone(node: MilestoneUSFMNodeInterface): string {
    const marker = node.marker;
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded(marker);
    }

    const validAttributes = this.collectMilestoneAttributes(node);
    this.formatter.mergeMilestoneIntoBuffer(
      this.out,
      marker,
      Object.keys(validAttributes).length > 0 ? validAttributes : undefined
    );

    return '';
  }

  /**
   * Visits a note node and converts it to USFM format.
   */
  visitNote(node: NoteUSFMNodeInterface): string {
    const marker = node.marker;
    if (this.contextStack.length === 0) {
      this.consumeLeadingNewlineAfterBookIdentificationLineIfNeeded(marker);
    }

    // Push note context (include marker for \f* vs \x* style closes inside note content)
    this.contextStack.push(`note:${marker}`);

    // Add opening note marker using formatter
    this.formatter.mergeMarkerIntoBuffer(this.out, marker);

    // Caller immediately after \f / \x (no extra spaces — matches Paratext/BSF `\f+`, `\x-`, etc.)
    if (node.caller) {
      this.formatter.appendTextContentToBuffer(this.out, node.caller);
    }

    // Visit children (note content)
    if (Array.isArray(node.content)) {
      this.visitChildren(node, node.content);
    }

    // Add closing note marker
    this.formatter.mergeMarkerIntoBuffer(this.out, marker, true);

    // Pop context from stack
    this.contextStack.pop();

    return '';
  }

  /**
   * Serialize a single plain USJ / `parser.toJSON()` object (no `accept()`) into USFM on this visitor.
   */
  visitPlainUSJNode(node: unknown): void {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      this.visitText({ content: node } as TextUSFMNodeInterface);
      return;
    }
    this.routePlainObject(node as any);
  }

  /** Serialize a list of USJ content nodes (e.g. document `content` array). */
  visitPlainUSJContent(nodes: unknown[]): void {
    for (const n of nodes) {
      this.visitPlainUSJNode(n);
    }
  }

  private collectCharacterAttributes(node: CharacterUSFMNodeInterface): Record<string, string> {
    const out: Record<string, string> = {};
    const raw = node as any;
    const marker = typeof raw.marker === 'string' ? raw.marker : '';
    const declaredKeys = stringAttributeKeysForMarker(marker);
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) {
        if (v !== undefined && v !== null) out[k] = String(v);
      }
    }
    for (const key of Object.keys(raw)) {
      if (isInternalASTKey(key)) continue;
      const val = raw[key];
      if (typeof val !== 'string') continue;
      if (key.startsWith('x-') || (declaredKeys && declaredKeys.has(key))) {
        out[key] = val;
      }
    }
    return out;
  }

  private collectMilestoneAttributes(node: MilestoneUSFMNodeInterface): Record<string, string> {
    const out: Record<string, string> = {};
    const raw = node as any;
    const marker = typeof raw.marker === 'string' ? raw.marker : '';
    const declaredKeys = stringAttributeKeysForMarker(marker);
    if (node.attributes) {
      for (const [k, v] of Object.entries(node.attributes)) {
        if (v !== undefined && v !== null) out[k] = String(v);
      }
    }
    for (const key of Object.keys(raw)) {
      if (isInternalASTKey(key)) continue;
      const val = raw[key];
      if (typeof val !== 'string') continue;
      if (key.startsWith('x-') || (declaredKeys && declaredKeys.has(key))) {
        out[key] = val;
      }
    }
    return out;
  }
}

/**
 * Convert a plain USJ document (`{ type: 'USJ', content: [...] }` or `parser.toJSON()`) to USFM.
 * Uses {@link USFMVisitor} so note/ref/footnote rules match normal parse → USFM round-trips.
 *
 * Accepts a root `content` array (same shape as `parser.toJSON().content`) or a full USJ object.
 * A bare JSON array of nodes is also accepted.
 */
export function convertUSJDocumentToUSFM(
  usjDocument: { content?: unknown[]; version?: string } | unknown[] | null | undefined,
  options?: USFMVisitorOptions
): string {
  // Extract USJ version from the document root so the visitor can emit \usfm {version} after \id.
  const docVersion =
    !Array.isArray(usjDocument) &&
    usjDocument !== null &&
    typeof usjDocument === 'object' &&
    typeof (usjDocument as { version?: string }).version === 'string'
      ? (usjDocument as { version: string }).version
      : undefined;

  const visitor = new USFMVisitor({ usjVersion: docVersion, ...options });
  const content = Array.isArray(usjDocument)
    ? usjDocument
    : usjDocument && typeof usjDocument === 'object'
      ? (usjDocument as { content?: unknown[] }).content
      : undefined;
  if (Array.isArray(content)) {
    visitor.visitPlainUSJContent(content);
  }
  return visitor.getResult();
}

// Re-export for convenience
export { USFMFormatter, USFMOutputBuffer } from '@usfm-tools/formatter';
export type { USFMFormatterOptions, FormatResult } from '@usfm-tools/formatter';
