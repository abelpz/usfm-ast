/**
 * Scaffold new enhanced projects for local storage or DCS upload.
 * @see docs/30-project-format.md
 */

import type { EditorProjectFormatKind, RepoLayoutKind } from '@usfm-tools/editor-core';
import {
  enhancedProjectInitialFiles,
  scaffoldRcProject,
} from '@usfm-tools/project-formats';

export type CreateEnhancedSbOptions = {
  languageTag: string;
  title: string;
  bookCodes?: string[];
  alignmentSource?: {
    id: string;
    directory: string;
    language?: string;
    identifier?: string;
    version?: string;
  };
};

export type CreateEnhancedRcOptions = {
  identifier: string;
  languageTag: string;
  title: string;
};

/**
 * Scripture Burrito + enhanced directories (`alignments/`, `checking/`, optional `resources/`).
 */
export function createEnhancedScriptureBurritoProjectFiles(options: CreateEnhancedSbOptions): Record<string, string> {
  return enhancedProjectInitialFiles(options);
}

/** Resource Container + enhanced manifests (flat or ingredients layout in follow-up edits). */
export function createEnhancedResourceContainerProjectFiles(options: CreateEnhancedRcOptions): Record<string, string> {
  return scaffoldRcProject(options);
}

/** Infer launcher discriminant from repo layout + enhanced probe. */
export function resolveEditorProjectFormat(options: {
  repoFormat: 'scripture-burrito' | 'resource-container' | 'raw-usfm';
  enhanced: boolean;
}): { projectFormat: EditorProjectFormatKind; repoLayout?: RepoLayoutKind } {
  if (options.repoFormat === 'raw-usfm') {
    return { projectFormat: 'raw-usfm' };
  }
  if (options.enhanced) {
    return {
      projectFormat: 'enhanced',
      repoLayout: options.repoFormat === 'scripture-burrito' ? 'scripture-burrito' : 'resource-container',
    };
  }
  return { projectFormat: options.repoFormat };
}

export { enhancedProjectInitialFiles, scaffoldRcProject };
