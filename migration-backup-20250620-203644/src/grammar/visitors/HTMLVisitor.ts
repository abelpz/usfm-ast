import { 
  BaseUSFMVisitor,
} from '../interfaces/USFMNodes';
import {
  ParagraphUSFMNode,
  CharacterUSFMNode,
  NoteUSFMNode,
  TextUSFMNode,
  MilestoneUSFMNode,
} from '../nodes';

export class HTMLVisitor implements BaseUSFMVisitor<string> {
  private result: string[] = [];

  visitParagraph(node: ParagraphUSFMNode): string {
    this.result.push('<p>');
    node.content.forEach((child) => child.accept(this));
    this.result.push('</p>');
    return this.result.join('');
  }

  visitCharacter(node: CharacterUSFMNode): string {
    const tag = this.getHTMLTag(node.marker);
    this.result.push(`<${tag}>`);
    node.content.forEach((child) => child.accept(this));
    this.result.push(`</${tag}>`);
    return this.result.join('');
  }

  visitNote(node: NoteUSFMNode): string {
    this.result.push('<sup class="footnote">');
    node.content.forEach((child) => child.accept(this));
    this.result.push('</sup>');
    return this.result.join('');
  }

  visitText(node: TextUSFMNode): string {
    this.result.push(this.escapeHTML(node.content));
    return this.result.join('');
  }

  visitMilestone(node: MilestoneUSFMNode): string {
    this.result.push(`<milestone type="${node.marker}"/>`);
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