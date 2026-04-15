import type { CheckingComment, CheckingCommentsFile, CheckingThread } from '@usfm-tools/types';

export function upsertThread(file: CheckingCommentsFile, thread: CheckingThread): CheckingCommentsFile {
  const i = file.threads.findIndex((t) => t.id === thread.id);
  if (i < 0) return { ...file, threads: [...file.threads, thread] };
  const next = [...file.threads];
  next[i] = thread;
  return { ...file, threads: next };
}

export function appendComment(thread: CheckingThread, comment: CheckingComment): CheckingThread {
  return { ...thread, comments: [...thread.comments, comment] };
}

export function newThreadId(prefix = 't'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newCommentId(prefix = 'c'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
