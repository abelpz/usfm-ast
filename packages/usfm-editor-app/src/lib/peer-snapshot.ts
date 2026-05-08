/**
 * peer-snapshot — file-based peer-to-peer project sync (Phase 7).
 *
 * Two devices can exchange project state without any server — just a file.
 * Device A calls `exportPeerSnapshot`; shares the file (USB, email, AirDrop…);
 * Device B calls `importPeerSnapshot`.  Under the hood this is the same
 * `.bible.project.zip` format used by the regular bundle flow, augmented with
 * `crdt/*.ybin` CRDT state files that enable a server-free 3-way CRDT merge.
 *
 * ### Why CRDT makes no-server merge work
 *
 * Every USFM write (via `writeFileWithCrdt`) maintains a companion Yjs state
 * that accumulates the full edit history as Yjs operations tagged with a
 * per-device client ID + logical clock.  When Device B imports Device A's
 * snapshot:
 *
 *   - Both `.ybin` files share the same genesis operations (from the common
 *     DCS sync or initial bundle that both devices imported).
 *   - `mergeProjectMaps` (Phase 7 extension) uses the CRDT 3-way merge with
 *     an empty base when no shared ancestor is known.  Yjs deduplicates the
 *     shared genesis operations automatically via (clientID, clock) and merges
 *     only the divergent edits from each device.
 *   - The result is deterministic and conflict-free at the CRDT level.
 *
 * ### Limitations
 *
 * - Peer sync works best when both devices originally imported from the SAME
 *   DCS commit or bundle (shared `.ybin` genesis).  Devices whose `.ybin` was
 *   created independently from the same USFM text (different genesis) fall back
 *   to OT merge automatically.
 * - Local bookkeeping files (`.sync/`, `journal/`) are intentionally excluded
 *   from the snapshot — each device keeps its own sync state.
 * - For real-time sync between devices on the same network, see Phase 8
 *   (WebRTC / LAN transport).
 */

import type { ProjectStorage } from '@usfm-tools/types';
import {
  exportProjectBundle,
  importProjectBundle,
  bibleProjectZipDownloadBasename,
  type ImportProjectBundleResult,
} from './project-bundle';

export type PeerSnapshotExportOptions = {
  storage: ProjectStorage;
  projectId: string;
  /** Display name used for the suggested download filename. */
  displayName: string;
};

export type PeerSnapshotImportOptions = {
  storage: ProjectStorage;
  projectId: string;
  /** The `.bible.project.zip` file received from the peer device. */
  file: File | Blob;
};

/**
 * Export the current project state (USFM + CRDT `.ybin` companions) as a
 * `.bible.project.zip` blob ready for sharing with another device.
 *
 * Returns both the blob and the suggested filename for `<a download>`.
 */
export async function exportPeerSnapshot(
  opts: PeerSnapshotExportOptions,
): Promise<{ blob: Blob; filename: string }> {
  const blob = await exportProjectBundle({
    storage: opts.storage,
    projectId: opts.projectId,
  });
  const filename = bibleProjectZipDownloadBasename(opts.displayName, opts.projectId);
  return { blob, filename };
}

/**
 * Import a peer snapshot received from another device.
 *
 * Always uses merge mode (`enableMerge: true`) so local edits are not silently
 * overwritten.  The CRDT-first merge path in `mergeProjectMaps` (Phase 7)
 * handles the no-shared-base case automatically when `.ybin` companions are
 * present in both the snapshot and local storage.
 *
 * Returns the standard `ImportProjectBundleResult` — check `conflicts` to see
 * whether any files need manual resolution.
 */
export async function importPeerSnapshot(
  opts: PeerSnapshotImportOptions,
): Promise<ImportProjectBundleResult> {
  return importProjectBundle({
    storage: opts.storage,
    projectId: opts.projectId,
    blob: opts.file,
    enableMerge: true,
  });
}

/**
 * Trigger a browser download of the peer snapshot blob.
 * Returns the object URL (caller can revoke after the download is initiated).
 */
export function downloadPeerSnapshot(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return url;
}
