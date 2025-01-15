import { 
  USFMVisitor,
  ParagraphNode, 
  CharacterNode, 
  NoteNode, 
  TextNode, 
  MilestoneNode, 
  PeripheralNode, 
  USFMNode 
} from '../interfaces/USFMNodes';

export class USXVisitor implements USFMVisitor<string> {
  private result: string[] = [];

  visitParagraph(node: ParagraphNode): string {
    this.result.push(`<para style="${node.marker}">`);
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.result.push('</para>');
    return this.result.join('');
  }

  visitCharacter(node: CharacterNode): string {
    this.result.push(`<char style="${node.marker}">`);
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.result.push('</char>');
    return this.result.join('');
  }

  visitNote(node: NoteNode): string {
    this.result.push(`<note style="${node.marker}" caller="${node.caller || ''}">`);
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.result.push('</note>');
    return this.result.join('');
  }

  visitText(node: TextNode): string {
    this.result.push(this.escapeXML(node.content));
    return this.result.join('');
  }

  visitMilestone(node: MilestoneNode): string {
    const attrs = Object.entries(node.attributes || {})
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    this.result.push(`<ms style="${node.marker}" ${attrs}/>`);
    return this.result.join('');
  }

  visitPeripheral(node: PeripheralNode): string {
    this.result.push(`<peripheral style="${node.marker}">`);
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.result.push('</peripheral>');
    return this.result.join('');
  }

  getResult(): string {
    return `<?xml version="1.0" encoding="utf-8"?>\n<usx version="3.0">\n${this.result.join('')}\n</usx>`;
  }

  private escapeXML(text: string): string {
    const xmlEscapes: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    };
    return text.replace(/[&<>"']/g, char => xmlEscapes[char]);
  }
} 