/**
 * Word-level tokenizer and LCS-based diff for alignment reconciliation (see `reconcileAlignments`).
 */

/** Split gateway text into words (letters/digits/apostrophe); punctuation stays attached or split by whitespace */
export function tokenizeWords(line: string): string[] {
  return line.trim().split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Longest common subsequence on word arrays: which old/new indices participate in one LCS, and
 * old-index → new-index for matched words.
 */
export function lcsWordAlignment(oldWords: string[], newWords: string[]): {
  oldKept: Set<number>;
  newKept: Set<number>;
  pairing: Map<number, number>;
} {
  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldWords[i] === newWords[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const oldKept = new Set<number>();
  const newKept = new Set<number>();
  const pairing = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldWords[i] === newWords[j]) {
      oldKept.add(i);
      newKept.add(j);
      pairing.set(i, j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { oldKept, newKept, pairing };
}

/** Longest common subsequence on word arrays; returns indices of words in the LCS match */
export function lcsWordIndices(oldWords: string[], newWords: string[]): {
  oldKept: Set<number>;
  newKept: Set<number>;
} {
  const { oldKept, newKept } = lcsWordAlignment(oldWords, newWords);
  return { oldKept, newKept };
}
