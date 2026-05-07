/**
 * YbinDocProvider — persistent Yjs Y.Doc backed by ProjectStorage.
 *
 * Bridges the CRDT binary state (`crdt/<BOOK>.ybin`) stored in
 * ProjectStorage to a live `Y.Doc` that the editor collab layer can
 * attach to.  For Phase 4 the schema is `Y.Text('usfm')` (full USFM
 * string); a paragraph-level Y.Array schema is planned for Phase 5+.
 *
 * Lifecycle:
 *   1. `YbinDocProvider.load(storage, projectId, usfmPath)`
 *      → reads crdt/*.ybin; falls back to seeding from USFM text.
 *   2. `provider.getDoc()` → the live Y.Doc for attachment.
 *   3. `provider.applyUsfmUpdate(usfm)` → synchronise the Y.Doc when
 *      the OT-based editor saves (bridges current and future stacks).
 *   4. `provider.startPersisting(...)` → debounce-write updates back.
 *   5. `provider.destroy()` → clean up listeners and the Y.Doc.
 *
 * All storage I/O errors are non-fatal (logged but not thrown) so the
 * editor is never blocked by CRDT persistence failures.
 */

import * as Y from 'yjs';
import type { ProjectStorage } from '@usfm-tools/types';
import { crdtPathFromUsfm } from './crdt-paths';

// ---------------------------------------------------------------------------
// Base64 helpers (same as in yjs-codec; kept local to avoid coupling)
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// YbinDocProvider
// ---------------------------------------------------------------------------

export class YbinDocProvider {
  private readonly _doc: Y.Doc;
  private readonly _cleanups: Array<() => void> = [];

  private constructor(doc: Y.Doc) {
    this._doc = doc;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  /**
   * Load a Y.Doc from storage for the given USFM path.
   *
   * Resolution order:
   *   1. Read `crdt/<BOOK>.ybin` and apply stored Yjs V2 state.
   *   2. If absent, read the USFM text and seed a fresh Y.Doc.
   *   3. If neither exists, return an empty Y.Doc.
   */
  static async load(
    storage: ProjectStorage,
    projectId: string,
    usfmPath: string,
  ): Promise<YbinDocProvider> {
    const doc = new Y.Doc();
    const crdtPath = crdtPathFromUsfm(usfmPath);

    try {
      const stored = await storage.readFile(projectId, crdtPath);
      if (stored) {
        Y.applyUpdateV2(doc, base64ToUint8(stored));
        return new YbinDocProvider(doc);
      }
    } catch {
      // Fall through to USFM seed.
    }

    // No .ybin yet — seed from USFM text.
    try {
      const usfm = await storage.readFile(projectId, usfmPath);
      if (usfm) {
        doc.getText('usfm').insert(0, usfm);
      }
    } catch {
      // Empty doc is acceptable.
    }

    return new YbinDocProvider(doc);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** The live Yjs document. Attach awareness / collab providers here. */
  getDoc(): Y.Doc {
    return this._doc;
  }

  /** Current USFM text as stored in the Y.Doc. */
  toUsfm(): string {
    return this._doc.getText('usfm').toString();
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Replace the Y.Doc content with a new USFM string.
   *
   * Called by the current OT-based editor on every autosave to keep the
   * Yjs state in sync.  A no-op when `newUsfm` matches current content.
   *
   * Note: this is a full replace, not a diff-based delta.  Once the
   * editor migrates to Yjs natively (Phase 5+) this method becomes
   * unnecessary — the Y.Doc is the source of truth directly.
   */
  applyUsfmUpdate(newUsfm: string): void {
    const text = this._doc.getText('usfm');
    const current = text.toString();
    if (current === newUsfm) return;
    this._doc.transact(() => {
      text.delete(0, current.length);
      text.insert(0, newUsfm);
    });
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  /**
   * Subscribe to Y.Doc updates and debounce-write the new Yjs state back
   * to `crdt/<BOOK>.ybin` in storage.
   *
   * Returns a cleanup function; call it when the editor view unmounts.
   *
   * @param debounceMs  Time to wait after last update before writing (default 2 s).
   */
  startPersisting(
    storage: ProjectStorage,
    projectId: string,
    usfmPath: string,
    debounceMs = 2000,
  ): () => void {
    const crdtPath = crdtPathFromUsfm(usfmPath);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      try {
        const state = Y.encodeStateAsUpdateV2(this._doc);
        const b64 = uint8ToBase64(state);
        void storage.writeFile(projectId, crdtPath, b64).catch(() => {
          // Non-fatal: next successful edit will retry.
        });
      } catch {
        // Encoding failure — skip this flush.
      }
    };

    const handler = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    };

    this._doc.on('update', handler);

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      this._doc.off('update', handler);
    };

    this._cleanups.push(cleanup);
    return cleanup;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Release all registered cleanup functions and destroy the Y.Doc. */
  destroy(): void {
    for (const fn of this._cleanups) fn();
    this._cleanups.length = 0;
    this._doc.destroy();
  }
}
