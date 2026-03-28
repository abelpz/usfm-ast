/**
 * Compare USX XML from our {@link @usfm-tools/adapters} USXVisitor with USX from an oracle
 * (e.g. usfmtc, usfm3). Uses tolerant metrics — not byte equality.
 */

import { diceBigramSimilarity, histogramCosine } from './compareUsj';

export type CompareUsxOptions = {
  /** Minimum combined score (0–1). Default 0.76 (USX varies more than USJ between tools). */
  minScore?: number;
  /** Minimum text-extraction similarity. Default 0.70 */
  minTextSimilarity?: number;
  /** Minimum tag-name histogram cosine. Default 0.55 */
  minTagSimilarity?: number;
};

export type CompareUsxResult = {
  ok: boolean;
  textSimilarity: number;
  tagSimilarity: number;
  score: number;
  messages: string[];
};

/** Strip tags; collapse whitespace — for rough text parity. */
export function extractXmlTextContent(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Count opening/local tag names `<name` or `<ns:name`. */
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

/**
 * Compare two USX documents (full file strings).
 */
export function compareUsxSimilarity(
  ours: string,
  oracle: string,
  options: CompareUsxOptions = {}
): CompareUsxResult {
  const minScore = options.minScore ?? 0.76;
  const minText = options.minTextSimilarity ?? 0.7;
  const minTag = options.minTagSimilarity ?? 0.55;

  const messages: string[] = [];

  const tOurs = extractXmlTextContent(ours);
  const tOracle = extractXmlTextContent(oracle);
  const textSimilarity = diceBigramSimilarity(tOurs, tOracle);
  const tagSimilarity = histogramCosine(countXmlTagNames(ours), countXmlTagNames(oracle));

  const score = 0.58 * textSimilarity + 0.42 * tagSimilarity;

  if (tOracle.length === 0 && tOurs.length > 0) {
    messages.push('Oracle USX has no extractable text; comparison may be unreliable.');
  }

  if (textSimilarity < minText) {
    messages.push(
      `USX text similarity ${textSimilarity.toFixed(3)} below threshold ${minText} (ours ${tOurs.length} chars, oracle ${tOracle.length} chars).`
    );
  }
  if (tagSimilarity < minTag) {
    messages.push(`USX tag histogram similarity ${tagSimilarity.toFixed(3)} below threshold ${minTag}.`);
  }

  const ok = score >= minScore && textSimilarity >= minText && tagSimilarity >= minTag;

  if (!ok) {
    messages.push(`USX combined score ${score.toFixed(3)} (min ${minScore}).`);
  }

  return {
    ok,
    textSimilarity,
    tagSimilarity,
    score,
    messages,
  };
}
