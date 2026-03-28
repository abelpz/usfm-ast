/**
 * Compare USJ JSON from {@link USFMParser} with USJ from an external oracle (e.g. usfmtc)
 * using tolerant metrics — not byte equality.
 */

export type CompareUsjOptions = {
  /** Minimum combined score (0–1) to treat as pass. Default 0.82 */
  minScore?: number;
  /** Minimum text similarity alone. Default 0.78 */
  minTextSimilarity?: number;
  /** Minimum node-type histogram similarity. Default 0.65 */
  minStructureSimilarity?: number;
};

export type CompareUsjResult = {
  ok: boolean;
  textSimilarity: number;
  structureSimilarity: number;
  /** Weighted blend used for `ok` */
  score: number;
  messages: string[];
};

export function flattenTextNodes(value: unknown): string[] {
  const out: string[] = [];

  function walk(n: unknown): void {
    if (n === null || n === undefined) return;
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    if (typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const o = n as Record<string, unknown>;
    const c = o.content;
    if (c === undefined) return;
    if (typeof c === 'string') {
      out.push(c);
      return;
    }
    if (Array.isArray(c)) {
      c.forEach(walk);
    }
  }

  walk(value);
  return out;
}

export function normalizeComparableText(parts: string[]): string {
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Dice coefficient on character bigrams (multisets) — robust to small edits. */
export function diceBigramSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length < 2 && b.length < 2) {
    return a === b ? 1 : 0;
  }
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let sumA = 0;
  let sumB = 0;
  for (const [, va] of A) sumA += va;
  for (const [, vb] of B) sumB += vb;
  for (const [k, va] of A) {
    inter += Math.min(va, B.get(k) ?? 0);
  }
  return sumA + sumB === 0 ? 1 : (2 * inter) / (sumA + sumB);
}

function countNodeTypes(value: unknown): Map<string, number> {
  const counts = new Map<string, number>();

  function walk(n: unknown): void {
    if (n === null || n === undefined) return;
    if (typeof n === 'string') return;
    if (typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const o = n as Record<string, unknown>;
    if (typeof o.type === 'string' && o.type.length > 0) {
      counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
    }
    const c = o.content;
    if (c === undefined) return;
    if (typeof c === 'string') return;
    if (Array.isArray(c)) c.forEach(walk);
  }

  walk(value);
  return counts;
}

/** Cosine similarity of two frequency maps (0–1). */
export function histogramCosine(a: Map<string, number>, b: Map<string, number>): number {
  const keys = new Set([...a.keys(), ...b.keys()]);
  if (keys.size === 0) return 1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of keys) {
    const va = a.get(k) ?? 0;
    const vb = b.get(k) ?? 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 1 : dot / denom;
}

/**
 * Compare two USJ-like JSON values (typically root `{ type: 'USJ', ... }`).
 * Uses flattened text (Dice on bigrams) and node-`type` histogram cosine similarity.
 */
export function compareUsjSimilarity(
  ours: unknown,
  oracle: unknown,
  options: CompareUsjOptions = {}
): CompareUsjResult {
  const minScore = options.minScore ?? 0.82;
  const minText = options.minTextSimilarity ?? 0.78;
  const minStruct = options.minStructureSimilarity ?? 0.65;

  const messages: string[] = [];

  const tOurs = normalizeComparableText(flattenTextNodes(ours));
  const tOracle = normalizeComparableText(flattenTextNodes(oracle));

  const textSimilarity = diceBigramSimilarity(tOurs, tOracle);
  const structureSimilarity = histogramCosine(countNodeTypes(ours), countNodeTypes(oracle));

  const score = 0.62 * textSimilarity + 0.38 * structureSimilarity;

  if (tOracle.length === 0 && tOurs.length > 0) {
    messages.push('Oracle USJ has no extractable text; comparison may be unreliable.');
  }

  if (textSimilarity < minText) {
    messages.push(
      `Text similarity ${textSimilarity.toFixed(3)} below threshold ${minText} (ours ${tOurs.length} chars, oracle ${tOracle.length} chars).`
    );
  }
  if (structureSimilarity < minStruct) {
    messages.push(
      `Structure similarity ${structureSimilarity.toFixed(3)} below threshold ${minStruct}.`
    );
  }

  const ok = score >= minScore && textSimilarity >= minText && structureSimilarity >= minStruct;

  if (!ok) {
    messages.push(`Combined score ${score.toFixed(3)} (min ${minScore}).`);
  }

  return {
    ok,
    textSimilarity,
    structureSimilarity,
    score,
    messages,
  };
}
