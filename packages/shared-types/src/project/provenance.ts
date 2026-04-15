/** One source used when translating a book */
export interface BookSourceProvenance {
  identifier: string;
  language: string;
  version: string;
  commitSha?: string;
  translatedAt?: string;
}

export interface ProjectSourceSummary {
  /** Book code → list of recorded sources */
  byBook: Record<string, BookSourceProvenance[]>;
  /** Books where recorded version differs from `latestKnown` (if provided) */
  outdatedBooks?: string[];
}
