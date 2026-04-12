import type { ChapterConflict, Operation, SyncResult } from '@usfm-tools/editor-core';

import { mountConflictReview } from '../src/conflict-review';

const sampleOp: Operation = {
  type: 'insertNode',
  path: { chapter: 1, indices: [0] },
  node: { kind: 'stub' },
};

function makeConflict(over: Partial<ChapterConflict> = {}): ChapterConflict {
  return {
    chapter: 1,
    layer: 'content',
    localOps: [],
    remoteOps: [],
    ...over,
  };
}

function syncWithConflicts(conflicts: ChapterConflict[]): SyncResult {
  return {
    pushed: 0,
    pulled: 0,
    conflicts,
    status: conflicts.length ? 'conflicts' : 'ok',
  };
}

describe('mountConflictReview', () => {
  it('renders empty state when no conflicts', () => {
    const el = document.createElement('div');
    const dispose = mountConflictReview(el, syncWithConflicts([]));
    expect(el.textContent).toMatch(/No conflicts/i);
    dispose();
    expect(el.innerHTML).toBe('');
  });

  it('renders content conflict and wires Use local', () => {
    const el = document.createElement('div');
    const c = makeConflict({ localOps: [sampleOp], remoteOps: [sampleOp] });
    let side: 'local' | 'remote' | null = null;
    mountConflictReview(el, syncWithConflicts([c]), {
      onResolveContent: (conf, s) => {
        side = s;
        expect(conf.chapter).toBe(1);
      },
    });
    const btn = el.querySelector('.conflict-review__resolve button') as HTMLButtonElement;
    expect(btn?.textContent).toMatch(/local/i);
    btn.click();
    expect(side).toBe('local');
  });

  it('Close invokes onDismiss', () => {
    const el = document.createElement('div');
    let dismissed = false;
    mountConflictReview(el, syncWithConflicts([makeConflict()]), {
      onDismiss: () => {
        dismissed = true;
      },
    });
    (el.querySelector('.conflict-review__close') as HTMLButtonElement).click();
    expect(dismissed).toBe(true);
  });
});
