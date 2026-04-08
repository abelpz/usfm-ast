import {
  USFMParser,
  ParagraphUSFMNode,
  CharacterUSFMNode,
  NoteUSFMNode,
  TextUSFMNode,
  MilestoneUSFMNode,
  ParsedBookNode,
  ParsedChapterNode,
  ParsedVerseNode,
  ParsedTableNode,
  ParsedTableRowNode,
  ParsedTableCellNode,
} from '@usfm-tools/parser';
import { BaseUSFMVisitor, MilestoneAttributes, LinkAttributes } from '@usfm-tools/types';
import { convertUSJDocumentToUSFM } from '../usfm';
import { usxXmlToUsfm } from './usx-to-usfm';

/** How verse/chapter milestones are written in USX output. */
export type USXVerseMilestoneMode = 'explicit' | 'minimal';

export interface USXVisitorOptions {
  /**
   * `explicit`: verse `eid` / chapter `eid` milestones, `sid` on chapter and verse (matches typical usfm3 USX).
   * `minimal`: self-closing verse starts only (closer to usfmtc `outUsx` for oracle parity).
   */
  verseMilestones?: USXVerseMilestoneMode;
  /**
   * Emit an empty `\\sN` paragraph as `<ms style="sN" x-bare="true"/>` inserted before the most recent `</para>`
   * (usfmtc-style), instead of `<para style="sN"></para>`.
   */
  inlineBareSectionMilestones?: boolean;
}

function isBareSectionParagraph(node: ParagraphUSFMNode): boolean {
  const c = node.content;
  if (!c || c.length === 0) return true;
  return c.every((ch: unknown) => {
    if (typeof ch === 'string') return !ch.trim();
    if (ch && typeof ch === 'object' && (ch as { type?: string }).type === 'text') {
      const t = (ch as { content?: string }).content;
      return typeof t !== 'string' || !t.trim();
    }
    return false;
  });
}

const getMarkerInfo = (marker: string) => {
  //marker categories:
  const bookIdentificationMarkers = new Set(['id', 'usfm']);

  const paragraphIdentificationMarkers = new Set(['ide', 'sts', 'rem', 'h', 'toc', 'toca']);

  const paragraphIntroductionMarkers = new Set([
    'imt',
    'imte',
    'ib',
    'ie',
    'ili',
    'imi',
    'imq',
    'im',
    'io',
    'iot',
    'ipi',
    'ipq',
    'ipr',
    'ip',
    'iq',
    'is',
    'iex',
  ]);

  const titlesAndSectionsMarkers = new Set([
    'cd',
    'cl',
    'iex',
    'ip',
    'mr',
    'ms',
    'mte',
    'r',
    's',
    'sp',
    'sd',
    'sr',
  ]);

  const bodyParagraphMarkers = new Set([
    'b',
    'cls',
    'm',
    'mi',
    'nb',
    'p',
    'pc',
    'ph',
    'pi',
    'pm',
    'pmc',
    'pmo',
    'pmr',
    'po',
    'pr',
  ]);

  const poetryParagraphMarkers = new Set(['q#', 'qa', 'qc', 'qd', 'qm#', 'qr']);

  const breakMarkers = new Set(['br', 'pb']);
};

/**
 * USXVisitor implements the visitor pattern to convert USFM AST nodes into USX 3.0 XML.
 * Follows the USX 3.0 schema specification from https://github.com/usfm-bible/tcdocs/blob/main/grammar/usx.rnc
 */
export class USXVisitor implements BaseUSFMVisitor<string> {
  private result: string[] = [];
  private bookCode: string = '';
  private currentChapter: string = '';
  private currentVerse: string = '';
  private inTable: boolean = false;
  private inRow: boolean = false;
  private inSidebar: boolean = false;
  private verseSegments: Set<string> = new Set();
  private readonly verseMilestoneMode: USXVerseMilestoneMode;
  private readonly inlineBareSectionMilestones: boolean;

  constructor(options: USXVisitorOptions = {}) {
    this.verseMilestoneMode = options.verseMilestones ?? 'explicit';
    this.inlineBareSectionMilestones = options.inlineBareSectionMilestones ?? false;
  }

  private isExplicitMilestones(): boolean {
    return this.verseMilestoneMode === 'explicit';
  }

  /** Insert XML immediately before the last `</para>` token (for usfmtc-style inline `\\sN` markers). */
  private insertXmlBeforeLastClosingParaTag(xml: string): void {
    for (let i = this.result.length - 1; i >= 0; i--) {
      if (this.result[i] === '</para>') {
        this.result.splice(i, 0, xml);
        return;
      }
    }
    this.result.push(xml);
  }

  /** `\id` is parsed as {@link ParsedBookNode}, not a paragraph with text children. */
  visitBook(node: ParsedBookNode): string {
    this.bookCode = node.code;
    const inner = node.content.join(' ');
    const attrs = this.buildAttributes({
      code: this.bookCode,
      style: 'id',
    });
    this.result.push(`<book${attrs}>${inner}</book>`);
    return this.result.join('');
  }

  /** `\c` is parsed as {@link ParsedChapterNode}, not a paragraph with text children. */
  visitChapter(node: ParsedChapterNode): string {
    if (this.isExplicitMilestones()) {
      if (this.currentVerse && this.currentChapter) {
        const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
        this.result.push(`<verse eid="${verseEid}" />`);
        this.currentVerse = '';
      }

      if (this.currentChapter) {
        const prevEid = `${this.bookCode} ${this.currentChapter}`;
        const closeAttrs = this.buildAttributes({
          eid: prevEid,
        });
        this.result.push(`<chapter${closeAttrs} />`);
      }
    }

    this.currentChapter = node.number;
    const attrs = this.isExplicitMilestones()
      ? this.buildAttributes({
          number: this.currentChapter,
          style: 'c',
          sid:
            (node.sid && node.sid.trim()) || `${this.bookCode.trim()} ${this.currentChapter.trim()}`,
        })
      : this.buildAttributes({
          style: 'c',
          number: this.currentChapter,
        });
    this.result.push(`<chapter${attrs} />`);
    return this.result.join('');
  }

  visitParagraph(node: ParagraphUSFMNode): string {
    if (typeof node.marker !== 'string') {
      return this.result.join('');
    }

    if (
      this.inlineBareSectionMilestones &&
      /^s\d+$/.test(node.marker) &&
      isBareSectionParagraph(node)
    ) {
      const msXml = `<ms${this.buildAttributes({ style: node.marker })} x-bare="true" />`;
      this.insertXmlBeforeLastClosingParaTag(msXml);
      return this.result.join('');
    }

    // Handle special markers (legacy / non-enhanced paragraph `id` if present)
    if (node.marker === 'id') {
      const idContent = node.content[0] as TextUSFMNode;
      const line = typeof idContent?.content === 'string' ? idContent.content : '';
      if (line) {
        const [code, ...rest] = line.split(' ');
        this.bookCode = code;

        const attrs = this.buildAttributes({
          code: this.bookCode,
          style: 'id',
        });
        this.result.push(`<book${attrs}>${rest.join(' ')}</book>`);
        return this.result.join('');
      }
    }

    // Handle chapter markers (legacy paragraph-shaped `\c` if present)
    if (node.marker === 'c') {
      const chapterContent = node.content[0] as TextUSFMNode;
      const num = typeof chapterContent?.content === 'string' ? chapterContent.content : '';
      if (num) {
        if (this.isExplicitMilestones()) {
          if (this.currentVerse && this.currentChapter) {
            const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
            this.result.push(`<verse eid="${verseEid}" />`);
            this.currentVerse = '';
          }

          if (this.currentChapter) {
            const prevEid = `${this.bookCode} ${this.currentChapter}`;
            const closeAttrs = this.buildAttributes({
              eid: prevEid,
            });
            this.result.push(`<chapter${closeAttrs} />`);
          }
        }

        this.currentChapter = num;
        const attrs = this.isExplicitMilestones()
          ? this.buildAttributes({
              number: this.currentChapter,
              style: 'c',
              sid: `${this.bookCode.trim()} ${this.currentChapter.trim()}`,
            })
          : this.buildAttributes({
              style: 'c',
              number: this.currentChapter,
            });
        this.result.push(`<chapter${attrs} />`);
      }
      return this.result.join('');
    }

    // Handle special paragraph types
    if (this.isSpecialParagraph(node.marker)) {
      const attrs = this.buildAttributes({
        style: node.marker,
      });
      const elementName = 'para';
      this.result.push(`<${elementName}${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push(`</${elementName}>`);
      return this.result.join('');
    }

    // Handle table rows
    if (node.marker === 'tr') {
      if (!this.inTable) {
        // Start a new table if not already in one
        const tableAttrs = this.buildAttributes({
          style: 'table', // Default table style
        });
        this.result.push(`<table${tableAttrs}>`);
        this.inTable = true;
      }
      this.inRow = true;
      this.result.push('<row>');
      node.content.forEach((child) => child.accept(this));
      this.result.push('</row>');
      this.inRow = false;
      return this.result.join('');
    }

    // Handle table cells
    if (
      node.marker === 'tc1' ||
      node.marker === 'tc2' ||
      node.marker === 'tc3' ||
      node.marker === 'tc4'
    ) {
      if (this.inRow) {
        const attrs = this.buildAttributes({
          style: node.marker,
          align: this.getCellAlignment(node.marker),
        });
        this.result.push(`<cell${attrs}>`);
        node.content.forEach((child) => child.accept(this));
        this.result.push('</cell>');
        return this.result.join('');
      }
    }

    // Handle backmatter elements
    if (node.marker === 'bk') {
      const attrs = this.buildAttributes({
        style: node.marker,
        'xml:space': 'preserve', // Preserve whitespace in book names
      });
      this.result.push(`<char${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</char>');
      return this.result.join('');
    }

    // Handle publication data
    if (node.marker?.startsWith('pub')) {
      const attrs = this.buildAttributes({
        style: node.marker,
        'xml:space': 'preserve', // Preserve whitespace in publication data
      });
      this.result.push(`<para${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</para>');
      return this.result.join('');
    }

    // Handle sidebar
    if (node.marker === 'esb') {
      if (!this.inSidebar) {
        const attrs = this.buildAttributes({
          style: node.marker,
        });
        this.result.push(`<sidebar${attrs}>`);
        this.inSidebar = true;
      }
      node.content.forEach((child) => child.accept(this));
      if (this.inSidebar) {
        this.result.push('</sidebar>');
        this.inSidebar = false;
      }
      return this.result.join('');
    }

    // Close table if starting a new paragraph outside table context
    if (this.inTable && node.marker && !['tr', 'tc1', 'tc2', 'tc3', 'tc4'].includes(node.marker)) {
      const tableAttrs = this.buildAttributes({
        style: 'table',
      });
      this.result.push(`</table>`);
      this.inTable = false;
    }

    // Check if paragraph starts with a verse marker (enhanced: ParsedVerseNode; legacy: \v char)
    const startsWithVerse = (node: ParagraphUSFMNode) => {
      const first = node.content[0];
      if (first instanceof ParsedVerseNode) return true;
      return (
        first instanceof CharacterUSFMNode && (first as CharacterUSFMNode).marker === 'v'
      );
    };

    // Check if this paragraph should inherit verse context
    const shouldInheritVerse = (node: ParagraphUSFMNode) => {
      // Don't inherit if this paragraph starts with a verse marker
      if (startsWithVerse(node)) {
        return false;
      }

      // Don't inherit for major structural elements
      if (node.marker.startsWith('s') || node.marker.startsWith('mt') || node.marker === 'c') {
        return false;
      }

      // Key insight: content paragraphs (m, p, q) that come immediately after
      // break paragraphs should NOT inherit verse context
      const prevSibling = node.getPreviousSibling();
      if (prevSibling instanceof ParagraphUSFMNode && prevSibling.marker === 'b') {
        // This is a content paragraph immediately after a break
        if (node.marker === 'm' || node.marker === 'p' || node.marker.startsWith('q')) {
          return false;
        }
      }

      return true;
    };

    const nextParagraph = node.getNextSibling();

    // The key insight: close verses when the NEXT paragraph is a break or structural element
    // This ensures verses close in the content paragraph BEFORE the break
    const shouldCloseVerse =
      this.currentVerse &&
      (!nextParagraph || // End of document
        (nextParagraph instanceof ParagraphUSFMNode && nextParagraph.marker === 'c') || // Next chapter
        (nextParagraph instanceof ParagraphUSFMNode && startsWithVerse(nextParagraph)) || // Next verse
        (nextParagraph instanceof ParagraphUSFMNode && nextParagraph.marker === 'b') || // Next is break
        (nextParagraph instanceof ParagraphUSFMNode && nextParagraph.marker.startsWith('s'))); // Next is section

    // Handle regular paragraphs
    const attrs = this.buildAttributes({
      style: node.marker,
      ...(this.isExplicitMilestones() &&
      this.currentVerse &&
      shouldInheritVerse(node)
        ? { vid: `${this.bookCode} ${this.currentChapter}:${this.currentVerse}` }
        : {}),
    });

    this.result.push(`<para${attrs}>`);

    // Process content
    node.content.forEach((child) => child.accept(this));

    // Close verse BEFORE closing paragraph if needed
    if (shouldCloseVerse && this.isExplicitMilestones()) {
      const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
      this.result.push(`<verse eid="${verseEid}" />`);
      this.currentVerse = '';
    }

    this.result.push('</para>');
    return this.result.join('');
  }

  /** `\v` is parsed as {@link ParsedVerseNode}, not a character wrapper with text children. */
  visitVerse(node: ParsedVerseNode): string {
    if (this.currentVerse && this.isExplicitMilestones()) {
      const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
      this.result.push(`<verse eid="${verseEid}" />`);
    }

    const verseNum = node.number.trim();
    this.currentVerse = verseNum;

    const sid =
      (node.sid && node.sid.trim()) ||
      `${this.bookCode} ${this.currentChapter.trim()}:${verseNum}`;
    const attrs = this.isExplicitMilestones()
      ? this.buildAttributes({
          number: verseNum,
          style: 'v',
          sid,
          ...(node.altnumber != null && node.altnumber !== '' ? { altnumber: node.altnumber } : {}),
          ...(node.pubnumber != null && node.pubnumber !== '' ? { pubnumber: node.pubnumber } : {}),
        })
      : this.buildAttributes({
          style: 'v',
          number: verseNum,
        });

    this.result.push(`<verse${attrs} />`);
    this.verseSegments.add(sid);
    return this.result.join('');
  }

  /** Enhanced AST: `\tr` / `\tc*` grouped as table → row → cell. */
  visitTable(node: ParsedTableNode): string {
    const tableAttrs = this.buildAttributes({ style: 'table' });
    this.result.push(`<table${tableAttrs}>`);
    this.inTable = true;
    node.content.forEach((row) => row.accept(this));
    this.result.push('</table>');
    this.inTable = false;
    return this.result.join('');
  }

  visitTableRow(node: ParsedTableRowNode): string {
    this.inRow = true;
    this.result.push('<row>');
    node.content.forEach((cell) => cell.accept(this));
    this.result.push('</row>');
    this.inRow = false;
    return this.result.join('');
  }

  visitTableCell(node: ParsedTableCellNode): string {
    const attrs = this.buildAttributes({
      style: node.marker,
      align: this.getCellAlignment(node.marker),
      ...(node.colspan ? { colspan: node.colspan } : {}),
    });
    this.result.push(`<cell${attrs}>`);
    node.content.forEach((child) => child.accept(this));
    this.result.push('</cell>');
    return this.result.join('');
  }

  visitOptbreak(_node: unknown): string {
    this.result.push('<optbreak/>');
    return this.result.join('');
  }

  visitRef(node: { loc?: string; content?: unknown[]; gen?: boolean }): string {
    const raw = node as { loc?: string; content?: unknown[]; gen?: boolean };
    const attrs = this.buildAttributes({
      loc: typeof raw.loc === 'string' ? raw.loc : '',
      ...(raw.gen !== undefined ? { gen: String(raw.gen) } : {}),
    });
    this.result.push(`<ref${attrs}>`);
    if (Array.isArray(raw.content)) {
      raw.content.forEach((child: any) => {
        if (child && typeof child.accept === 'function') child.accept(this);
      });
    }
    this.result.push('</ref>');
    return this.result.join('');
  }

  visitCharacter(node: CharacterUSFMNode): string {
    const getElementName = (marker: string) => {
      const elementNames: { [key: string]: string } = {
        fig: 'figure',
        v: 'verse',
      };
      return elementNames[marker] || 'char';
    };

    // Handle verse markers (legacy character-shaped `\v` if present)
    if (node.marker === 'v') {
      const verseContent = node.content?.[0] as TextUSFMNode | undefined;
      const text = typeof verseContent?.content === 'string' ? verseContent.content.trim() : '';
      if (text) {
        if (this.currentVerse && this.isExplicitMilestones()) {
          const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
          this.result.push(`<verse eid="${verseEid}" />`);
        }

        this.currentVerse = text;
        const sid = `${this.bookCode} ${this.currentChapter.trim()}:${text}`;
        const attrs = this.isExplicitMilestones()
          ? this.buildAttributes({
              number: text,
              style: 'v',
              sid,
              altnumber: this.getStringAttribute(node.attributes, 'altnumber'),
              pubnumber: this.getStringAttribute(node.attributes, 'pubnumber'),
            })
          : this.buildAttributes({
              style: 'v',
              number: text,
            });

        this.result.push(`<verse${attrs} />`);
        this.verseSegments.add(sid);
      }
      return this.result.join('');
    }

    // Handle verse segment milestones
    if (node.marker.startsWith('va')) {
      const segmentId = node.marker.slice(2); // Extract segment ID from va1, va2, etc.
      const currentVerse = this.getCurrentVerse();
      const segmentSid = `${this.bookCode} ${this.currentChapter.trim()}:${currentVerse.trim()}/${segmentId}`;
      this.verseSegments.add(segmentSid); // Track the verse segment
      const attrs = this.buildAttributes({
        style: 'va',
        sid: segmentSid,
        ...(node.attributes || {}),
      });
      this.result.push(`<verse${attrs} />`);
      return this.result.join('');
    }

    // Handle special character styles
    if (node.marker === 'w') {
      // Handle word attributes
      const attrs = this.buildAttributes({
        style: 'w',
        ...(node.attributes || {}), // Pass through all attributes
      });
      this.result.push(`<char${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</char>');
      return this.result.join('');
    }

    if (node.marker === 'rb') {
      // Handle ruby glosses
      const attrs = this.buildAttributes({
        style: 'rb',
        gloss: this.getStringAttribute(node.attributes, 'gloss'),
      });
      this.result.push(`<char${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</char>');
      return this.result.join('');
    }

    // Handle quotations
    if (node.marker.startsWith('qt')) {
      const level = parseInt(node.marker.slice(2)) || 1;
      const attrs = this.buildAttributes({
        style: node.marker,
        level: level.toString(),
        who: this.getStringAttribute(node.attributes, 'who'),
      });
      this.result.push(`<qt${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</qt>');
      return this.result.join('');
    }

    // Footnote / cross-ref content: match usfmtc-style `<char>` (no `closed` attribute).
    {
      const p = node.getParent?.() as { marker?: string; type?: string } | undefined;
      if (p?.type === 'note' || p?.marker === 'x' || p?.marker === 'f') {
        const targetAttrs = this.buildAttributes({
          style: node.marker,
          ...(node.attributes || {}),
        });
        this.result.push(`<char${targetAttrs}>`);
        node.content.forEach((child) => child.accept(this));
        this.result.push(`</char>`);
        return this.result.join('');
      }
    }

    // Handle references
    if (node.marker === 'xt') {
      const attrs = this.buildAttributes({
        style: node.marker,
        loc: this.getReferenceLoc(node),
        gen: this.getStringAttribute(node.attributes, 'gen'),
        ...((node.attributes as MilestoneAttributes | LinkAttributes) || {}),
      });
      this.result.push(`<ref${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</ref>');
      return this.result.join('');
    }

    // Handle table cells with proper attributes
    if (node.marker.startsWith('tc')) {
      const cellAttrs = this.buildAttributes({
        style: node.marker,
        align: this.getCellAlignment(node.marker),
        colspan: this.getStringAttribute(node.attributes, 'colspan'),
      });
      this.result.push(`<cell${cellAttrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</cell>');
      return this.result.join('');
    }

    // Handle figure elements
    if (node.marker === 'fig') {
      const figureAttrs = this.buildAttributes({
        style: 'fig',
        alt: this.getStringAttribute(node.attributes, 'alt'),
        src: this.getStringAttribute(node.attributes, 'src'),
        size: this.getStringAttribute(node.attributes, 'size'),
        loc: this.getStringAttribute(node.attributes, 'loc'),
        copy: this.getStringAttribute(node.attributes, 'copy'),
        ref: this.getStringAttribute(node.attributes, 'ref'),
      });
      this.result.push(`<figure${figureAttrs}>`);
      // Handle figure caption if present
      const caption = this.getTextContent(node);
      if (caption) {
        this.result.push(this.escapeXML(caption));
      }
      this.result.push('</figure>');
      return this.result.join('');
    }

    // Handle regular character styles (outside notes)
    const attrs = this.buildAttributes({
      style: node.marker,
      ...((node.attributes as MilestoneAttributes | LinkAttributes) || {}),
    });

    this.result.push(`<char${attrs}>`);
    node.content.forEach((child) => child.accept(this));
    this.result.push('</char>');
    return this.result.join('');
  }

  visitNote(node: NoteUSFMNode): string {
    const attrs = this.buildAttributes({
      style: node.marker,
      caller: node.caller || '+',
    });

    this.result.push(`<note${attrs}>`);

    // Special handling for note content markers
    node.content.forEach((child) => {
      if (child instanceof CharacterUSFMNode) {
        child.accept(this);
      } else {
        child.accept(this);
      }
    });

    this.result.push('</note>');
    return this.result.join('');
  }

  private getTextContent(node: CharacterUSFMNode): string {
    return node.content
      .filter((child): child is TextUSFMNode => child instanceof TextUSFMNode)
      .map((child) => child.content)
      .join('');
  }

  visitText(node: TextUSFMNode): string {
    // Check if we need to preserve whitespace
    const preserveWhitespace = this.shouldPreserveWhitespace();
    const content = preserveWhitespace ? node.content : node.content.replace(/\s+/g, ' ').trim();

    this.result.push(this.escapeXML(content));
    return this.result.join('');
  }

  visitMilestone(node: MilestoneUSFMNode): string {
    const elementName = 'ms';

    const attrs = this.buildAttributes({
      style: node.marker,
      ...(node.attributes || {}),
    });

    // Handle milestone types (start/end)
    if (node.milestoneType === 'start') {
      this.result.push(`<${elementName}${attrs} />`);
    } else if (node.milestoneType === 'end') {
      this.result.push(`<${elementName}${attrs} />`);
    } else {
      // Self-closing milestone
      this.result.push(`<${elementName}${attrs} />`);
    }

    return this.result.join('');
  }

  getResult(): string {
    if (this.isExplicitMilestones()) {
      if (this.currentVerse) {
        const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
        this.result.push(`<verse eid="${verseEid}" />`);
      }

      if (this.currentChapter) {
        const chapterEid = `${this.bookCode} ${this.currentChapter}`;
        this.result.push(`<chapter eid="${chapterEid}" />`);
      }
    }

    // Clean up any unclosed elements
    if (this.inTable) {
      this.result.push('</table>');
    }
    if (this.inSidebar) {
      this.result.push('</sidebar>');
    }

    return this.result.join('');
  }

  getDocument(): string {
    const xmlDecl = '<?xml version="1.0" encoding="utf-8"?>';
    const usxVersion = this.isExplicitMilestones() ? '3.0' : '3.1';
    const usxStart = `<usx version="${usxVersion}">`;
    const usxEnd = '</usx>';

    return `${xmlDecl}\n${usxStart}\n${this.getResult()}\n${usxEnd}`;
  }

  private buildAttributes(attrs: Record<string, string | undefined>): string {
    // Preserve order of attributes by using Object.keys
    const validAttrs = Object.keys(attrs)
      .map((key) => {
        const value = attrs[key];
        if (value === undefined) return undefined;

        // Special handling for boolean attributes
        if (value === 'true' || value === 'false') {
          return value === 'true' ? key : undefined;
        }
        return `${key}="${this.escapeXML(value)}"`;
      })
      .filter((attr) => attr !== undefined)
      .join(' ');

    return validAttrs ? ` ${validAttrs}` : '';
  }

  private escapeXML(text: string): string {
    const xmlEscapes: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
      '\u00A0': '&#160;', // Non-breaking space
    };
    return text.replace(/[&<>"'\u00A0]/g, (char) => xmlEscapes[char]);
  }

  private getCellAlignment(marker: string): string | undefined {
    // Default alignments based on cell type
    const alignments: Record<string, string> = {
      tc1: 'start',
      tc2: 'start',
      tc3: 'center',
      tc4: 'end',
    };
    return alignments[marker];
  }

  private getReferenceLoc(node: CharacterUSFMNode): string | undefined {
    // Try to extract reference location from attributes
    if (node.attributes?.['link-href']) {
      return node.attributes['link-href'].toString();
    }

    // Try to construct from content
    const textContent = this.getTextContent(node);
    if (!textContent) return undefined;

    // Handle reference ranges (e.g., "GEN 1:1-3" or "GEN 1:1,3")
    const refMatch = textContent.match(/([A-Z0-9]{3})\s*(\d+):(\d+)(?:[-,](\d+))?/);
    if (refMatch) {
      const [_, book, chapter, startVerse, endVerse] = refMatch;
      if (endVerse) {
        return `${book} ${chapter}:${startVerse}-${endVerse}`;
      }
      return `${book} ${chapter}:${startVerse}`;
    }

    return textContent;
  }

  private getStringAttribute(
    attrs: MilestoneAttributes | undefined,
    key: string
  ): string | undefined {
    if (!attrs) return undefined;
    const value = attrs[key];
    return typeof value === 'string' ? value : undefined;
  }

  private isSpecialParagraph(marker: string): boolean {
    // Check for special paragraph types including introductions and poetry
    return /^(mt[1-4]|h[1-6]|s[1-4]|li[1-4]|q[1-3]|d|sp|cl|imt[1-4]|ip|ipi|ipq|imq|iq[1-3]|io[1-2]|ili[1-4]|pc|pr|ph[1-4]|m)$/.test(
      marker
    );
  }

  private getCurrentVerse(): string {
    // Extract current verse from verseSegments
    const currentVerseSegment = Array.from(this.verseSegments).pop();
    if (!currentVerseSegment) return '1'; // Default to verse 1 if no verse found
    const match = currentVerseSegment.match(/:(\d+)/);
    return match ? match[1] : '1';
  }

  private shouldPreserveWhitespace(): boolean {
    // true until we find a case for false
    return true;
  }
}

export { usxXmlToUsfm };

export type UsjDocumentRoot = { type: 'USJ'; version: string; content: unknown[] };

/**
 * Parse USX XML into a USJ-shaped document ({@link USFMParser#toJSON}).
 */
export function parseUsxToUsjDocument(usxXml: string): UsjDocumentRoot {
  const usfm = usxXmlToUsfm(usxXml);
  const parser = new USFMParser();
  parser.parse(usfm);
  return parser.toJSON() as UsjDocumentRoot;
}

/**
 * Serialize a USJ document (or content array) to USX XML via USFM round-trip.
 */
export function usjDocumentToUsx(
  usj: Parameters<typeof convertUSJDocumentToUSFM>[0],
  options?: USXVisitorOptions
): string {
  const usfm = convertUSJDocumentToUSFM(usj);
  const parser = new USFMParser();
  parser.parse(usfm);
  const visitor = new USXVisitor(options);
  parser.visit(visitor);
  return visitor.getDocument();
}
