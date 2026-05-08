/**
 * crdt-storage — CRDT-aware ProjectStorage write helper.
 *
 * Whenever a USFM file is written to local storage, the companion
 * `crdt/<BOOK>.ybin` Yjs state is also written so the CRDT history
 * stays synchronised with the canonical text (Phase 4).
 *
 * Phase 7 — incremental updates:
 * When a `.ybin` already exists, `writeFileWithCrdt` applies the new USFM as
 * an incremental Yjs operation rather than replacing the `.ybin` with a fresh
 * genesis state.  This preserves the existing Yjs operation history (client IDs
 * + clocks), which is critical for correct CRDT peer-sync: two devices that
 * both started from the same `.ybin` genesis share those operation IDs, so
 * `diffUpdateV2` relative to the shared base deduplicates correctly on merge.
 *
 * The `.ybin` write is **non-fatal**: if it fails (quota exceeded, storage
 * error, etc.) the USFM write has already succeeded and the CRDT state will be
 * rebuilt on the next write that succeeds.
 */

import type { ProjectStorage } from '@usfm-tools/types';
import {
  crdtPathFromUsfm,
  usfmToYjsBase64,
  updateYjsBase64WithUsfm,
  yjsBase64ToUsfm,
} from '@usfm-tools/editor-adapters';

function isUsfmPath(path: string): boolean {
  const l = path.toLowerCase();
  return l.endsWith('.usfm') || l.endsWith('.sfm');
}

/**
 * Read the CRDT-derived USFM text for a given USFM path.
 *
 * Reads `crdt/<BOOK>.ybin` and decodes it.  Returns `null` when no
 * `.ybin` has been written yet (e.g. first launch before any sync).
 * Use as a consistency check or to seed the editor before the OT
 * journal is available.
 */
export async function readYbinAsUsfm(
  storage: ProjectStorage,
  projectId: string,
  usfmPath: string,
): Promise<string | null> {
  try {
    const crdtPath = crdtPathFromUsfm(usfmPath);
    const base64 = await storage.readFile(projectId, crdtPath);
    if (!base64) return null;
    return yjsBase64ToUsfm(base64);
  } catch {
    return null;
  }
}

/**
 * Write a project file to storage.
 *
 * When the path is a `.usfm` / `.sfm` file, also writes the companion
 * `crdt/<BOOK>.ybin` Yjs base64 state so the CRDT history is kept in
 * sync with the canonical USFM text.
 */
export async function writeFileWithCrdt(
  storage: ProjectStorage,
  projectId: string,
  path: string,
  content: string,
): Promise<void> {
  await storage.writeFile(projectId, path, content);

  if (isUsfmPath(path)) {
    try {
      const crdtPath = crdtPathFromUsfm(path);
      const existing = await storage.readFile(projectId, crdtPath);
      // Incremental update when .ybin exists (preserves genesis client IDs).
      // Genesis creation when .ybin is absent (first write for this file).
      const newYbin = existing
        ? updateYjsBase64WithUsfm(existing, content)
        : usfmToYjsBase64(content);
      await storage.writeFile(projectId, crdtPath, newYbin);
    } catch {
      // Non-fatal: CRDT state is rebuilt on the next successful write.
    }
  }
}
