export type { USFMRef, NodePath } from './types';
export type { SourceTextProvider } from './source-text-provider';
export type { ChapterSlice } from './chapter-chunker';
export { splitUsjByChapter, ChapterChunker, chapterSliceToUsjDocument } from './chapter-chunker';
export { usfmRefToVerseSid, findVerseInlineNodes } from './verse-ref';
export { stripAlignments, stripArray } from './alignment-layer';
export { appendGatewayText, needsSpaceBetween } from './gateway-text-spacing';
export { reconcileAlignments } from './alignment-reconcile';
export { rebuildAlignedUsj, rebuildArray, emitAlignmentGroup } from './rebuild-aligned';
export {
  tokenizeWords,
  lcsWordIndices,
  lcsWordAlignment,
  normalizeWordForAlignmentMatch,
  alignmentWordSurfacesEqual,
} from './word-diff';
export { diffUsjDocuments } from './document-diff';
export type { Operation, ContentOperation, AlignmentOperation } from './operations';
export { applyOperation, applyOperations, invertOperation } from './operation-engine';
export { composeOps, transformOpLists, invertOps, transformAgainstPrior } from './ot-transform';
export { DocumentStore, type UsjDocument, type DocumentChangeListener } from './document-store';
export type { GitSyncAdapter, MergeResult, Conflict } from './git-sync-adapter';
export { StubGitSyncAdapter } from './git-sync-adapter';
export type { PersistenceAdapter } from './persistence/persistence-adapter';
export { MemoryPersistenceAdapter } from './persistence/memory-adapter';
export { collectVerseTextsFromContent } from './verse-text';
export {
  tokenizeDocument,
  tokenizeTranslationDocument,
  tokenizeOriginalDocument,
  type WordToken,
  type OriginalWordToken,
} from './word-identity';
export {
  parseAlignmentSource,
  setAlignmentSource,
  detectAlignmentState,
  checkSourceCompatibility,
  alignmentSourceKey,
  parseDocumentIdentityFromUsj,
  matchSourceToExistingAlignments,
  originalWordMatchesToken,
  resolveSourceVerseKey,
  type AlignmentSourceRef,
  type AlignmentState,
  type SourceCompatibility,
  type SourceMatchConfidence,
  type SourceMatchResult,
} from './alignment-provenance';
export {
  alignmentDocumentSourceKey,
  serializeAlignmentJson,
  parseAlignmentJson,
  serializeAlignmentTsv,
  parseAlignmentTsv,
  serializeAlignmentText,
  parseAlignmentText,
  createAlignmentDocument,
  withAlignmentVerses,
  splitVerseSid,
} from './alignment-io';
export type {
  SyncEngine,
  SyncResult,
  JournalEntry,
  JournalLayer,
  ChapterConflict,
} from './sync/types';
export { OperationJournal } from './sync/operation-journal';
export { DefaultSyncEngine } from './sync/sync-engine';
export { DcsSyncEngine, type DcsSyncOptions } from './sync/dcs-sync-plugin';
export {
  JournalMergeSyncEngine,
  type JournalRemoteTransport,
  type JournalMergeSyncEngineContext,
  contentOnly,
} from './sync/merge-sync-engine';
export type { MergeStrategy } from './sync/merge-strategy';
export { OTMergeStrategy } from './sync/merge-strategy';
export type { JournalStore } from './sync/journal-store';
export { DefaultJournalStore, MemoryJournalStore, isJournalStore } from './sync/journal-store';
export type { PeerPresence, RealtimeMessage, RealtimeTransport } from './sync/realtime-transport';
export { CompositeRealtimeTransport } from './sync/realtime-transport';
export { BroadcastChannelTransport } from './sync/broadcast-transport';
export { WebSocketRelayTransport } from './sync/websocket-transport';
export { InProcessRelay, InProcessTransport } from './sync/in-process-transport';
export { RealtimeSyncEngine, type RealtimeSyncEngineOptions } from './sync/realtime-sync-engine';
export { AutoSyncScheduler, type AutoSyncOptions } from './sync/auto-sync';
export { filterResolvableConflicts } from './sync/auto-resolve';
export { HeadlessCollabSession, type HeadlessCollabSessionOptions } from './headless-collab-session';
export { runCollabScenario, type CollabScenario } from './cli/collab-harness';
export { AgentOrchestrator, type AgentOrchestratorOptions, type AgentTask } from './agent-orchestrator';
