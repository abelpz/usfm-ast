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

export class TextVisitor implements USFMVisitor<string> {
  private result: string[] = [];

  visitParagraph(node: ParagraphNode): string {
    if(!['m', 'p'].includes(node.marker)) {
      return "";
    }
    this.result.push('\n');
    node.content.forEach((child: USFMNode) => child.accept(this));
    return this.result.join('');
  }

  visitCharacter(node: CharacterNode): string {
    if(['v'].includes(node.marker)) {
      return "";
    }
    node.content.forEach((child: USFMNode) => child.accept(this));
    return this.result.join('');
  }

  visitNote(node: NoteNode): string {
    return "";
  }

  visitText(node: TextNode): string {
    this.result.push(node.content);
    return this.result.join('');
  }

  visitMilestone(node: MilestoneNode): string {
    return "";
  }

  visitPeripheral(node: PeripheralNode): string {
    return "";
  }

  getResult(): string {
    return this.result.join('').trim();
  }
} 