/**
 * Compare USX XML from our {@link @usfm-tools/adapters} USXVisitor with USX from an oracle
 * (e.g. usfmtc, usfm3). Uses parsed DOM: **hierarchy**, **element names**, and **attributes** —
 * character data between tags is ignored.
 */

import { DOMParser } from '@xmldom/xmldom';

import { histogramCosine } from './compareUsj';

export type CompareUsxOptions = {
  /** Minimum combined score (0–1). Default 0.73 */
  minScore?: number;
  /** Minimum recursive structure score. Default 0.63 */
  minStructureSimilarity?: number;
  /** Minimum mean attribute Jaccard on aligned elements. Default 0.56 */
  minAttributeSimilarity?: number;
  /** Minimum tag-name histogram cosine (element nodes only). Default 0.52 */
  minTagHistogramSimilarity?: number;
};

export type CompareUsxResult = {
  ok: boolean;
  /** Recursive score: matching tags, aligned child order, length penalty for extra/missing children */
  structureSimilarity: number;
  /** Mean Jaccard similarity of attribute sets at each aligned element pair */
  attributeSimilarity: number;
  /** Cosine similarity of element local-name counts (ignores attributes and text) */
  tagHistogramSimilarity: number;
  /** Weighted blend used for `ok` */
  score: number;
  messages: string[];
};

/** Strip tags; collapse whitespace — legacy helper (not used for pass/fail). Linear-time scan (no tag-regex ReDoS). */
export function extractXmlTextContent(xml: string): string {
  let out = '';
  let i = 0;
  while (i < xml.length) {
    const ch = xml[i];
    if (ch === '<') {
      const gt = xml.indexOf('>', i + 1);
      if (gt === -1) {
        out += xml.slice(i);
        break;
      }
      out += ' ';
      i = gt + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Count opening/local tag names in a string — legacy helper. */
export function countXmlTagNames(xml: string): Map<string, number> {
  const counts = new Map<string, number>();
  const re = /<([\w:-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const name = m[1];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function hasParserError(doc: Document): boolean {
  const root = doc.documentElement;
  if (!root) return true;
  const name = (root.localName || root.nodeName || '').toLowerCase();
  return name === 'parsererror';
}

function parseXml(xml: string): Document | null {
  const trimmed = xml.trim();
  if (!trimmed) return null;
  try {
    const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
    if (hasParserError(doc)) return null;
    return doc;
  } catch {
    return null;
  }
}

function localElementName(el: Element): string {
  const n = el.localName || el.nodeName || '';
  return n.includes(':') ? n.split(':').pop()! : n;
}

function childElements(parent: Element): Element[] {
  const out: Element[] = [];
  for (let c = parent.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1) out.push(c as Element);
  }
  return out;
}

function attributeNameValueMap(el: Element): Map<string, string> {
  const m = new Map<string, string>();
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (!a) continue;
    const name = a.name || a.nodeName;
    m.set(name, a.value ?? '');
  }
  return m;
}

/**
 * For each attribute name that appears on **both** elements, values must match.
 * Names only on one side are ignored (extra `sid` / tooling-specific attrs do not reduce the score).
 */
function attributeValueAgreementOnSharedKeys(a: Element, b: Element): number {
  const m1 = attributeNameValueMap(a);
  const m2 = attributeNameValueMap(b);
  if (m1.size === 0 && m2.size === 0) return 1;
  let shared = 0;
  let match = 0;
  for (const [k, v1] of m1) {
    if (!m2.has(k)) continue;
    shared++;
    if (v1 === m2.get(k)) match++;
  }
  if (shared === 0) return 1;
  return match / shared;
}

function countElementTagNamesFromDom(root: Element): Map<string, number> {
  const counts = new Map<string, number>();
  function walk(el: Element): void {
    const tag = localElementName(el);
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
    for (const ch of childElements(el)) walk(ch);
  }
  walk(root);
  return counts;
}

type CompareSubtreeResult = {
  /** Local structural score for this subtree (0–1) */
  structure: number;
  attrSum: number;
  attrCount: number;
};

function compareElements(e1: Element, e2: Element): CompareSubtreeResult {
  if (localElementName(e1) !== localElementName(e2)) {
    return { structure: 0, attrSum: 0, attrCount: 0 };
  }

  const attrSim = attributeValueAgreementOnSharedKeys(e1, e2);
  const kids1 = childElements(e1);
  const kids2 = childElements(e2);
  const paired = Math.min(kids1.length, kids2.length);
  const maxK = Math.max(kids1.length, kids2.length);

  if (maxK === 0) {
    return {
      structure: 0.35 * attrSim + 0.65,
      attrSum: attrSim,
      attrCount: 1,
    };
  }

  let childStructSum = 0;
  let attrSum = attrSim;
  let attrCount = 1;
  for (let i = 0; i < paired; i++) {
    const sub = compareElements(kids1[i]!, kids2[i]!);
    childStructSum += sub.structure;
    attrSum += sub.attrSum;
    attrCount += sub.attrCount;
  }

  const childStructAvg = paired > 0 ? childStructSum / paired : 1;
  const lenFactor = (2 * paired) / (kids1.length + kids2.length);
  const structure = lenFactor * (0.35 * attrSim + 0.65 * childStructAvg);

  return { structure, attrSum, attrCount };
}

function documentRootElement(doc: Document): Element | null {
  return doc.documentElement;
}

/**
 * Compare two USX documents on **structure** (element tree shape and order), **tag names**, and **attributes**.
 * Text nodes and XML formatting are ignored.
 */
export function compareUsxSimilarity(
  ours: string,
  oracle: string,
  options: CompareUsxOptions = {}
): CompareUsxResult {
  const minScore = options.minScore ?? 0.73;
  const minStruct = options.minStructureSimilarity ?? 0.63;
  const minAttr = options.minAttributeSimilarity ?? 0.56;
  const minTagHist = options.minTagHistogramSimilarity ?? 0.52;

  const messages: string[] = [];

  const docO = parseXml(ours);
  const docT = parseXml(oracle);

  if (!docO || !docT) {
    if (!docO) messages.push('Our USX string could not be parsed as XML.');
    if (!docT) messages.push('Oracle USX string could not be parsed as XML.');
    return {
      ok: false,
      structureSimilarity: 0,
      attributeSimilarity: 0,
      tagHistogramSimilarity: 0,
      score: 0,
      messages,
    };
  }

  const rootO = documentRootElement(docO);
  const rootT = documentRootElement(docT);
  if (!rootO || !rootT) {
    messages.push('Missing document element in one or both USX documents.');
    return {
      ok: false,
      structureSimilarity: 0,
      attributeSimilarity: 0,
      tagHistogramSimilarity: 0,
      score: 0,
      messages,
    };
  }

  const sub = compareElements(rootO, rootT);
  const structureSimilarity = sub.structure;
  const attributeSimilarity = sub.attrCount > 0 ? sub.attrSum / sub.attrCount : 1;

  const tagHistogramSimilarity = histogramCosine(
    countElementTagNamesFromDom(rootO),
    countElementTagNamesFromDom(rootT)
  );

  const score = 0.48 * structureSimilarity + 0.32 * attributeSimilarity + 0.2 * tagHistogramSimilarity;

  if (structureSimilarity < minStruct) {
    messages.push(
      `USX structure similarity ${structureSimilarity.toFixed(3)} below threshold ${minStruct}.`
    );
  }
  if (attributeSimilarity < minAttr) {
    messages.push(
      `USX attribute similarity ${attributeSimilarity.toFixed(3)} below threshold ${minAttr}.`
    );
  }
  if (tagHistogramSimilarity < minTagHist) {
    messages.push(
      `USX tag histogram similarity ${tagHistogramSimilarity.toFixed(3)} below threshold ${minTagHist}.`
    );
  }

  const ok =
    score >= minScore &&
    structureSimilarity >= minStruct &&
    attributeSimilarity >= minAttr &&
    tagHistogramSimilarity >= minTagHist;

  if (!ok) {
    messages.push(`USX combined score ${score.toFixed(3)} (min ${minScore}).`);
  }

  return {
    ok,
    structureSimilarity,
    attributeSimilarity,
    tagHistogramSimilarity,
    score,
    messages,
  };
}
