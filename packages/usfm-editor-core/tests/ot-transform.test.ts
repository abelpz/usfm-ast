import { applyOperations, composeOps, invertOps, transformOpLists } from '../dist';
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
    const { clientPrime, serverPrime } = transformOpLists(a, b);
    expect(clientPrime).toEqual(a);
    expect(serverPrime).toEqual(b);
  });

  it('rebases concurrent setText at same path (remote applied first)', () => {
    const server: Operation[] = [
      { type: 'setText', path: { chapter: 1, indices: [0, 0] }, text: 'world', oldText: 'hello' },
    ];
    const client: Operation[] = [
      { type: 'setText', path: { chapter: 1, indices: [0, 0] }, text: 'both', oldText: 'hello' },
    ];
    const { clientPrime, serverPrime } = transformOpLists(client, server);
    expect(serverPrime[0]).toMatchObject({ text: 'world' });
    expect(clientPrime[0]).toMatchObject({ text: 'both', oldText: 'world' });
  });

  it('drops client replaceNode when server replaceNode wins at same path', () => {
    const server: Operation[] = [
      { type: 'replaceNode', path: { chapter: 1, indices: [0] }, node: { tag: 'p', x: 1 } },
    ];
    const client: Operation[] = [
      { type: 'replaceNode', path: { chapter: 1, indices: [0] }, node: { tag: 'p', x: 2 } },
    ];
    const { clientPrime } = transformOpLists(client, server);
    expect(clientPrime.length).toBe(0);
  });

  it('convergence: server then clientPrime vs client then serverPrime yields same document', () => {
    // Minimal tree: root array → one row array → two leaf strings (indices [0,0] and [0,1])
    const base: unknown[] = [['hello', 'bye']];
    const server: Operation[] = [
      { type: 'setText', path: { chapter: 1, indices: [0, 0] }, text: 'S', oldText: 'hello' },
    ];
    const client: Operation[] = [
      { type: 'setText', path: { chapter: 1, indices: [0, 1] }, text: 'C', oldText: 'bye' },
    ];
    const { clientPrime, serverPrime } = transformOpLists(client, server);

    const docA = JSON.parse(JSON.stringify(base)) as unknown[];
    applyOperations(docA as unknown[], server);
    applyOperations(docA as unknown[], clientPrime);

    const docB = JSON.parse(JSON.stringify(base)) as unknown[];
    applyOperations(docB as unknown[], client);
    applyOperations(docB as unknown[], serverPrime);

    expect(docA).toEqual(docB);
  });
});
