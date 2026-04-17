/** One row under `x_extensions.alignments.sources` (RC) */
export interface AlignmentDirectoryEntry {
  identifier: string;
  path: string;
  source_language?: string;
}

/** SB `x-activeAlignment` map value */
export interface ActiveAlignmentPointer {
  sourceLanguage: string;
  path: string;
}

export interface ResourceRef {
  kind: 'tw' | 'tn' | 'tq' | 'ta' | 'scripture' | 'custom';
  owner?: string;
  language?: string;
  resourceId?: string;
  version?: string;
  path?: string;
}

/** SB root extension block (pragmatic) */
export interface SbCheckingConfig {
  path: string;
  stagesFile: string;
}

/** Normalized view for dashboards (filled by `@usfm-tools/project-formats`) */
export interface EnhancedProjectSummary {
  format: 'scripture-burrito' | 'resource-container' | 'raw-usfm';
  identifier?: string;
  title?: string;
  language?: string;
  books: { code: string; name: string; path: string }[];
  alignmentSources: AlignmentDirectoryEntry[];
  activeAlignmentByBook?: Record<string, string>;
  checkingsPath?: string;
  resourcesPath?: string;
  stagesFile?: string;
  /**
   * True when the remote repo already has `alignments/manifest.json` and `checking/manifest.json`.
   * False/undefined when the branch still needs the standard editor folder layout uploaded.
   */
  remoteEnhancedLayout?: boolean;
}

/** RC `x_extensions` block (pragmatic) */
export interface RcXExtensions {
  alignments?: {
    active?: Record<string, string>;
    sources?: AlignmentDirectoryEntry[];
  };
  /** Legacy name; prefer {@link checking} for docs/30-project-format.md layout */
  checkings?: { path: string; stagesFile?: string };
  /** Enhanced project format: `checking/` append-only JSON (plan §RC extensions) */
  checking?: { schema_version?: string; path: string; stagesFile?: string };
  resources?: { path: string };
}
