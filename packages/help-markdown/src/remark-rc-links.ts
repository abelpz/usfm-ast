/**
 * Turn plain-text `rc://…` URLs in mdast text nodes into link nodes (tc-study parity).
 */

import type { Link, Parent, Text } from 'mdast';
import { visit } from 'unist-util-visit';

const RC_LINK_REGEX = /(rc:\/\/[^\s)\]}\n]+)/g;

function splitTextToNodes(value: string): Array<Text | Link> {
  const nodes: Array<Text | Link> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  RC_LINK_REGEX.lastIndex = 0;
  while ((m = RC_LINK_REGEX.exec(value)) !== null) {
    if (m.index > lastIndex) {
      nodes.push({ type: 'text', value: value.slice(lastIndex, m.index) });
    }
    const url = m[1]!;
    nodes.push({
      type: 'link',
      url,
      children: [{ type: 'text', value: url }],
    });
    lastIndex = m.index + url.length;
  }
  if (lastIndex < value.length) {
    nodes.push({ type: 'text', value: value.slice(lastIndex) });
  }
  return nodes.length ? nodes : [{ type: 'text', value }];
}

export function remarkRcLinks() {
  return (tree: import('mdast').Root) => {
    visit(tree, (node) => {
      if (node.type === 'link') return;
      if (!('children' in node) || !Array.isArray((node as Parent).children)) return;
      const parent = node as Parent;
      const newChildren: typeof parent.children = [];
      for (const child of parent.children) {
        if (child.type === 'text' && typeof (child as Text).value === 'string') {
          const value = (child as Text).value;
          if (value.includes('rc://')) {
            newChildren.push(...splitTextToNodes(value));
            continue;
          }
        }
        newChildren.push(child);
      }
      parent.children = newChildren;
    });
  };
}
