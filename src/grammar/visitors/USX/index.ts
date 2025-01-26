import { 
  BaseUSFMVisitor,
  MilestoneAttributes,
  LinkAttributes
} from '../../interfaces/USFMNodes';
import { 
  ParagraphUSFMNode, 
  CharacterUSFMNode, 
  NoteUSFMNode, 
  TextUSFMNode, 
  MilestoneUSFMNode, 
  PeripheralUSFMNode, 
} from '../../nodes';

const getMarkerInfo = (marker: string) => {
  //marker categories:
  const bookIdentificationMarkers = new Set([
    'id', 'usfm'
  ]);

  const paragraphIdentificationMarkers = new Set([
    'ide', 'sts', 'rem', 'h', 'toc', 'toca'
  ]);

  const paragraphIntroductionMarkers = new Set([
    'imt', 'imte', 'ib', 'ie', 'ili', 'imi', 'imq',
    'im', 'io', 'iot', 'ipi', 'ipq', 'ipr', 'ip',
    'iq', 'is', 'iex',
  ]);

  const titlesAndSectionsMarkers = new Set([
    'cd', 'cl', 'iex', 'ip', 'mr', 'ms', 'mte',
    'r', 's', 'sp', 'sd', 'sr'
  ]);
  
  const bodyParagraphMarkers = new Set([  
    'b', 'cls', 'm', 'mi', 'nb', 'p', 'pc', 'ph',
    'pi', 'pm', 'pmc', 'pmo', 'pmr', 'po', 'pr'
  ]);

  const poetryParagraphMarkers = new Set([
    'q#', 'qa', 'qc', 'qd', 'qm#', 'qr'
  ]);

  const breakMarkers = new Set([
    'br', 'pb'
  ]);

}



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

  visitParagraph(node: ParagraphUSFMNode): string {
    // Handle special markers
    if (node.marker === 'id') {
      // Extract book code and vid from id line
      const idContent = node.content[0] as TextUSFMNode;
      if (idContent) {
        const [code, ...rest] = idContent.content.split(' ');
        this.bookCode = code;
        
        // Add book element with required and optional attributes
        const attrs = this.buildAttributes({
          code: this.bookCode,
          style: 'id'
        });
        this.result.push(`<book${attrs}>${rest.join(' ')}</book>`);
        return this.result.join('');
      }
    }

    // Handle chapter markers
    if (node.marker === 'c') {
      const chapterContent = node.content[0] as TextUSFMNode;
      if (chapterContent) {
        // Close previous chapter if exists
        if (this.currentChapter) {
          const prevEid = `${this.bookCode} ${this.currentChapter}`;
          const closeAttrs = this.buildAttributes({
            eid: prevEid
          });
          this.result.push(`<chapter${closeAttrs} />`);
        }

        this.currentChapter = chapterContent.content;
        const sid = `${this.bookCode.trim()} ${this.currentChapter.trim()}`;
        const attrs = this.buildAttributes({
          number: this.currentChapter,
          style: 'c',
          sid
        });
        this.result.push(`<chapter${attrs} />`);
      }
      return this.result.join('');
    }

    // Handle special paragraph types
    if (this.isSpecialParagraph(node.marker)) {
      const attrs = this.buildAttributes({
        style: node.marker
      });
      const elementName = "para";
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
          style: 'table'  // Default table style
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
    if (node.marker === 'tc1' || node.marker === 'tc2' || node.marker === 'tc3' || node.marker === 'tc4') {
      if (this.inRow) {
        const attrs = this.buildAttributes({
          style: node.marker,
          align: this.getCellAlignment(node.marker)
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
        'xml:space': 'preserve'  // Preserve whitespace in book names
      });
      this.result.push(`<char${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</char>');
      return this.result.join('');
    }

    // Handle publication data
    if (node.marker.startsWith('pub')) {
      const attrs = this.buildAttributes({
        style: node.marker,
        'xml:space': 'preserve'  // Preserve whitespace in publication data
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
          style: node.marker
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
    if (this.inTable && !['tr', 'tc1', 'tc2', 'tc3', 'tc4'].includes(node.marker)) {
      const tableAttrs = this.buildAttributes({
        style: 'table'
      });
      this.result.push(`</table>`);
      this.inTable = false;
    }

    // Check if paragraph starts with a verse marker
    const startsWithVerse = (node: ParagraphUSFMNode) => node.content[0] instanceof CharacterUSFMNode &&
      (node.content[0] as CharacterUSFMNode).marker === 'v';

        // Handle regular paragraphs
    const attrs = this.buildAttributes({
      style: node.marker,
      ...(this.currentVerse && !startsWithVerse(node) ? { vid: `${this.bookCode} ${this.currentChapter}:${this.currentVerse}` } : {})
    });

    if (node.content.length === 0) {
      this.result.push(`<para${attrs} />`);
      return this.result.join('');
    }

    this.result.push(`<para${attrs}>`);
    
    // Process content
    node.content.forEach((child) => child.accept(this));

    const nextParagraph = node.getNextSibling();
    const getNextContentSibling = (node: ParagraphUSFMNode): ParagraphUSFMNode | null => {
      let next = node.getNextSibling();
      while (next && next instanceof ParagraphUSFMNode && next.content.length === 0) {
        next = next.getNextSibling();
      }
      return next as ParagraphUSFMNode | null;
    };
    
    const nextContentParagraph = getNextContentSibling(node);
    
    // Only close verse if this paragraph doesn't contain any verse markers
    // and the next content isn't a verse marker
    if (this.currentVerse && (!nextParagraph || !(nextParagraph instanceof ParagraphUSFMNode) || nextParagraph.marker === 'c' || startsWithVerse(nextParagraph))) {
      const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
      this.result.push(`<verse eid="${verseEid}" />`);
      this.currentVerse = '';
    }
    
    this.result.push('</para>');
    return this.result.join('');
  }

  visitCharacter(node: CharacterUSFMNode): string {

    const getElementName = (marker: string) => {
      const elementNames: { [key: string]: string } = {
        'fig': 'figure',
        'v': 'verse',
      }
      return elementNames[marker] || 'char';
    }

    // Handle verse markers
    if (node.marker === 'v') {
      const verseContent = node.content[0] as TextUSFMNode;
      if (verseContent) {
        // Close previous verse if exists
        if (this.currentVerse) {
          const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
          this.result.push(`<verse eid="${verseEid}" />`);
        }

        const verseNum = verseContent.content.trim();
        this.currentVerse = verseNum;

        const sid = `${this.bookCode} ${this.currentChapter.trim()}:${verseNum.trim()}`;
        const attrs = this.buildAttributes({
          number: verseNum,
          style: 'v',
          sid,
          altnumber: this.getStringAttribute(node.attributes, 'altnumber'),
          pubnumber: this.getStringAttribute(node.attributes, 'pubnumber')
        });
        
        this.result.push(`<verse${attrs} />`);
        this.verseSegments.add(sid);
      }
      return this.result.join('');
    }

    // Handle verse segment milestones
    if (node.marker.startsWith('va')) {
      const segmentId = node.marker.slice(2);  // Extract segment ID from va1, va2, etc.
      const currentVerse = this.getCurrentVerse();
      const segmentSid = `${this.bookCode} ${this.currentChapter.trim()}:${currentVerse.trim()}/${segmentId}`;
      this.verseSegments.add(segmentSid);  // Track the verse segment
      const attrs = this.buildAttributes({
        style: 'va',
        sid: segmentSid,
        ...(node.attributes || {})
      });
      this.result.push(`<verse${attrs} />`);
      return this.result.join('');
    }

    // Handle special character styles
    if (node.marker === 'w') {
      // Handle word attributes
      const attrs = this.buildAttributes({
        style: 'w',
        ...(node.attributes || {})  // Pass through all attributes
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
        gloss: this.getStringAttribute(node.attributes, 'gloss')
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
        who: this.getStringAttribute(node.attributes, 'who')
      });
      this.result.push(`<qt${attrs}>`);
      node.content.forEach((child) => child.accept(this));
      this.result.push('</qt>');
      return this.result.join('');
    }

    // Handle cross reference markers
    if (node.getParent()?.marker === 'x' || node.getParent()?.marker === 'f') {
      
      const targetAttrs = this.buildAttributes({
        style: node.marker,
        ...(node.attributes || {}),
      });
      switch (node.marker) {
        case 'xo':  // Cross reference origin
          this.result.push(`<char${targetAttrs} closed="false">`);
          break;
        case 'xt':  // Cross reference target
          this.result.push(`<char${targetAttrs} closed="false">`);
          break;
        case 'fr':  // Footnote reference
          this.result.push(`<char${targetAttrs} closed="false">`);
          break;
        case 'ft':  // Footnote target
          this.result.push(`<char${targetAttrs} closed="false">`);
          break;
        default:
           this.result.push(`<char${targetAttrs}>`);
      }

      node.content.forEach(child => child.accept(this));
      this.result.push(`</char>`);

      return this.result.join('');
    }

    // Handle references
    if (node.marker === 'xt') {
      const attrs = this.buildAttributes({
        style: node.marker,
        loc: this.getReferenceLoc(node),
        gen: this.getStringAttribute(node.attributes, 'gen'),
        ...(node.attributes as MilestoneAttributes | LinkAttributes || {})
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
        colspan: this.getStringAttribute(node.attributes, 'colspan')
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
        ref: this.getStringAttribute(node.attributes, 'ref')
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
      ...(node.attributes as MilestoneAttributes | LinkAttributes || {})
    });

    this.result.push(`<char${attrs}>`);
    node.content.forEach((child) => child.accept(this));
    this.result.push('</char>');
    return this.result.join('');
  }

  visitNote(node: NoteUSFMNode): string {
    const attrs = this.buildAttributes({
      caller: node.caller || '+',
      style: node.marker,
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
      .map(child => child.content)
      .join('');
  }

  visitText(node: TextUSFMNode): string {

    // Check if we need to preserve whitespace
    const preserveWhitespace = this.shouldPreserveWhitespace();
    const content = preserveWhitespace ? 
      node.content : 
      node.content.replace(/\s+/g, ' ').trim();
    
    this.result.push(this.escapeXML(content));
    return this.result.join('');
  }

  visitMilestone(node: MilestoneUSFMNode): string {
    let elementName = 'ms';

    const attrs = this.buildAttributes({
      style: node.marker,
      ...(node.attributes || {})
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

  visitPeripheral(node: PeripheralUSFMNode): string {
    const attrs = this.buildAttributes({
      style: node.marker,
      ...(node.attributes || {})
    });

    this.result.push(`<periph${attrs}>`);
    if (node.title) {
      this.result.push(`<title>${this.escapeXML(node.title)}</title>`);
    }
    node.content.forEach((child) => child.accept(this));
    this.result.push('</periph>');
    return this.result.join('');
  }

  getResult(): string {
    // Close any open verse
    if (this.currentVerse) {
      const verseEid = `${this.bookCode} ${this.currentChapter}:${this.currentVerse}`;
      this.result.push(`<verse eid="${verseEid}" />`);
    }

    // Close current chapter if exists
    if (this.currentChapter) {
      const chapterEid = `${this.bookCode} ${this.currentChapter}`;
      this.result.push(`<chapter eid="${chapterEid}" />`);
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
    const usxStart = '<usx version="3.0">';
    const usxEnd = '</usx>';

    return `${xmlDecl}\n${usxStart}\n${this.getResult()}\n${usxEnd}`
  }

  private buildAttributes(attrs: Record<string, string | undefined>): string {
    // Preserve order of attributes by using Object.keys
    const validAttrs = Object.keys(attrs)
      .map(key => {
        const value = attrs[key];
        if (value === undefined) return undefined;
        
        // Special handling for boolean attributes
        if (value === 'true' || value === 'false') {
          return value === 'true' ? key : undefined;
        }
        return `${key}="${this.escapeXML(value)}"`;
      })
      .filter(attr => attr !== undefined)
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
      '\u00A0': '&#160;'  // Non-breaking space
    };
    return text.replace(/[&<>"'\u00A0]/g, char => xmlEscapes[char]);
  }

  private getCellAlignment(marker: string): string | undefined {
    // Default alignments based on cell type
    const alignments: Record<string, string> = {
      tc1: 'start',
      tc2: 'start',
      tc3: 'center',
      tc4: 'end'
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

  private getStringAttribute(attrs: MilestoneAttributes | undefined, key: string): string | undefined {
    if (!attrs) return undefined;
    const value = attrs[key];
    return typeof value === 'string' ? value : undefined;
  }

  private isSpecialParagraph(marker: string): boolean {
    // Check for special paragraph types including introductions and poetry
    return /^(mt[1-4]|h[1-6]|s[1-4]|li[1-4]|q[1-3]|d|sp|cl|imt[1-4]|ip|ipi|ipq|imq|iq[1-3]|io[1-2]|ili[1-4]|pc|pr|ph[1-4]|m)$/.test(marker);
  }


  private getCurrentVerse(): string {
    // Extract current verse from verseSegments
    const currentVerseSegment = Array.from(this.verseSegments).pop();
    if (!currentVerseSegment) return '1';  // Default to verse 1 if no verse found
    const match = currentVerseSegment.match(/:(\d+)/);
    return match ? match[1] : '1';
  }

  private shouldPreserveWhitespace(): boolean {
    // true until we find a case for false
    return true;
  }

} 