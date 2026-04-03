/**
 * Pretty-print USX / XML for display (browser DOMParser + serializer).
 * Falls back to the original string if parsing fails.
 */

function xmlEscapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmlEscapeAttr(s: string): string {
  return xmlEscapeText(s).replace(/"/g, '&quot;');
}

function formatAttrs(el: Element): string {
  return Array.from(el.attributes)
    .map((a) => ` ${a.name}="${xmlEscapeAttr(a.value)}"`)
    .join('');
}

function serializeElement(el: Element, depth: number, tab: string): string {
  const pad = tab.repeat(depth);
  const name = el.tagName;
  const attrs = formatAttrs(el);
  const children = Array.from(el.childNodes);

  const meaningful = children.filter((c) => {
    if (c.nodeType === Node.TEXT_NODE) return (c as Text).data.trim().length > 0;
    return (
      c.nodeType === Node.ELEMENT_NODE ||
      c.nodeType === Node.CDATA_SECTION_NODE ||
      c.nodeType === Node.COMMENT_NODE
    );
  });

  if (meaningful.length === 0) {
    return `${pad}<${name}${attrs}/>`;
  }

  const onlyNonElement = meaningful.every((c) => c.nodeType !== Node.ELEMENT_NODE);
  if (onlyNonElement) {
    let inner = '';
    for (const c of meaningful) {
      if (c.nodeType === Node.TEXT_NODE) {
        inner += xmlEscapeText((c as Text).data);
      } else if (c.nodeType === Node.CDATA_SECTION_NODE) {
        inner += `<![CDATA[${(c as CDATASection).data}]]>`;
      } else if (c.nodeType === Node.COMMENT_NODE) {
        inner += `<!--${(c as Comment).data}-->`;
      }
    }
    return `${pad}<${name}${attrs}>${inner}</${name}>`;
  }

  let body = '';
  for (const c of meaningful) {
    if (c.nodeType === Node.ELEMENT_NODE) {
      body += '\n' + serializeElement(c as Element, depth + 1, tab);
    } else if (c.nodeType === Node.TEXT_NODE) {
      const t = (c as Text).data.trim();
      if (t) body += '\n' + tab.repeat(depth + 1) + xmlEscapeText(t);
    } else if (c.nodeType === Node.CDATA_SECTION_NODE) {
      body += '\n' + tab.repeat(depth + 1) + `<![CDATA[${(c as CDATASection).data}]]>`;
    } else if (c.nodeType === Node.COMMENT_NODE) {
      body += '\n' + tab.repeat(depth + 1) + `<!--${(c as Comment).data}-->`;
    }
  }
  return `${pad}<${name}${attrs}>${body}\n${pad}</${name}>`;
}

/**
 * Indent and line-break XML for the playground. Returns original `xml` if it is not well-formed.
 */
export function formatUsxXml(xml: string): string {
  const trimmed = xml.trim();
  if (!trimmed) return xml;

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return xml;
  }

  const declMatch = trimmed.match(/^<\?xml[\s\S]*?\?>\s*/);
  const decl = declMatch ? declMatch[0].replace(/\s+$/, '') + '\n' : '';

  const root = doc.documentElement;
  if (!root) return xml;

  return decl + serializeElement(root, 0, '  ') + '\n';
}
