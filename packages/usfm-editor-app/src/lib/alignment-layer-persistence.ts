/**
 * Alignment layer persistence helpers.
 *
 * Invariant:
 *   - The book USFM always embeds the **active** alignment layer (handled by `session.toUSFM()`).
 *   - Every non-embedded layer is additionally stored as a sidecar JSON at
 *     `alignments/{langFolder}/{BOOK}.alignment.json`.
 *   - `manifest.yaml` keeps `x_extensions.alignments.sources` + `active[bookCode]` in sync.
 *
 * Layout: `alignments/<sourceId-derived-folder>/<BOOK>.alignment.json`
 * e.g.   `alignments/el-x-koine/GEN.alignment.json`
 */

import type { ScriptureSession } from '@usfm-tools/editor';
import { serializeAlignmentJson } from '@usfm-tools/editor-core';
import { alignmentDocumentSourceKey } from '@usfm-tools/editor-core';
import type { ProjectStorage } from '@usfm-tools/types';
import { parseResourceContainer, serializeResourceContainer } from '@usfm-tools/project-formats';
import type { AlignmentDirectoryEntry } from '@usfm-tools/types';

const EMBEDDED_KEY = '__embedded__';
const ALIGNMENTS_DIR = 'alignments';

/**
 * Derive a filesystem-safe folder name from an alignment document source key.
 * The key format is typically `source.id[@version]`, e.g. `el-x-koine/ugnt@85`.
 * We take the part before `@` and replace `/` with `_` for nesting.
 */
export function alignmentLangFolderFromKey(key: string): string {
  const baseKey = key.split('@')[0] ?? key;
  // Use the first path segment as the language folder if the id contains slashes.
  const parts = baseKey.split('/');
  // Prefer the language code portion (first segment if BCP-47-ish, else "other")
  const folder = parts[0]?.trim().replace(/[^a-zA-Z0-9_.-]/g, '_') || 'other';
  return folder;
}

/** Canonical path for an alignment sidecar file. */
export function alignmentFilePath(bookCode: string, langFolder: string): string {
  return `${ALIGNMENTS_DIR}/${langFolder}/${bookCode}.alignment.json`;
}

/**
 * Write all non-embedded alignment layers to disk and update the manifest.
 * Called from EditorPage's autosave effect after the main book USFM is saved.
 */
export async function syncAlignmentsToProject(opts: {
  storage: ProjectStorage;
  projectId: string;
  bookCode: string;
  session: ScriptureSession;
}): Promise<void> {
  const { storage, projectId, bookCode, session } = opts;

  const docs = session.getAlignmentDocuments();
  const activeKey = session.getActiveAlignmentDocumentKey();

  // Track which paths we write so we can clean up orphans
  const writtenPaths = new Set<string>();
  const newSources: AlignmentDirectoryEntry[] = [];

  for (const doc of docs) {
    const key = alignmentDocumentSourceKey(doc);
    if (key === EMBEDDED_KEY) continue; // embedded layer lives in the USFM file

    const langFolder = alignmentLangFolderFromKey(key);
    const filePath = alignmentFilePath(bookCode, langFolder);
    writtenPaths.add(filePath);

    try {
      const json = serializeAlignmentJson(doc);
      await storage.writeFile(projectId, filePath, json);
    } catch (err) {
      console.warn(`[alignment-layer-persistence] failed to write ${filePath}:`, err);
    }

    newSources.push({
      identifier: key,
      path: `./${filePath}`,
      source_language: langFolder,
    });
  }

  // Remove orphan alignment files that no longer correspond to any loaded layer
  try {
    const existingAlignmentFiles = await storage.listFiles(projectId, ALIGNMENTS_DIR + '/');
    for (const existingPath of existingAlignmentFiles) {
      if (
        existingPath.endsWith('.alignment.json') &&
        existingPath.includes(`/${bookCode}.alignment.json`) &&
        !writtenPaths.has(existingPath)
      ) {
        try {
          await storage.deleteFile(projectId, existingPath);
        } catch {
          // Non-critical
        }
      }
    }
  } catch {
    // listFiles may not be implemented on all storage backends — skip cleanup
  }

  // Update manifest
  try {
    const manifestText = await storage.readFile(projectId, 'manifest.yaml');
    if (!manifestText) return;
    const manifest = parseResourceContainer(manifestText);

    // Merge with existing sources for OTHER books (don't clobber them)
    const prevSources = manifest.x_extensions?.alignments?.sources ?? [];
    const otherBookSources = prevSources.filter((s) => {
      const p = s.path.replace(/^\.\//, '');
      return !p.includes(`/${bookCode}.alignment.json`);
    });
    const mergedSources = [...otherBookSources, ...newSources];

    const prevActive = manifest.x_extensions?.alignments?.active ?? {};
    const nextActive = { ...prevActive };
    // Only record active if it's a real layer key (not embedded)
    if (activeKey && activeKey !== EMBEDDED_KEY) {
      nextActive[bookCode] = activeKey;
    } else {
      delete nextActive[bookCode];
    }

    manifest.x_extensions = {
      ...(manifest.x_extensions ?? {}),
      alignments: {
        sources: mergedSources,
        active: nextActive,
      },
    };

    const updatedYaml = serializeResourceContainer(manifest);
    await storage.writeFile(projectId, 'manifest.yaml', updatedYaml);
  } catch (err) {
    console.warn('[alignment-layer-persistence] failed to update manifest:', err);
  }
}

/**
 * Load all alignment sidecar files for a given book from the project storage
 * and register them with the session. Also restores the active layer from the manifest.
 *
 * Call this after `session.loadUSFM(...)` completes on project open.
 */
export async function loadAlignmentLayersForBook(opts: {
  storage: ProjectStorage;
  projectId: string;
  bookCode: string;
  session: ScriptureSession;
}): Promise<void> {
  const { storage, projectId, bookCode, session } = opts;

  // Load alignment sidecar files matching this book
  let alignmentFiles: string[] = [];
  try {
    alignmentFiles = await storage.listFiles(projectId, ALIGNMENTS_DIR + '/');
  } catch {
    return; // Storage doesn't support listFiles
  }

  const pattern = `/${bookCode}.alignment.json`;
  for (const filePath of alignmentFiles) {
    if (!filePath.toLowerCase().endsWith(pattern.toLowerCase())) continue;
    try {
      const json = await storage.readFile(projectId, filePath);
      if (json) {
        session.loadAlignmentDocumentFromJson(json);
      }
    } catch (err) {
      console.warn(`[alignment-layer-persistence] failed to load ${filePath}:`, err);
    }
  }

  // Restore active layer from manifest
  try {
    const manifestText = await storage.readFile(projectId, 'manifest.yaml');
    if (!manifestText) return;
    const manifest = parseResourceContainer(manifestText);
    const activeKey = manifest.x_extensions?.alignments?.active?.[bookCode];
    if (activeKey) {
      session.setActiveAlignmentDocumentKey(activeKey);
    }
  } catch {
    // Manifest may be missing or malformed — silently skip
  }
}
