import type { ProjectMeta } from '@usfm-tools/types';
import { blankUsfmForBook } from '@/lib/usfm-project';
import type { ProjectLaunchConfig } from '@/lib/project-launch';

/**
 * Build {@link ProjectLaunchConfig} for opening a local project book in the editor
 * (same shape as the former inline objects on {@link LocalProjectPage}).
 */
export function buildLocalProjectBookLaunch(
  meta: ProjectMeta,
  book: { code: string; name: string },
  overrides?: Partial<ProjectLaunchConfig>,
): ProjectLaunchConfig {
  const usfm = blankUsfmForBook(book.code, book.name);
  return {
    initialUsfm: usfm,
    skipPersistedDcsInitialFetch: true,
    sourceLanguage: meta.sourceRefLanguage ?? undefined,
    openReferencePanel: true,
    localProject: { projectId: meta.id, bookCode: book.code, mode: 'translate' },
    projectMeta: { name: `${meta.name} — ${book.code}`, bookCode: book.code, source: 'local' },
    ...overrides,
  };
}
