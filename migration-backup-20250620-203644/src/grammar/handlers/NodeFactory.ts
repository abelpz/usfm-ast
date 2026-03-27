import {
  USFMNode,
  RootNode,
  HydratedUSFMNode,
  ParagraphNode,
  CharacterNode,
  NoteNode,
  TextNode,
  MilestoneNode,
} from '../interfaces/USFMNodes';
import {
  CharacterUSFMNode,
  MilestoneUSFMNode,
  NodeInstanceType,
  NoteUSFMNode,
  ParagraphUSFMNode,
  TextUSFMNode,
} from '../nodes';
import { USFMNodeUnion } from '../index';

export class NodeFactory {
  createNode<T extends USFMNode>(
    baseNode: T,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): NodeInstanceType<T> {
    // This approach is flawed - the main parser has a better createNode implementation
    // This should be refactored to use the actual node constructors
    throw new Error('NodeFactory needs to be refactored - use main parser createNode method');
  }

  createTextNode(content: string, index: number, parent?: USFMNodeUnion | RootNode): TextUSFMNode {
    return this.createNode(
      {
        type: 'text',
        content,
      },
      index,
      parent
    );
  }

  createParagraphNode(
    marker: string,
    attributes: Record<string, string>,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): ParagraphUSFMNode {
    return this.createNode(
      {
        type: 'paragraph',
        marker,
        attributes,
      },
      index,
      parent
    );
  }

  createCharacterNode(
    marker: string,
    attributes: Record<string, string>,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): CharacterUSFMNode {
    return this.createNode(
      {
        type: 'character',
        marker,
        attributes,
      },
      index,
      parent
    );
  }

  createNoteNode(
    marker: string,
    attributes: Record<string, string>,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): NoteUSFMNode {
    return this.createNode(
      {
        type: 'note',
        marker,
        attributes,
      },
      index,
      parent
    );
  }

  createMilestoneNode(
    marker: string,
    attributes: Record<string, string>,
    index: number,
    parent?: USFMNodeUnion | RootNode
  ): MilestoneUSFMNode {
    return this.createNode(
      {
        type: 'milestone',
        marker,
        attributes,
      },
      index,
      parent
    );
  }
}