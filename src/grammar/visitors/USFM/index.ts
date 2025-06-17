import { noteContentMarkers } from '../../constants/markers';
import { BaseUSFMVisitor, NoteNode } from '../../interfaces/USFMNodes';
import { CharacterUSFMNode, MilestoneUSFMNode, ParagraphUSFMNode, TextUSFMNode } from '../../nodes';

/**
 * USFMVisitor implements the visitor pattern to convert USFM AST nodes back into USFM text.
 * Each visit method handles a specific type of node and returns the USFM string representation.
 */
export class USFMVisitor implements BaseUSFMVisitor<string> {
  /** Accumulates the USFM text parts during traversal */
  private result: string[] = [];

  /**
   * Visits a paragraph node and converts it to USFM format.
   * Paragraph markers start with a newline and are followed by their content.
   *
   * @example
   * \p This is a paragraph
   *
   * @param node The paragraph node to visit
   */
  visitParagraph(node: ParagraphUSFMNode): string {
    const marker = `\\${node.marker}`;
    // Add newline before paragraph and space if there's content
    this.result.push(`\n${marker}${node.content.length > 0 ? ' ' : ''}`);
    // Visit all child nodes
    node.content.forEach((child) => child.accept(this));
    return this.result.join('');
  }

  /**
   * Visits a character node and converts it to USFM format.
   * Handles special cases for verse numbers, nested character markers, and note content.
   *
   * @example
   * \w word\w*          // Regular character marker
   * \v 1               // Verse marker
   * \+w nested\+w*     // Nested character marker
   * \ft note           // Note content marker
   *
   * @param node The character node to visit
   */
  visitCharacter(node: CharacterUSFMNode): string {
    const isVerse = node.marker === 'v';
    const nestedChar = node.getParent()?.type === 'character' ? '+' : '';
    const isNoteContent = noteContentMarkers.has(node.marker);
    const marker = `\\${nestedChar}${node.marker}`;

    // Add opening marker with space
    this.result.push(`${marker} `);

    // Process child nodes
    node.content.forEach((child) => child.accept(this));

    // Handle attributes if present
    if (node.attributes) {
      const attributes = Object.entries(node.attributes)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      this.result.push(`|${attributes}`);
    }

    // Add appropriate closing based on marker type
    if (isVerse) {
      this.result.push(` `); // Extra space after verse number
    } else if (!isNoteContent) {
      this.result.push(`${marker}*`); // Regular closing marker
    }

    return this.result.join('');
  }

  /**
   * Visits a note node and converts it to USFM format.
   * Notes are always wrapped in opening and closing markers.
   *
   * @example
   * \f footnote content\f*
   *
   * @param node The note node to visit
   */
  visitNote(node: NoteNode): string {
    const marker = `\\${node.marker}`;
    this.result.push(`${marker} `);
    node.content.forEach((child) => child.accept(this));
    this.result.push(`${marker}*`);
    return this.result.join('');
  }

  /**
   * Visits a milestone node and converts it to USFM format.
   * Milestones can have attributes.
   *
   * @example
   * \qt-s |sid="qt_123"\*
   *
   * @param node The milestone node to visit
   */
  visitMilestone(node: MilestoneUSFMNode): string {
    const marker = `\\${node.marker}`;

    this.result.push(`${marker} `);

    // Add attributes if present
    if (node.attributes) {
      const attributes = Object.entries(node.attributes)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      this.result.push(`|${attributes}`);
    }

    this.result.push(`\\*`);

    return this.result.join('');
  }

  /**
   * Visits a text node and converts it to USFM format.
   * Text nodes represent plain text content.
   *
   * @param node The text node to visit
   */
  visitText(node: TextUSFMNode): string {
    this.result.push(node.content);
    return this.result.join('');
  }

  /**
   * Returns the complete USFM string after visiting all nodes.
   */
  getResult(): string {
    return this.result.join('');
  }
} 