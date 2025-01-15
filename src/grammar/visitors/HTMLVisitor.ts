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

export class HTMLVisitor implements USFMVisitor<string> {
  private result: string[] = [];

  visitParagraph(node: ParagraphNode): string {
    this.result.push('<p>');
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.result.push('</p>');
    return this.result.join('');
  }

  visitCharacter(node: CharacterNode): string {
    const tag = this.getHTMLTag(node.marker);
    this.result.push(`<${tag}>`);
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.result.push(`</${tag}>`);
    return this.result.join('');
  }

  visitNote(node: NoteNode): string {
    this.result.push('<sup class="footnote">');
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.result.push('</sup>');
    return this.result.join('');
  }

  visitText(node: TextNode): string {
    this.result.push(this.escapeHTML(node.content));
    return this.result.join('');
  }

  visitMilestone(node: MilestoneNode): string {
    this.result.push(`<milestone type="${node.marker}"/>`);
    return this.result.join('');
  }

  visitPeripheral(node: PeripheralNode): string {
    this.result.push(`<div class="peripheral ${node.marker}">`);
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.result.push('</div>');
    return this.result.join('');
  }

  getResult(): string {
    return this.result.join('');
  }

  private getHTMLTag(marker: string): string {
    const markerMap: { [key: string]: string } = {
      'bd': 'strong',
      'it': 'em',
      'sc': 'span class="small-caps"',
      'sup': 'sup',
      'sub': 'sub',
      'ul': 'u',
      'f': 'sup',
      'fr': 'span',
      'ft': 'span'
    };
    return markerMap[marker] || 'span';
  }

  private escapeHTML(text: string): string {
    const htmlEscapes: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
  }
} 