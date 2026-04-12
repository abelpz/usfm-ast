import type { Transaction } from 'prosemirror-state';
import type { ScriptureSession } from './scripture-session';

/**
 * Extensibility hooks for scripture editing (sync, tooling, analytics).
 */
export interface ScripturePlugin {
  name: string;
  onLoad?(session: ScriptureSession): void;
  onTransaction?(session: ScriptureSession, tr: Transaction): void;
  onSectionChange?(session: ScriptureSession, prev: SectionId[], next: SectionId[]): void;
  onSerialize?(session: ScriptureSession, format: string, data: unknown): unknown;
  onSync?(session: ScriptureSession, result: import('@usfm-tools/editor-core').SyncResult): void;
  destroy?(): void;
}

/** @see {@link ScriptureSession.getVisibleSections} */
export type SectionId =
  | { type: 'identification' }
  | { type: 'introduction' }
  | { type: 'chapter'; chapter: number };
