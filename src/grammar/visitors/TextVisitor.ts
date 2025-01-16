import { 
  BaseUSFMVisitor,
  ParagraphNode, 
  CharacterNode, 
  NoteNode, 
  TextNode, 
  MilestoneNode, 
  PeripheralNode, 
  USFMNode 
} from '../interfaces/USFMNodes';
import { 
  ParagraphUSFMNode, 
  CharacterUSFMNode, 
  NoteUSFMNode, 
  TextUSFMNode, 
  MilestoneUSFMNode, 
  PeripheralUSFMNode, 
} from '../nodes';

export class TextVisitor implements BaseUSFMVisitor<string> {
  private result: string[] = [];

  visitParagraph(node: ParagraphUSFMNode): string {
    if(!['m', 'p'].includes(node.marker)) {
      return "";
    }
    this.result.push('\n');
    node.content.forEach((child) => child.accept(this));
    return this.result.join('');
  }

  visitCharacter(node: CharacterUSFMNode): string {
    if(['v'].includes(node.marker)) {
      return "";
    }
    node.content.forEach((child) => child.accept(this));
    return this.result.join('');
  }

  visitNote(node: NoteUSFMNode): string {
    return "";
  }

  visitText(node: TextUSFMNode): string {
    this.result.push(node.content);
    return this.result.join('');
  }

  visitMilestone(node: MilestoneUSFMNode): string {
    return "";
  }

  visitPeripheral(node: PeripheralUSFMNode): string {
    return "";
  }

  getResult(): string {
    return this.result.join('').trim();
  }
} 