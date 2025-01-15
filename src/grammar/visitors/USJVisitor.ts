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

interface USJNode {
  type: string;
  marker?: string;
  caller?: string;
  content?: USJNode[];
  text?: string;
  attributes?: { [key: string]: string | string[] | undefined };
  version?: string;
  title?: string;
}

export class USJVisitor implements USFMVisitor<USJNode> {
  private result: USJNode[] = [];
  private currentNode: USJNode | null = null;

  visitParagraph(node: ParagraphNode): USJNode {
    const paraNode: USJNode = {
      type: 'paragraph',
      marker: node.marker,
      content: []
    };
    const prevNode = this.currentNode;
    this.currentNode = paraNode;
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.currentNode = prevNode;
    
    if (prevNode && prevNode.content) {
      prevNode.content.push(paraNode);
    } else {
      this.result.push(paraNode);
    }
    return paraNode;
  }

  visitCharacter(node: CharacterNode): USJNode {
    const charNode: USJNode = {
      type: 'character',
      marker: node.marker,
      content: []
    };
    const prevNode = this.currentNode;
    this.currentNode = charNode;
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.currentNode = prevNode;
    
    if (prevNode && prevNode.content) {
      prevNode.content.push(charNode);
    } else {
      this.result.push(charNode);
    }
    return charNode;
  }

  visitNote(node: NoteNode): USJNode {
    const noteNode: USJNode = {
      type: 'note',
      marker: node.marker,
      caller: node.caller,
      content: []
    };
    const prevNode = this.currentNode;
    this.currentNode = noteNode;
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.currentNode = prevNode;
    
    if (prevNode && prevNode.content) {
      prevNode.content.push(noteNode);
    } else {
      this.result.push(noteNode);
    }
    return noteNode;
  }

  visitText(node: TextNode): USJNode {
    const textNode: USJNode = {
      type: 'text',
      text: node.content
    };
    
    if (this.currentNode && this.currentNode.content) {
      this.currentNode.content.push(textNode);
    } else {
      this.result.push(textNode);
    }
    return textNode;
  }

  visitMilestone(node: MilestoneNode): USJNode {
    const msNode: USJNode = {
      type: 'milestone',
      marker: node.marker,
      attributes: node.attributes || {}
    };
    
    if (this.currentNode && this.currentNode.content) {
      this.currentNode.content.push(msNode);
    } else {
      this.result.push(msNode);
    }
    return msNode;
  }

  visitPeripheral(node: PeripheralNode): USJNode {
    const periphNode: USJNode = {
      type: 'peripheral',
      marker: node.marker,
      title: node.title,
      content: []
    };
    const prevNode = this.currentNode;
    this.currentNode = periphNode;
    node.content.forEach((child: USFMNode) => child.accept(this));
    this.currentNode = prevNode;
    
    if (prevNode && prevNode.content) {
      prevNode.content.push(periphNode);
    } else {
      this.result.push(periphNode);
    }
    return periphNode;
  }

  getResult(): USJNode {
    return {
      type: 'usfm',
      version: '3.0',
      content: this.result
    };
  }
} 