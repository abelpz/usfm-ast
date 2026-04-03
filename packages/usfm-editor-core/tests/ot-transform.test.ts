import { composeOps, invertOps, transformOpLists } from '../dist';
import type { Operation } from '../dist';

describe('composeOps', () => {
  it('concatenates sequences', () => {
    const a: Operation[] = [
      { type: 'removeNode', path: { chapter: 1, indices: [0] } },
    ];
    const b: Operation[] = [
      { type: 'insertNode', path: { chapter: 1, indices: [0] }, node: 'x' },
    ];
    expect(composeOps(a, b)).toEqual([...a, ...b]);
  });
});

describe('invertOps', () => {
  it('reverses and inverts insert/remove pairs', () => {
    const ops: Operation[] = [
      { type: 'insertNode', path: { chapter: 1, indices: [0] }, node: 'a' },
      { type: 'insertNode', path: { chapter: 1, indices: [1] }, node: 'b' },
    ];
    const inv = invertOps(ops);
    expect(inv).toEqual([
      { type: 'removeNode', path: { chapter: 1, indices: [1] } },
      { type: 'removeNode', path: { chapter: 1, indices: [0] } },
    ]);
  });
});

describe('transformOpLists', () => {
  it('shifts insert index after prior insert at same parent (same chapter)', () => {
    const server: Operation[] = [
      { type: 'insertNode', path: { chapter: 1, indices: [0, 0] }, node: { tag: 'a' } },
    ];
    const client: Operation[] = [
      { type: 'insertNode', path: { chapter: 1, indices: [0, 0] }, node: { tag: 'b' } },
    ];
    const { clientPrime, serverPrime } = transformOpLists(client, server);
    expect(clientPrime[0]).toMatchObject({ type: 'insertNode', path: { chapter: 1, indices: [0, 1] } });
    expect(serverPrime[0]).toMatchObject({ type: 'insertNode', path: { chapter: 1, indices: [0, 1] } });
  });

  it('leaves different-chapter ops unchanged', () => {
    const a: Operation[] = [{ type: 'insertNode', path: { chapter: 1, indices: [0] }, node: 1 }];
    const b: Operation[] = [{ type: 'insertNode', path: { chapter: 2, indices: [0] }, node: 2 }];
    expect(transformOpLists(a, b)).toEqual({ clientPrime: a, serverPrime: b });
  });
});
