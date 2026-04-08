import type { AlignmentGroup } from '@usfm-tools/types';
import type { Operation } from '../operations';

export type JournalLayer = 'content' | 'alignment';

export interface JournalEntry {
  id: string;
  userId: string;
  timestamp: number;
  sequence: number;
  vectorClock: Record<string, number>;
  chapter: number;
  layer: JournalLayer;
  operations: Operation[];
  baseSnapshotId: string;
}

export interface ChapterConflict {
  chapter: number;
  layer: JournalLayer;
  localOps: Operation[];
  remoteOps: Operation[];
  localSnapshot?: unknown[];
  remoteSnapshot?: unknown[];
  baseSnapshot?: unknown[];
  localAlignments?: Record<string, AlignmentGroup[]>;
  remoteAlignments?: Record<string, AlignmentGroup[]>;
  baseAlignments?: Record<string, AlignmentGroup[]>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: ChapterConflict[];
  status: 'ok' | 'conflicts' | 'offline' | 'error';
}

export interface SyncEngine {
  readonly isOnline: boolean;
  push(): Promise<SyncResult>;
  pull(): Promise<SyncResult>;
  sync(): Promise<SyncResult>;
  onConnectivityChange(listener: (online: boolean) => void): () => void;
  onRemoteChanges(listener: (entries: JournalEntry[]) => void): () => void;
}
