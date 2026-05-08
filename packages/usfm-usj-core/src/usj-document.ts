/** Minimal USJ document shape used across read-only views, chunking, and alignment stripping. */
export type UsjDocument = { type: 'USJ'; version: string; content: unknown[] };
