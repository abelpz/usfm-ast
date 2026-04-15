import type { CheckingCommentsFile, CheckingDecisionsFile } from '@usfm-tools/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseCheckingCommentsFile(json: unknown): CheckingCommentsFile {
  if (!isRecord(json)) throw new Error('comments file: root must be object');
  const book = typeof json.book === 'string' ? json.book.toUpperCase() : '';
  if (!book) throw new Error('comments file: book required');
  const threads = Array.isArray(json.threads) ? (json.threads as CheckingCommentsFile['threads']) : [];
  return { book, threads };
}

export function serializeCheckingCommentsFile(file: CheckingCommentsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseCheckingDecisionsFile(json: unknown): CheckingDecisionsFile {
  if (!isRecord(json)) throw new Error('decisions file: root must be object');
  const book = typeof json.book === 'string' ? json.book.toUpperCase() : '';
  if (!book) throw new Error('decisions file: book required');
  const decisions = Array.isArray(json.decisions) ? (json.decisions as CheckingDecisionsFile['decisions']) : [];
  return { book, decisions };
}

export function serializeCheckingDecisionsFile(file: CheckingDecisionsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
