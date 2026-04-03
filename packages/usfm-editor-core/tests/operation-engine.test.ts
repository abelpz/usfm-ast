import { applyOperation, applyOperations, invertOperation } from '../dist';
import type { Operation } from '../dist';

describe('applyOperation', () => {
  const base: Operation = {
    type: 'insertNode',
    path: { chapter: 1, indices: [0] },
    node: { type: 'para', marker: 'p', content: [] },
  };

  it('inserts at path', () => {
    const content: unknown[] = [];
    applyOperation(content, base);
    expect(content).toHaveLength(1);
  });

  it('removes node', () => {
    const content: unknown[] = ['a', 'b'];
    applyOperation(content, {
      type: 'removeNode',
      path: { chapter: 1, indices: [0] },
    });
    expect(content).toEqual(['b']);
  });

  it('sets text leaf', () => {
    const content: unknown[] = [['x']];
    applyOperation(content, {
      type: 'setText',
      path: { chapter: 1, indices: [0, 0] },
      text: 'y',
    });
    expect(content).toEqual([['y']]);
  });
});

describe('invertOperation', () => {
  it('inverts insertNode to removeNode', () => {
    const op: Operation = {
      type: 'insertNode',
      path: { chapter: 2, indices: [1, 0] },
      node: 'hi',
    };
    expect(invertOperation(op)).toEqual({ type: 'removeNode', path: op.path });
  });

  it('inverts removeNode when removedNode is present', () => {
    const op: Operation = {
      type: 'removeNode',
      path: { chapter: 1, indices: [0] },
      removedNode: { x: 1 },
    };
    expect(invertOperation(op)).toEqual({ type: 'insertNode', path: op.path, node: { x: 1 } });
  });

  it('inverts replaceNode when oldNode is present', () => {
    const op: Operation = {
      type: 'replaceNode',
      path: { chapter: 1, indices: [0] },
      node: { new: true },
      oldNode: { old: true },
    };
    expect(invertOperation(op)).toEqual({
      type: 'replaceNode',
      path: op.path,
      node: { old: true },
      oldNode: { new: true },
    });
  });

  it('inverts setText when oldText is present', () => {
    const op: Operation = {
      type: 'setText',
      path: { chapter: 1, indices: [0] },
      text: 'b',
      oldText: 'a',
    };
    expect(invertOperation(op)).toEqual({
      type: 'setText',
      path: op.path,
      text: 'a',
      oldText: 'b',
    });
  });

  it('inverts setAttr when oldValue is tracked', () => {
    const op: Operation = {
      type: 'setAttr',
      path: { chapter: 1, indices: [0] },
      key: 'k',
      value: 'v2',
      oldValue: 'v1',
    };
    expect(invertOperation(op)).toEqual({
      type: 'setAttr',
      path: op.path,
      key: 'k',
      value: 'v1',
      oldValue: 'v2',
    });
  });

  it('inverts moveNode by swapping paths', () => {
    const op: Operation = {
      type: 'moveNode',
      from: { chapter: 1, indices: [0] },
      to: { chapter: 1, indices: [2] },
    };
    expect(invertOperation(op)).toEqual({
      type: 'moveNode',
      from: { chapter: 1, indices: [2] },
      to: { chapter: 1, indices: [0] },
    });
  });
});

describe('applyOperation extended', () => {
  it('replaceNode, setAttr, moveNode', () => {
    const n = { type: 'para', marker: 'p', content: [{ type: 'text', content: 'a' }] };
    const content: unknown[] = [JSON.parse(JSON.stringify(n))];
    applyOperation(content, {
      type: 'replaceNode',
      path: { chapter: 1, indices: [0] },
      node: { type: 'para', marker: 'p', content: [] },
    });
    expect((content[0] as { content?: unknown[] }).content).toEqual([]);

    const withObj: unknown[] = [{ type: 'book', code: 'TIT', content: [] }];
    applyOperation(withObj, {
      type: 'setAttr',
      path: { chapter: 1, indices: [0] },
      key: 'code',
      value: 'GEN',
    });
    expect((withObj[0] as { code?: string }).code).toBe('GEN');

    const mov: unknown[] = [{ a: 1 }, { b: 2 }];
    applyOperation(mov, {
      type: 'moveNode',
      from: { chapter: 1, indices: [1] },
      to: { chapter: 1, indices: [0] },
    });
    expect(mov).toEqual([{ b: 2 }, { a: 1 }]);
  });

  it('alignment ops are no-ops', () => {
    const content: unknown[] = [];
    applyOperation(content, {
      type: 'alignWord',
      verseRef: 'X 1:1',
      target: { word: 'w', occurrence: 1, occurrences: 1 },
      sources: [],
    });
    expect(content).toHaveLength(0);
  });

  it('applyOperations runs batch', () => {
    const content: unknown[] = ['a', 'b'];
    applyOperations(content, [
      { type: 'removeNode', path: { chapter: 1, indices: [0] } },
      { type: 'insertNode', path: { chapter: 1, indices: [0] }, node: 'z' },
    ]);
    expect(content).toEqual(['z', 'b']);
  });
});
