// Types for USFM AST nodes
export type USFMNodeType = "paragraph" | "character" | "note" | "text" | "milestone" | "peripheral";

export interface USFMNode {
  type: USFMNodeType;
  marker?: string;
  content?: string | USFMNode[];
  attributes?: MilestoneAttributes;
}

export interface ParagraphNode extends USFMNode {
  type: "paragraph";
  marker: string;
  content: USFMNode[];
}

export interface CharacterNode extends USFMNode {
  type: "character";
  marker: string;
  content: USFMNode[];
}

export interface NoteNode extends USFMNode {
  type: "note";
  marker: string;
  caller?: string; // For footnotes
  content: USFMNode[];
}

export interface TextNode extends USFMNode {
  type: "text";
  content: string;
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

  private parseParagraph(marker: string): ParagraphNode {
    const node: ParagraphNode = {
      type: "paragraph",
      marker,
      content: [],
    };

    const initialChar = this.input[this.pos];

    // Skip exactly one space after marker
    if (this.pos < this.input.length && this.isWhitespace(initialChar)) {
      this.pos++;
    }

    // Special cases
    if (marker === "b" || marker === "nb" || marker === "ib" || marker.startsWith("sd")) {
      return node; // Blank line and no-break have no content
    }

    // Add validation for peripheral book IDs
    if (marker === "id") {
      const content = this.parseText();
      if (typeof content.content === "string") {
        const bookId = content.content.trim();
        if (this.peripheralBooks.has(bookId)) {
          // Handle peripheral book ID
        }
      }
    }

    // Parse content until next paragraph marker, passing isInsideParagraph=true
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

    return node;
  }

  private getCurrentCharacter(): string {
    return this.input[this.pos];
  }

  private parseCharacter(marker: string, isNested: boolean = false): CharacterNode {
    const node: CharacterNode = {
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
      node.content.push({ type: "text", content: number });

      // Skip any whitespace after verse number
      while (this.pos < this.input.length && this.isWhitespace(this.getCurrentCharacter())) {
        this.pos++;
      }
      return node;
    }

    // Parse attributes if present (for word markers or links)
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

    const currentChar = this.getCurrentCharacter();

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
        node.content.push({ type: "text", content: textContent });
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
          node.content.push(this.parseNote(marker));
        } else if (this.milestoneMarkers.has(marker)) { 
          node.content.push(this.parseMilestone(marker));
        } else {
          // Save any accumulated text before processing the nested marker
          node.content.push({ type: "text", content: textContent });
          textContent = "";
          node.content.push(this.parseCharacter(marker, isNested));
        }
      } else if (this.isLineBreakingWhitespace(char)) {
        break
      } else {
        textContent += char;
        this.pos++;
      }
    }

    return node;
  }

  private parseNote(marker: string): NoteNode {
    const node: NoteNode = {
      type: "note",
      marker,
      content: [],
    };

    // Skip whitespace after marker
    while (this.pos < this.input.length && this.input[this.pos] === " ") {
      this.pos++;
    }

    // Parse caller for cross references (similar to footnotes)
    if (marker === "x" || marker === "fe" || marker === "f") {
      // Peek ahead to check for caller
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
        // If we see another note content marker, it implicitly closes the previous one
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

    return node;
  }

  private parseNoteContent(marker: string): CharacterNode {
    const node: CharacterNode = {
      type: "character",
      marker,
      content: [],
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

    return node;
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

    return {
      type: "text",
      content: content
    };
  }

  private parseMilestone(marker: string): MilestoneNode {
    // Determine milestone type (start, end, or standalone)
    let milestoneType: "start" | "end" | "standalone" = "standalone";
    if (marker.endsWith("-s")) {
      milestoneType = "start";
      marker = marker.slice(0, -2); // Remove -s suffix
    } else if (marker.endsWith("-e")) {
      milestoneType = "end";
      marker = marker.slice(0, -2); // Remove -e suffix
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

    return {
      type: "milestone",
      marker,
      milestoneType,
      attributes,
    };
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

    return {
      type: "peripheral",
      marker: "periph",
      title,
      attributes,
      content: this.parseNodes(false),
    };
  }
}
