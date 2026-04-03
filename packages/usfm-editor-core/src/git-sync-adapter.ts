/**
 * Git-oriented sync boundary (implement with simple-git, isomorphic-git, or server API).
 */

import type { DocumentStore } from './document-store';
import type { Operation } from './operations';

export type MergeResult =
  | { ok: true; merged: DocumentStore; ops: Operation[] }
  | { ok: false; conflicts: Conflict[] };

export type Conflict = {
  chapter: number;
  oursOps: Operation[];
  theirsOps: Operation[];
};

export interface GitSyncAdapter {
  commit(doc: DocumentStore, message: string, ops: Operation[]): Promise<string>;
  checkout(rev: string): Promise<string>;
  diffRevisions(rev1: string, rev2: string): Promise<Operation[]>;
  merge(base: string, ours: string, theirs: string): Promise<MergeResult>;
}

/**
 * Stub adapter for tests and local tooling — does not touch the filesystem.
 */
export class StubGitSyncAdapter implements GitSyncAdapter {
  async commit(_doc: DocumentStore, _message: string, _ops: Operation[]): Promise<string> {
    return '0000000';
  }

  async checkout(rev: string): Promise<string> {
    return rev;
  }

  async diffRevisions(_rev1: string, _rev2: string): Promise<Operation[]> {
    return [];
  }

  async merge(
    _base: string,
    _ours: string,
    _theirs: string
  ): Promise<MergeResult> {
    return { ok: false, conflicts: [] };
  }
}
