import { 
  BaseUSFMVisitor,
} from '../../interfaces/USFMNodes';
import {
  ParagraphUSFMNode,
  CharacterUSFMNode,
  NoteUSFMNode,
  TextUSFMNode,
  MilestoneUSFMNode,
} from '../../nodes';

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

export class USJVisitor implements BaseUSFMVisitor<USJNode> {
  private result: USJNode[] = [];
  private currentNode: USJNode | null = null;

  visitParagraph(node: ParagraphUSFMNode): USJNode {
    const paraNode: USJNode = {
      type: 'paragraph',
      marker: node.marker,
      content: []
    };
    const prevNode = this.currentNode;
    this.currentNode = paraNode;
    node.content.forEach((child) => child.accept(this));
    this.currentNode = prevNode;
    
    if (prevNode && prevNode.content) {
      prevNode.content.push(paraNode);
    } else {
      this.result.push(paraNode);
    }
    return paraNode;
  }

  visitCharacter(node: CharacterUSFMNode): USJNode {
    const charNode: USJNode = {
      type: 'character',
      marker: node.marker,
      content: []
    };
    const prevNode = this.currentNode;
    this.currentNode = charNode;
    node.content.forEach((child) => child.accept(this));
    this.currentNode = prevNode;
    
    if (prevNode && prevNode.content) {
      prevNode.content.push(charNode);
    } else {
      this.result.push(charNode);
    }
    return charNode;
  }

  visitNote(node: NoteUSFMNode): USJNode {
    const noteNode: USJNode = {
      type: 'note',
      marker: node.marker,
      caller: node.caller,
      content: []
    };
    const prevNode = this.currentNode;
    this.currentNode = noteNode;
    node.content.forEach((child) => child.accept(this));
    this.currentNode = prevNode;
    
    if (prevNode && prevNode.content) {
      prevNode.content.push(noteNode);
    } else {
      this.result.push(noteNode);
    }
    return noteNode;
  }

  visitText(node: TextUSFMNode): USJNode {
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

  visitMilestone(node: MilestoneUSFMNode): USJNode {
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

  getResult(): USJNode {
    return {
      type: 'usfm',
      version: '3.0',
      content: this.result
    };
  }

  getDocument(): USJNode {
    return this.getResult();
  }
} 