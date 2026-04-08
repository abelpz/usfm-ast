/**
 * Tree-shakeable Lucide icon imports + maps for docs-like WYSIWYG chrome.
 */

import type { IconNode } from './lucide-render';

import Bold from 'lucide/dist/esm/icons/bold.js';
import Book from 'lucide/dist/esm/icons/book.js';
import BookOpen from 'lucide/dist/esm/icons/book-open.js';
import EllipsisVertical from 'lucide/dist/esm/icons/ellipsis-vertical.js';
import FileText from 'lucide/dist/esm/icons/file-text.js';
import Heading from 'lucide/dist/esm/icons/heading.js';
import Indent from 'lucide/dist/esm/icons/list-indent-increase.js';
import Italic from 'lucide/dist/esm/icons/italic.js';
import Languages from 'lucide/dist/esm/icons/languages.js';
import List from 'lucide/dist/esm/icons/list.js';
import Minus from 'lucide/dist/esm/icons/minus.js';
import Pilcrow from 'lucide/dist/esm/icons/pilcrow.js';
import SquareSplitVertical from 'lucide/dist/esm/icons/square-split-vertical.js';
import TextQuote from 'lucide/dist/esm/icons/text-quote.js';
import type { DocsMenuIconKey } from './docs-ui-types';

const MENU_ICONS: Record<DocsMenuIconKey, IconNode> = {
  /** Normal body / “Normal text” */
  paragraph: Pilcrow as IconNode,
  /** Section & title lines (`\s`, `\mt`, …) */
  heading: Heading as IconNode,
  /** Poetry / quoted lines */
  poetry: TextQuote as IconNode,
  /** Lists */
  list: List as IconNode,
  /** Blank spacer */
  blank: Minus as IconNode,
  /** Indented / hanging paragraphs */
  indent: Indent as IconNode,
  /** Insert title block */
  insert_book: BookOpen as IconNode,
  /** Labels use {@link boldLetterSvg} in `menuIconSvg` — placeholder for typing only */
  insert_verse: Pilcrow as IconNode,
  insert_chapter: Pilcrow as IconNode,
  split_block: SquareSplitVertical as IconNode,
  translator: Languages as IconNode,
  /** Identification / TOC-style lines (`\ide`, `\h`, `\toc`) */
  meta: FileText as IconNode,
  /** Book line `\id` */
  book: Book as IconNode,
};

export function menuIconNode(key: DocsMenuIconKey): IconNode {
  return MENU_ICONS[key] ?? MENU_ICONS.paragraph;
}

export const bubbleIconBold: IconNode = Bold as IconNode;
export const bubbleIconItalic: IconNode = Italic as IconNode;

/** Notion-style gutter “block options” handle (Basic / Medium). */
export const gutterBlockOptionsIcon: IconNode = EllipsisVertical as IconNode;
