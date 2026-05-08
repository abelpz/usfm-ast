import { describe, expect, test } from 'bun:test';
import type { FileConflict } from '@usfm-tools/types';
import {
  conflictChaptersForBook,
  conflictsForBook,
  hasNonUsfmPendingConflicts,
  inferBookCodeFromPath,
} from './file-conflict-helpers';

describe('inferBookCodeFromPath', () => {
  test('parses numbered USFM filename', () => {
    expect(inferBookCodeFromPath('content/65-3JN.usfm')).toBe('3JN');
  });
  test('returns null for manifest', () => {
    expect(inferBookCodeFromPath('manifest.yaml')).toBeNull();
  });
});

describe('conflictsForBook', () => {
  const list: FileConflict[] = [
    {
      conflictId: 'a',
      path: 'content/65-3JN.usfm',
      chapterIndices: [1],
      baseText: '',
      oursText: 'a',
      theirsText: 'b',
    },
    {
      conflictId: 'b',
      path: 'content/41-MAT.usfm',
      chapterIndices: [2],
      baseText: '',
      oursText: 'a',
      theirsText: 'b',
    },
  ];
  test('filters by book code', () => {
    expect(conflictsForBook(list, '3JN')).toHaveLength(1);
    expect(conflictsForBook(list, '3JN')[0]?.path).toContain('3JN');
  });
});

describe('conflictChaptersForBook', () => {
  test('collects positive chapter indices', () => {
    const list: FileConflict[] = [
      {
        conflictId: 'a',
        path: 'content/65-3JN.usfm',
        chapterIndices: [1, 2],
        baseText: '',
        oursText: '',
        theirsText: '',
      },
    ];
    const s = conflictChaptersForBook(list, '3JN');
    expect(s.has(1)).toBe(true);
    expect(s.has(2)).toBe(true);
  });
});

describe('hasNonUsfmPendingConflicts', () => {
  test('true when yaml path present', () => {
    const list: FileConflict[] = [
      {
        conflictId: 'x',
        path: 'manifest.yaml',
        chapterIndices: [],
        baseText: '',
        oursText: '',
        theirsText: '',
      },
    ];
    expect(hasNonUsfmPendingConflicts(list)).toBe(true);
  });
});
