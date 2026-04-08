/**
 * Convert USX 3.x XML (subset matching {@link USXVisitor} output) to USFM for {@link USFMParser}.
 */

import { DOMParser } from '@xmldom/xmldom';

function localName(el: Element): string {
  return (el.localName || el.nodeName || '').replace(/^.*:/, '').toLowerCase();
}

function getAttr(el: Element, name: string): string {
  return el.getAttribute(name) ?? '';
}

/** Serialize text for USFM body (keep newlines; trim only if pure whitespace between tags). */
function textNodeContent(node: Node): string {
  if (node.nodeType === 3) {
    return (node as Text).data ?? '';
  }
  return '';
}

/**
 * Walk inline / block mix inside `<para>`, `<char>`, `<note>`, etc.
 */
function serializeInline(parent: Element): string {
  let out = '';
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]!;
    if (child.nodeType === 3) {
      out += textNodeContent(child);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = localName(el);
    if (tag === 'verse') {
      const num = getAttr(el, 'number').trim();
      if (num) out += `\\v ${num} `;
      continue;
    }
    if (tag === 'char') {
      const style = getAttr(el, 'style').trim();
      if (!style) {
        out += serializeInline(el);
        continue;
      }
      out += `\\${style} `;
      out += serializeInline(el);
      out += `\\${style}*`;
      continue;
    }
    if (tag === 'ref') {
      out += serializeInline(el);
      continue;
    }
    if (tag === 'optbreak') {
      out += '\\pb ';
      continue;
    }
    // Unknown inline: recurse text only
    out += serializeInline(el);
  }
  return out;
}

function serializeBlock(el: Element): string {
  const tag = localName(el);
  const style = getAttr(el, 'style').trim();

  if (tag === 'book' && style === 'id') {
    const code = getAttr(el, 'code').trim();
    const rest = (el.textContent ?? '').trim();
    return `\\id ${code}${rest ? ` ${rest}` : ''}\n`;
  }

  if (tag === 'chapter' && style === 'c') {
    const num = getAttr(el, 'number').trim();
    if (!num) return '';
    // Self-closing milestone-only chapter end tags have eid, no number
    return `\\c ${num}\n`;
  }

  if (tag === 'chapter' && getAttr(el, 'eid') && !getAttr(el, 'number')) {
    return '';
  }

  if (tag === 'verse' && getAttr(el, 'eid') && !getAttr(el, 'number')) {
    return '';
  }

  if (tag === 'para' && style) {
    return `\\${style}\n${serializeInline(el)}`;
  }

  if (tag === 'char' && style) {
    return `\\${style} ${serializeInline(el)}\\${style}*\n`;
  }

  if (tag === 'note') {
    const caller = getAttr(el, 'caller') || '+';
    const inner = serializeInline(el);
    return `\\f ${caller} ${inner}\\f*\n`;
  }

  let out = '';
  if (tag === 'table') {
    for (let i = 0; i < el.childNodes.length; i++) {
      const c = el.childNodes[i]!;
      if (c.nodeType === 1) out += serializeBlock(c as Element);
    }
    return out;
  }

  if (tag === 'row') {
    for (let i = 0; i < el.childNodes.length; i++) {
      const c = el.childNodes[i]!;
      if (c.nodeType === 1) out += serializeBlock(c as Element);
    }
    return out;
  }

  if (tag === 'cell') {
    const st = getAttr(el, 'style').trim();
    if (st) return `\\${st} ${serializeInline(el)}\n`;
    return serializeInline(el);
  }

  if (tag === 'ms') {
    const st = getAttr(el, 'style').trim();
    if (st) return `\\${st} `;
    return '';
  }

  // Fallback: children
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i]!;
    if (c.nodeType === 1) out += serializeBlock(c as Element);
    else if (c.nodeType === 3) out += textNodeContent(c);
  }
  return out;
}

/**
 * Convert a USX XML string to USFM. Supports the common elements emitted by {@link USXVisitor}.
 */
export function usxXmlToUsfm(xml: string): string {
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: (e: Error) => {
        throw e;
      },
    },
  }).parseFromString(xml, 'text/xml');

  const root = doc.documentElement;
  if (!root) throw new Error('USX: empty document');

  const name = localName(root);
  if (name !== 'usx') {
    throw new Error(`USX: expected root <usx>, got <${root.nodeName}>`);
  }

  const parts: string[] = [];
  for (let i = 0; i < root.childNodes.length; i++) {
    const n = root.childNodes[i]!;
    if (n.nodeType === 3) {
      const t = textNodeContent(n);
      if (t.trim()) parts.push(t);
    } else if (n.nodeType === 1) {
      parts.push(serializeBlock(n as Element));
    }
  }

  return parts.join('').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
