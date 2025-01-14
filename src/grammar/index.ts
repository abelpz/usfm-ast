// Types for USFM AST nodes
export type USFMNodeType = "paragraph" | "character" | "note" | "text" | "milestone" | "peripheral";

export interface USFMNode {
  type: USFMNodeType;
  marker?: string;
  content?: string | USFMNode[];
  attributes?: MilestoneAttributes;
  accept<T>(visitor: USFMVisitor<T>): T;
  acceptWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T;
}

export interface ParagraphNode extends USFMNode {
  type: "paragraph";
  marker: string;
  content: USFMNode[];
  accept<T>(visitor: USFMVisitor<T>): T;
  acceptWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T;
}

export interface CharacterNode extends USFMNode {
  type: "character";
  marker: string;
  content: USFMNode[];
  attributes?: MilestoneAttributes | LinkAttributes;
  accept<T>(visitor: USFMVisitor<T>): T;
  acceptWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T;
}

export interface NoteNode extends USFMNode {
  type: "note";
  marker: string;
  caller?: string;
  content: USFMNode[];
  accept<T>(visitor: USFMVisitor<T>): T;
  acceptWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T;
}

export interface TextNode extends USFMNode {
  type: "text";
  content: string;
  accept<T>(visitor: USFMVisitor<T>): T;
  acceptWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T;
}

export interface MilestoneAttributes {
  sid?: string;
  eid?: string;
  who?: string;
  level?: string; // Nesting level
  [key: string]: string | string[] | undefined;
}

export interface MilestoneNode extends USFMNode {
  type: "milestone";
  marker: string;
  milestoneType: "start" | "end" | "standalone";
  attributes?: MilestoneAttributes;
  accept<T>(visitor: USFMVisitor<T>): T;
  acceptWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T;
}

export type MarkerType = "paragraph" | "character" | "note" | "noteContent" | "milestone";

export interface CustomMarkerRule {
  type: MarkerType;
  requiresClosing?: boolean;
  isMilestone?: boolean;
}

export interface USFMParserOptions {
  customMarkerRules?: Record<string, CustomMarkerRule>;
}

export interface ListKeyNode extends CharacterNode {
  type: "character";
  marker: "lik";
}

export interface ListValueNode extends CharacterNode {
  type: "character";
  marker: string; // liv1, liv2, etc.
}

export interface LinkAttributes {
  "link-href"?: string;
  "link-title"?: string;
  "link-id"?: string;
  [key: string]: string | string[] | undefined;
}

export interface AttributedNode extends USFMNode {
  attributes?: MilestoneAttributes | LinkAttributes;
}

export interface PeripheralAttributes {
  id: string; // Required identifier for peripheral divisions
  [key: string]: string | string[] | undefined;
}

export interface PeripheralNode extends USFMNode {
  type: "peripheral";
  marker: string;
  title: string;
  attributes: PeripheralAttributes;
  content: USFMNode[];
  accept<T>(visitor: USFMVisitor<T>): T;
  acceptWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T;
}

// Visitor pattern interfaces
export interface USFMVisitor<T = void> {
  visitParagraph(node: ParagraphNode): T;
  visitCharacter(node: CharacterNode): T;
  visitNote(node: NoteNode): T;
  visitText(node: TextNode): T;
  visitMilestone(node: MilestoneNode): T;
  visitPeripheral(node: PeripheralNode): T;
}

export interface USFMVisitorWithContext<T = void, C = any> {
  visitParagraph(node: ParagraphNode, context: C): T;
  visitCharacter(node: CharacterNode, context: C): T;
  visitNote(node: NoteNode, context: C): T;
  visitText(node: TextNode, context: C): T;
  visitMilestone(node: MilestoneNode, context: C): T;
  visitPeripheral(node: PeripheralNode, context: C): T;
}

export class USFMParser {
  private pos: number = 0;
  private input: string = "";
  private customMarkerRules: Record<string, CustomMarkerRule> = {};
  private nodes: USFMNode[] = [];
  // Paragraph markers (end with space, no closing marker)
  private readonly paragraphMarkers = new Set([
    "id", // File identification
    "h", // Header
    "mt", // Major title
    "ms", // Major section heading
    "p", // Paragraph
    "q", // Poetry
    "c", // Chapter number
    "s", // Section heading
    "r", // Parallel reference
    "d", // Descriptive title
    "m", // Margin paragraph
    "pi", // Indented paragraph
    "pc", // Centered paragraph
    "b", // Blank line
    "imt",
    "imt1",
    "imt2",
    "imt3", // Introduction major title
    "is",
    "is1",
    "is2",
    "is3", // Introduction section heading
    "ip", // Introduction paragraph
    "ipi", // Indented introduction paragraph
    "im", // Introduction margin paragraph
    "imi", // Indented introduction margin
    "ipq", // Introduction quote paragraph
    "imq", // Introduction margin quote
    "ipr", // Introduction right-aligned paragraph
    "iq",
    "iq1",
    "iq2",
    "iq3", // Introduction poetic line
    "ib", // Introduction blank line
    "ili",
    "ili1",
    "ili2", // Introduction list item
    "iot", // Introduction outline title
    "io",
    "io1",
    "io2",
    "io3", // Introduction outline entry
    "iex", // Introduction explanatory
    "imte",
    "imte1",
    "imte2", // Introduction major title ending
    "ie", // Introduction end
    "mt",
    "mt1",
    "mt2",
    "mt3", // Major title
    "mte",
    "mte1",
    "mte2",
    "mte3", // Major title ending
    "ms",
    "ms1",
    "ms2",
    "ms3", // Major section heading
    "mr", // Major section reference range
    "s",
    "s1",
    "s2",
    "s3", // Section heading
    "sr", // Section reference range
    "r", // Parallel passage reference
    "d", // Descriptive title
    "sp", // Speaker identification
    "sd",
    "sd1",
    "sd2",
    "sd3", // Semantic division
    "po", // Opening of an epistle
    "pr", // Right-aligned paragraph
    "cls", // Letter closure
    "pmo", // Embedded text opening
    "pm", // Embedded text paragraph
    "pmc", // Embedded text closing
    "pmr", // Embedded text refrain
    "pi1",
    "pi2",
    "pi3", // Indented paragraph
    "mi", // Indented flush left
    "nb", // No-break with previous paragraph
    "pc", // Centered paragraph
    "ph1",
    "ph2",
    "ph3", // Hanging indent (deprecated)
    "b", // Blank line
    "q",
    "q1",
    "q2",
    "q3", // Poetic line with indent levels
    "qr", // Right-aligned poetic line
    "qc", // Centered poetic line
    "qa", // Acrostic heading
    "qm",
    "qm1",
    "qm2", // Embedded text poetic line
    "qd", // Hebrew note
    "li",
    "li1",
    "li2",
    "li3",
    "li4", // List item (ordered or unordered)
    "lim",
    "lim1",
    "lim2",
    "lim3", // Embedded list item
    "lf", // List footer
    "lh", // List header
    "liv",
    "liv1",
    "liv2",
    "liv3", // Vernacular list item
    "lik", // List entry key
    "liv",
    "liv1",
    "liv2",
    "liv3", // List entry values
    "tr", // Table row
    "esb", // Sidebar
    "eb", // Extended book intro
    "div", // Division intro
    "sd", // Section intro
    "efm", // Extended footnote
    "ex", // Extended cross reference
    "cat", // Content category
  ]);

  // Character markers (require closing marker with *)
  private readonly characterMarkers = new Set([
    "v", // Verse Marker
    "bd", // Bold text
    "it", // Italic text
    "bdit", // Bold italic text
    "em", // Emphasized text
    "sc", // Small caps
    "w", // Word/phrase
    "wg", // Greek word/phrase
    "wh", // Hebrew word/phrase
    "wa", // Aramaic word/phrase
    "nd", // Name of deity
    "tl", // Transliterated word
    "pn", // Proper name
    "addpn", // Proper name (added)
    "qt", // Quoted text
    "sig", // Signature
    "ord", // Ordinal number
    "add", // Added text
    "lit", // Liturgical note
    "sls", // Secondary language source
    "dc", // Deuterocanonical/LXX additions
    "bk", // Quoted book title
    "k", // Keyword/keyterm
    "wj", // Words of Jesus
    "ior", // Introduction outline reference range
    "iqt", // Introduction quoted text
    "rq", // Inline quotation reference
    "qs", // Selah expression
    "qac", // Acrostic letter
    "lik", // List entry key
    "liv",
    "liv1",
    "liv2",
    "liv3", // List entry values
    "th1",
    "th2",
    "th3",
    "th4", // Table header cells
    "thr1",
    "thr2",
    "thr3",
    "thr4", // Table header cells (right aligned)
    "tc1",
    "tc2",
    "tc3",
    "tc4", // Table cells
    "tcr1",
    "tcr2",
    "tcr3",
    "tcr4", // Table cells (right aligned)
    "jmp", // Link text
    "cat", // Content category (when used inline)
  ]);

  // Note markers (require closing marker with * and may have caller)
  private readonly noteMarkers = new Set([
    "f", // Footnote
    "fe", // Endnote
    "x", // Cross reference
  ]);

  // Note content markers (no closing marker needed)
  private readonly noteContentMarkers = new Set([
    "fr", // Footnote reference
    "ft", // Footnote text
    "fk", // Footnote keyword
    "fl", // Footnote label
    "fw", // Footnote witness
    "fp", // Footnote paragraph
    "fq", // Footnote quotation
    "fqa", // Footnote alternate translation
    "xo", // Cross reference origin reference
    "xk", // Cross reference keyword
    "xq", // Cross reference quotation
    "xt", // Cross reference target references
    "xta", // Cross reference target alternate
    "xop", // Cross reference published origin text
    "xot", // Cross reference published target text
    "xnt", // Cross reference published target notes
    "xdc", // Cross reference published target dictionary
  ]);

  // Add milestone markers
  private readonly milestoneMarkers = new Set([
    "qt", // Quotation milestone
    "ts", // Translator's section milestone
  ]);

  // Add peripheral book identifiers
  private readonly peripheralBooks = new Set([
    "FRT", // Front matter
    "INT", // Introductions
    "BAK", // Back matter
    "CNC", // Concordance
    "GLO", // Glossary
    "TDX", // Topical index
    "NDX", // Names index
    "OTH", // Other
  ]);

  // Standard peripheral division identifiers
  private readonly peripheralDivisionIds = new Set([
    "title",
    "halftitle",
    "promo",
    "imprimatur",
    "pubdata",
    "foreword",
    "preface",
    "contents",
    "alphacontents",
    "abbreviations",
    "intletters",
    "cover",
    "spine",
    "intbible",
    "intot",
    "intpent",
    "inthistory",
    "intpoetry",
    "intprophesy",
    "intdc",
    "intnt",
    "intgospels",
    "intepistles",
    "chron",
    "measures",
    "maps",
    "lxxquotes",
  ]);

  constructor(options?: USFMParserOptions) {
    this.customMarkerRules = options?.customMarkerRules || {};
  }

  load(input: string): USFMParser { 
    this.input = input;
    return this;
  }

  normalize(): USFMParser {
    this.input = this.normalizeWhitespace(this.input);
    return this;
  }

  parse(): USFMParser {
    this.pos = 0;
    this.nodes = this.parseNodes(false);
    return this;
  }

  getNodes(): USFMNode[] {
    return this.nodes;
  }

  getInput(): string {
    return this.input;
  }

  private isLineBreakingWhitespace(char: string): boolean {
    return (
      char === "\n" ||   // Line Feed (LF)
      char === "\r" ||   // Carriage Return (CR)
      char === "\f"      // Form Feed (page break)
    );
  }

  private isNonLineBreakingWhitespace(char: string): boolean {
    return (
      char === " " ||    // Space
      char === "\t" ||   // Tab
      char === "\v" ||   // Vertical Tab
      char === "\u00A0"  // Non-breaking space
    );
  }

  private isWhitespace(char: string): boolean {
    return this.isLineBreakingWhitespace(char) || this.isNonLineBreakingWhitespace(char);
  }

  private isNewline(char: string): boolean {
    return this.isLineBreakingWhitespace(char);
  }

  private normalizeWhitespace(input: string): string {
    // First, normalize all line endings to LF
    let normalized = input.replace(/\r\n|\r/g, "\n");

    let result = "";
    let i = 0;
    let inWhitespace = false;
    let lastWasNewline = false;

    while (i < normalized.length) {
      const char = normalized[i];

      // Handle backslash markers
      if (char === "\\") {
        const marker = this.peekNextMarker(normalized, i + 1);

        // Rule: Multiple whitespace preceding a paragraph marker is normalized to a single newline
        if (this.paragraphMarkers.has(marker)) {
          if (!lastWasNewline && result.length > 0) {
            result = result.trimEnd() + "\n";
          }
        }
        // Rule: Multiple whitespace between text and a character or note marker normalized to single space
        else if (this.characterMarkers.has(marker) || this.noteMarkers.has(marker)) {
          // Special case: Don't add space if it's at the start of text or after newline
          const lastNonWhitespace = result.trimEnd();
          if (lastNonWhitespace.length > 0 && !lastWasNewline) {
            result = lastNonWhitespace + " ";
          }
        }
        // Special case: Verse markers
        else if (marker === "v") {
          if (!lastWasNewline) {
            result = result.trimEnd() + "\n";
          }
        }

        result += char;
        i++;
        lastWasNewline = false;
        inWhitespace = false;
        continue;
      }

      // Handle whitespace
      if (this.isWhitespace(char)) {
        if (this.isNewline(char)) {
          // Rule: Preserve single newline before verse markers
          const nextNonWhitespace = this.peekNextNonWhitespace(normalized, i + 1);
          if (nextNonWhitespace === "\\" && this.peekNextMarker(normalized, i + 2) === "v") {
            result += "";
          }
          // Otherwise normalize according to context
          else if (!lastWasNewline) {
            result += "\n";
          }
          lastWasNewline = true;
        } else if (!inWhitespace) {
          // Rule: Multiple whitespace between words normalized to single space
          result += " ";
          lastWasNewline = false;
        }
        inWhitespace = true;
      } else {
        result += char;
        inWhitespace = false;
        lastWasNewline = false;
      }
      i++;
    }

    return result;
  }

  // Helper method to peek ahead for next non-whitespace character
  private peekNextNonWhitespace(input: string, start: number): string {
    let i = start;
    while (i < input.length) {
      if (!this.isWhitespace(input[i])) {
        return input[i];
      }
      i++;
    }
    return "";
  }

  private peekNextMarker(input: string, start: number): string {
    let marker = "";
    let i = start;

    while (i < input.length) {
      const char = input[i];
      if (this.isWhitespace(char) || char === "\\") {
        break;
      }
      if(char === "+" || char === "*") {
        return ""
      }
      marker += char;
      i++;
    }

    return marker;
  }

  private preserveSignificantWhitespace() {
    // Keep exactly one space after markers
    if (this.pos < this.input.length && this.input[this.pos] === " ") {
      this.pos++;
    }
  }

  private parseMarker(): { marker: string; isNested: boolean } {
    this.pos++; // Skip backslash

    const isNested = this.pos < this.input.length && this.input[this.pos] === "+";
    if (isNested) {
      this.pos++; // Skip +
    }

    let marker = "";
    // Collect characters until whitespace or special characters
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (this.isWhitespace(char) || char === "*" || char === "\\") {
        break;
      }
      marker += char;
      this.pos++;
    }

    // Preserve significant whitespace after marker
    this.preserveSignificantWhitespace();

    // Handle custom z-namespace markers
    if (marker.startsWith("z")) {
      const rule = this.customMarkerRules[marker];
      if (rule) {
        if (rule.isMilestone) {
          this.milestoneMarkers.add(marker);
        } else {
          switch (rule.type) {
            case "paragraph":
              this.paragraphMarkers.add(marker);
              break;
            case "character":
              this.characterMarkers.add(marker);
              break;
            case "note":
              this.noteMarkers.add(marker);
              break;
            case "noteContent":
              this.noteContentMarkers.add(marker);
              break;
          }
        }
      } else {
        // Default behavior: treat as paragraph marker
        this.paragraphMarkers.add(marker);
      }
    }

    return { marker, isNested };
  }

  private parseNodes(isInsideParagraph: boolean = false): USFMNode[] {
    const nodes: USFMNode[] = [];
    let lastWasLineBreak = false;
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      
      if (char === "\\") {
        const { marker, isNested } = this.parseMarker();
        if (marker === "periph") {
          nodes.push(this.parsePeripheral());
        } else if (this.paragraphMarkers.has(marker) || lastWasLineBreak) {
          nodes.push(this.parseParagraph(marker));
        } else if (this.characterMarkers.has(marker)) {
          nodes.push(this.parseCharacter(marker, isNested));
        } else if (this.noteMarkers.has(marker)) {
          nodes.push(this.parseNote(marker));
        } else if (this.milestoneMarkers.has(marker)) {
          nodes.push(this.parseMilestone(marker));
        } else {
          console.warn(`Unsupported marker in USFM: '${marker}'`);
          const prevChar = this.pos > 1 ? this.input[this.pos - 2] : '\n'; // -2 because pos is after '\'
          if (this.isLineBreakingWhitespace(prevChar)) {
            nodes.push(this.parseParagraph(marker));
          } else {
            nodes.push(this.parseCharacter(marker, isNested));
          }
        }
      } else if (this.isNonLineBreakingWhitespace(char)) {
        this.pos++;
      } else if (this.isLineBreakingWhitespace(char)) {
        lastWasLineBreak = true;
        this.pos++;
      } else {
        const context = this.input.slice(Math.max(0, this.pos - 20), Math.min(this.input.length, this.pos + 20));
        const pointer = ' '.repeat(Math.min(20, this.pos)) + '^';
        throw new Error(
          `Unexpected character in USFM: '${char}'\n` +
          `Context: ${context}\n` +
          `         ${pointer}`
        );
      }
    }

    return nodes;
  }

  private peekMarker(): string {
    const savedPos = this.pos;
    this.pos++; // Skip backslash
    let marker = "";

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (this.isWhitespace(char) || char === "*" || char === "\\") {
        break;
      }
      marker += char;
      this.pos++;
    }

    this.pos = savedPos;
    return marker;
  }

  private getCurrentCharacter(): string {
    return this.input[this.pos];
  }

  private parseAttributes(): Record<string, string | string[]> {
    const attributes: Record<string, string | string[]> = {};
    let currentAttr = "";
    let currentValue = "";
    let inValue = false;
    let inQuotes = false;

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      if (char === "*") break; // End of attributes

      if (!inValue && char === "=") {
        inValue = true;
        this.pos++;
        continue;
      }

      // Handle quotes - this allows for nested quotes in values
      if (inValue && char === '"') {
        inQuotes = !inQuotes;
        this.pos++;
        continue;
      }

      if (!inQuotes && (char === " " || char === "*")) {
        if (currentAttr && currentValue) {
          // Handle multiple values in attributes
          if (currentValue.includes(",")) {
            attributes[currentAttr.trim()] = currentValue
              .trim()
              .split(",")
              .map((v) => v.trim());
          } else {
            attributes[currentAttr.trim()] = currentValue.trim();
          }
        }
        currentAttr = "";
        currentValue = "";
        inValue = false;
        if (char === "*") break;
      } else {
        if (inValue) {
          currentValue += char;
        } else {
          currentAttr += char;
        }
      }

      this.pos++;
    }

    // Handle default attribute for \w marker
    if (!currentAttr && currentValue) {
      attributes["lemma"] = currentValue;
    }

    // Handle link attributes (link-href, link-title, link-id)
    if (currentAttr.startsWith("link-")) {
      if (currentAttr === "link-href") {
        // Validate URI format
        if (currentValue.startsWith("prj:")) {
          // Scripture reference format: prj:REF@VERSION
          const [ref, _version] = currentValue.slice(4).split("@");
          if (!ref) {
            throw new Error(`Invalid scripture reference in link-href: ${currentValue}`);
          }
        } else if (currentValue.startsWith("x-")) {
          // Custom URI scheme, format: x-scheme:value
          if (!currentValue.includes(":")) {
            throw new Error(`Invalid custom URI format in link-href: ${currentValue}`);
          }
        } else {
          // Standard URI validation
          try {
            new URL(currentValue);
          } catch {
            throw new Error(`Invalid URI in link-href: ${currentValue}`);
          }
        }
      }
    }

    return attributes;
  }

  private parseNoteContent(marker: string): CharacterNode {
    const node = {
      type: "character" as const,
      marker,
      content: [] as USFMNode[],
    };

    // Skip whitespace after marker
    while (this.pos < this.input.length && this.input[this.pos] === " ") {
      this.pos++;
    }

    // Parse until next marker or explicit closing marker
    const closingMarker = `\\${marker}*`;
    while (this.pos < this.input.length) {
      // Check for explicit closing marker
      if (this.input.startsWith(closingMarker, this.pos)) {
        this.pos += closingMarker.length;
        break;
      }

      const char = this.input[this.pos];
      if (char === "\\") {
        const nextMarker = this.peekMarker();
        // Implicit closing: another note content marker or the note's closing marker
        if (this.noteContentMarkers.has(nextMarker) || this.noteMarkers.has(nextMarker)) {
          break;
        }
        // Handle nested character markers (which must have explicit closing)
        if (this.characterMarkers.has(nextMarker)) {
          const { marker, isNested } = this.parseMarker();
          node.content.push(this.parseCharacter(marker, isNested));
        } else {
          node.content.push(this.parseText());
        }
      } else {
        node.content.push(this.parseText());
      }
    }

    return this.createNode<CharacterNode>(node);
  }

  private createNode<T extends USFMNode>(baseNode: Omit<T, 'accept' | 'acceptWithContext'>): T {
    const withVisitor = {
      ...baseNode,
      accept<R>(visitor: USFMVisitor<R>): R {
        switch (baseNode.type) {
          case 'paragraph':
            return visitor.visitParagraph(withVisitor as unknown as ParagraphNode);
          case 'character':
            return visitor.visitCharacter(withVisitor as unknown as CharacterNode);
          case 'note':
            return visitor.visitNote(withVisitor as unknown as NoteNode);
          case 'text':
            return visitor.visitText(withVisitor as unknown as TextNode);
          case 'milestone':
            return visitor.visitMilestone(withVisitor as unknown as MilestoneNode);
          case 'peripheral':
            return visitor.visitPeripheral(withVisitor as unknown as PeripheralNode);
          default:
            throw new Error(`Unknown node type: ${baseNode.type}`);
        }
      },
      acceptWithContext<R, C>(visitor: USFMVisitorWithContext<R, C>, context: C): R {
        switch (baseNode.type) {
          case 'paragraph':
            return visitor.visitParagraph(withVisitor as unknown as ParagraphNode, context);
          case 'character':
            return visitor.visitCharacter(withVisitor as unknown as CharacterNode, context);
          case 'note':
            return visitor.visitNote(withVisitor as unknown as NoteNode, context);
          case 'text':
            return visitor.visitText(withVisitor as unknown as TextNode, context);
          case 'milestone':
            return visitor.visitMilestone(withVisitor as unknown as MilestoneNode, context);
          case 'peripheral':
            return visitor.visitPeripheral(withVisitor as unknown as PeripheralNode, context);
          default:
            throw new Error(`Unknown node type: ${baseNode.type}`);
        }
      }
    };
    return withVisitor as unknown as T;
  }

  private parseParagraph(marker: string): ParagraphNode {
    const node = {
      type: "paragraph" as const,
      marker,
      content: [] as USFMNode[],
    };

    const initialChar = this.input[this.pos];

    // Skip exactly one space after marker
    if (this.pos < this.input.length && this.isWhitespace(initialChar)) {
      this.pos++;
    }

    // Special cases
    if (marker === "b" || marker === "nb" || marker === "ib" || marker.startsWith("sd")) {
      return this.createNode<ParagraphNode>(node);
    }

    // Add validation for peripheral book IDs
    if (marker === "id") {
      const content = this.parseText();
      if (typeof content.content === "string") {
        const bookId = content.content.trim();
        if (this.peripheralBooks.has(bookId)) {
          // Handle peripheral book ID
          node.content.push(content);
        }
      }
    }

    // Parse content until next paragraph marker
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (char === "\\") {
        const nextMarker = this.peekMarker();
        if (this.paragraphMarkers.has(nextMarker)) {
          break;
        }
        const { marker, isNested } = this.parseMarker();
        if (this.characterMarkers.has(marker)) {
          node.content.push(this.parseCharacter(marker, isNested));
        } else if (this.noteMarkers.has(marker)) {
          node.content.push(this.parseNote(marker));
        } else {
          node.content.push(this.parseText(true));
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        break;
      } else {
        node.content.push(this.parseText(true));
      }
    }

    return this.createNode<ParagraphNode>(node);
  }

  private parseCharacter(marker: string, isNested: boolean = false): CharacterNode {
    const node: Omit<CharacterNode, 'accept' | 'acceptWithContext'> = {
      type: "character",
      marker,
      content: [],
    };

    // Special handling for verse numbers
    if (marker === "v") {
      // Skip any non-line-breaking whitespace before verse number
      while (
        this.pos < this.input.length
        && this.isNonLineBreakingWhitespace(this.getCurrentCharacter())
      ) {
        this.pos++;
      }

      let number = "";
      while (this.pos < this.input.length) {
        const char = this.getCurrentCharacter();
        if (this.isWhitespace(char)) {
          break;
        }
        number += char;
        this.pos++;
      }
      node.content.push(this.createNode<TextNode>({ type: "text", content: number }));

      // Skip any whitespace after verse number
      while (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
        this.pos++;
      }
      return this.createNode<CharacterNode>(node);
    }

    // Parse attributes if present
    if (
      this.pos < this.input.length &&
      this.getCurrentCharacter() === "|" &&
      (marker === "w" ||
        marker === "rb" ||
        marker === "xt" ||
        marker === "fig" ||
        marker === "wg" ||
        marker === "wh" ||
        marker === "wa" ||
        marker.startsWith("jmp"))
    ) {
      this.pos++; // Skip |
      node.attributes = this.parseAttributes();
    }

    // Skip non-line-breaking whitespace before content
    while (this.pos < this.input.length && this.isNonLineBreakingWhitespace(this.getCurrentCharacter())) {
      this.pos++;
    }

    let textContent = "";

    // Parse content until closing marker
    const closingMarker = `\\${isNested ? "+" : ""}${marker}*`;
    while (this.pos < this.input.length) {
      // Check for closing marker and move
      if (this.input.startsWith(closingMarker, this.pos)) {
        if (textContent) {
          node.content.push(this.createNode<TextNode>({ type: "text", content: textContent }));
        }
        this.pos += closingMarker.length;
        break;
      }

      const char = this.input[this.pos];
      
      if (char === "\\") {
        const nextMarker = this.peekMarker();
        if (this.paragraphMarkers.has(nextMarker)) {
          break;
        }
        const { marker, isNested } = this.parseMarker();

        // It's a nested marker
        if (this.noteMarkers.has(marker)) {
          if (textContent) {
            node.content.push(this.createNode<TextNode>({ type: "text", content: textContent }));
            textContent = "";
          }
          node.content.push(this.parseNote(marker));
        } else if (this.milestoneMarkers.has(marker)) { 
          if (textContent) {
            node.content.push(this.createNode<TextNode>({ type: "text", content: textContent }));
            textContent = "";
          }
          node.content.push(this.parseMilestone(marker));
        } else {
          if (textContent) {
            node.content.push(this.createNode<TextNode>({ type: "text", content: textContent }));
            textContent = "";
          }
          node.content.push(this.parseCharacter(marker, isNested));
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        break;
      } else {
        textContent += char;
        this.pos++;
      }
    }

    return this.createNode<CharacterNode>(node);
  }

  private parseNote(marker: string): NoteNode {
    const node: Omit<NoteNode, 'accept' | 'acceptWithContext'> = {
      type: "note",
      marker,
      content: [],
    };

    // Skip whitespace after marker
    while (this.pos < this.input.length && this.input[this.pos] === " ") {
      this.pos++;
    }

    // Parse caller for cross references
    if (marker === "x" || marker === "fe" || marker === "f") {
      const nextChar = this.input[this.pos];
      const charAfterNext = this.pos + 1 < this.input.length ? this.input[this.pos + 1] : '';
      
      if (nextChar !== " " && nextChar !== "\\" && this.isWhitespace(charAfterNext)) {
        node.caller = nextChar;
        this.pos++; // Move past the caller
        
        // Skip any following whitespace
        while (this.pos < this.input.length && this.isWhitespace(this.input[this.pos])) {
          this.pos++;
        }
      }
    }

    // Parse content until closing marker
    const closingMarker = `\\${marker}*`;
    while (this.pos < this.input.length) {
      if (this.input.startsWith(closingMarker, this.pos)) {
        this.pos += closingMarker.length;
        break;
      }

      const char = this.input[this.pos];
      if (char === "\\") {
        const nextMarker = this.peekMarker();
        if (this.noteContentMarkers.has(nextMarker)) {
          const { marker } = this.parseMarker();
          node.content.push(this.parseNoteContent(marker));
        } else if (this.characterMarkers.has(nextMarker)) {
          const { marker, isNested } = this.parseMarker();
          node.content.push(this.parseCharacter(marker, isNested));
        } else {
          node.content.push(this.parseText());
        }
      } else {
        node.content.push(this.parseText());
      }
    }

    return this.createNode<NoteNode>(node);
  }

  private parseText(isInsideParagraph: boolean = false): TextNode {
    let content = "";

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (char === "\\") {
        break;
      }

      if (this.isLineBreakingWhitespace(char)) {
        break;
      } else {
        content += char;
        this.pos++;
      }
    }

    return this.createNode<TextNode>({
      type: "text" as const,
      content
    });
  }

  private parseMilestone(marker: string): MilestoneNode {
    // Determine milestone type
    let milestoneType: "start" | "end" | "standalone" = "standalone";
    if (marker.endsWith("-s")) {
      milestoneType = "start";
      marker = marker.slice(0, -2);
    } else if (marker.endsWith("-e")) {
      milestoneType = "end";
      marker = marker.slice(0, -2);
    }

    // Parse attributes if present
    let attributes: MilestoneAttributes = {};
    if (this.pos < this.input.length && this.input[this.pos] === "|") {
      this.pos++; // Skip |
      attributes = this.parseAttributes();
    }

    // Skip to closing *
    while (this.pos < this.input.length && this.input[this.pos] !== "*") {
      this.pos++;
    }
    this.pos++; // Skip *

    return this.createNode<MilestoneNode>({
      type: "milestone" as const,
      marker,
      milestoneType,
      attributes,
    });
  }

  private parsePeripheral(): PeripheralNode {
    // Skip \periph marker
    this.pos += 7;

    // Parse title until | character
    let title = "";
    while (this.pos < this.input.length && this.input[this.pos] !== "|") {
      title += this.input[this.pos];
      this.pos++;
    }
    title = title.trim();

    // Parse attributes
    let attributes: PeripheralAttributes = { id: "" };
    if (this.pos < this.input.length && this.input[this.pos] === "|") {
      this.pos++; // Skip |
      attributes = this.parseAttributes() as PeripheralAttributes;

      // Validate peripheral id
      if (!attributes.id) {
        throw new Error("Peripheral division requires an id attribute");
      }
      if (!this.peripheralDivisionIds.has(attributes.id) && !attributes.id.startsWith("x-")) {
        throw new Error(`Invalid peripheral id: ${attributes.id}`);
      }
    }

    return this.createNode<PeripheralNode>({
      type: "peripheral" as const,
      marker: "periph",
      title,
      attributes,
      content: this.parseNodes(false),
    });
  }

  // Add visitor methods to the parser
  visit<T>(visitor: USFMVisitor<T>): T[] {
    return this.nodes.map(node => node.accept(visitor));
  }

  visitWithContext<T, C>(visitor: USFMVisitorWithContext<T, C>, context: C): T[] {
    return this.nodes.map(node => node.acceptWithContext(visitor, context));
  }
}

// Example visitors for different output formats
export class HTMLVisitor implements USFMVisitor<string> {
  visitParagraph(node: ParagraphNode): string {
    const tag = this.getParagraphTag(node.marker);
    const content = node.content.map(child => child.accept(this)).join('');
    return `<${tag}>${content}</${tag}>`;
  }

  visitCharacter(node: CharacterNode): string {
    const tag = this.getCharacterTag(node.marker);
    const content = node.content.map(child => child.accept(this)).join('');
    const attrs = node.attributes ? this.formatAttributes(node.attributes) : '';
    return `<${tag}${attrs}>${content}</${tag}>`;
  }

  visitNote(node: NoteNode): string {
    const tag = this.getNoteTag(node.marker);
    const content = node.content.map(child => child.accept(this)).join('');
    const caller = node.caller ? ` caller="${node.caller}"` : '';
    return `<${tag}${caller}>${content}</${tag}>`;
  }

  visitText(node: TextNode): string {
    return this.escapeHTML(node.content);
  }

  visitMilestone(node: MilestoneNode): string {
    const tag = this.getMilestoneTag(node.marker);
    const attrs = node.attributes ? this.formatAttributes(node.attributes) : '';
    return `<${tag}${attrs}/>`;
  }

  visitPeripheral(node: PeripheralNode): string {
    const content = node.content.map(child => child.accept(this)).join('');
    const attrs = this.formatAttributes(node.attributes);
    return `<div class="peripheral"${attrs}>${content}</div>`;
  }

  private getParagraphTag(marker: string): string {
    switch (marker) {
      case 'p': return 'p';
      case 'h': return 'h1';
      case 'mt': return 'h1';
      case 'ms': return 'h2';
      default: return 'div';
    }
  }

  private getCharacterTag(marker: string): string {
    switch (marker) {
      case 'bd': return 'strong';
      case 'it': return 'em';
      case 'sc': return 'span';
      case 'v': return 'sup';
      default: return 'span';
    }
  }

  private getNoteTag(marker: string): string {
    switch (marker) {
      case 'f': return 'footnote';
      case 'x': return 'crossref';
      default: return 'note';
    }
  }

  private getMilestoneTag(marker: string): string {
    return `milestone-${marker}`;
  }

  private formatAttributes(attrs: Record<string, string | string[] | undefined>): string {
    return Object.entries(attrs)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return ` ${key}="${value.join(' ')}"`;
        }
        return ` ${key}="${value}"`;
      })
      .join('');
  }

  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export class USXVisitor implements USFMVisitor<string> {
  visitParagraph(node: ParagraphNode): string {
    return `<para style="${node.marker}">${node.content.map(child => child.accept(this)).join('')}</para>`;
  }

  visitCharacter(node: CharacterNode): string {
    const attrs = node.attributes ? this.formatAttributes(node.attributes) : '';
    return `<char style="${node.marker}"${attrs}>${node.content.map(child => child.accept(this)).join('')}</char>`;
  }

  visitNote(node: NoteNode): string {
    const caller = node.caller ? ` caller="${node.caller}"` : '';
    return `<note style="${node.marker}"${caller}>${node.content.map(child => child.accept(this)).join('')}</note>`;
  }

  visitText(node: TextNode): string {
    return this.escapeXML(node.content);
  }

  visitMilestone(node: MilestoneNode): string {
    const attrs = node.attributes ? this.formatAttributes(node.attributes) : '';
    return `<ms style="${node.marker}"${attrs}/>`;
  }

  visitPeripheral(node: PeripheralNode): string {
    const attrs = this.formatAttributes(node.attributes);
    return `<peripheral${attrs}>${node.content.map(child => child.accept(this)).join('')}</peripheral>`;
  }

  private formatAttributes(attrs: Record<string, string | string[] | undefined>): string {
    return Object.entries(attrs)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return ` ${key}="${value.join(' ')}"`;
        }
        return ` ${key}="${value}"`;
      })
      .join('');
  }

  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export class USJVisitor implements USFMVisitor<any> {
  visitParagraph(node: ParagraphNode): any {
    return {
      type: 'paragraph',
      marker: node.marker,
      content: node.content.map(child => child.accept(this))
    };
  }

  visitCharacter(node: CharacterNode): any {
    return {
      type: 'character',
      marker: node.marker,
      attributes: node.attributes,
      content: node.content.map(child => child.accept(this))
    };
  }

  visitNote(node: NoteNode): any {
    return {
      type: 'note',
      marker: node.marker,
      caller: node.caller,
      content: node.content.map(child => child.accept(this))
    };
  }

  visitText(node: TextNode): any {
    return {
      type: 'text',
      content: node.content
    };
  }

  visitMilestone(node: MilestoneNode): any {
    return {
      type: 'milestone',
      marker: node.marker,
      milestoneType: node.milestoneType,
      attributes: node.attributes,
    };
  }

  visitPeripheral(node: PeripheralNode): any {
    return {
      type: 'peripheral',
      marker: node.marker,
      title: node.title,
      attributes: node.attributes,
      content: node.content.map(child => child.accept(this))
    };
  }
}
