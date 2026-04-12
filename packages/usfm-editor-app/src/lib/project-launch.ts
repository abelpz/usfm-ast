import type { DcsStoredTarget } from '@/lib/dcs-storage';

/**
 * Passed via react-router `location.state` when opening `/editor` from the home launcher.
 */
export type ProjectLaunchConfig = {
  initialUsfm: string;
  /**
   * When set, the editor will not replace `initialUsfm` with a fetch from persisted DCS target
   * (direct `/editor` visits still load from DCS when configured).
   */
  skipPersistedDcsInitialFetch?: boolean;
  /** Pre-load reference panel with this USFM (e.g. translate-from-source). */
  sourceReferenceUsfm?: string;
  openReferencePanel?: boolean;
  projectMeta?: {
    name: string;
    bookCode: string;
    source: 'blank' | 'device' | 'dcs' | 'translate' | 'continue';
    recentId?: string;
  };
  /** Optional explicit sync target (usually already in localStorage from DcsModal). */
  dcsTarget?: DcsStoredTarget;
};

export function isProjectLaunchConfig(v: unknown): v is ProjectLaunchConfig {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ProjectLaunchConfig).initialUsfm === 'string'
  );
}
