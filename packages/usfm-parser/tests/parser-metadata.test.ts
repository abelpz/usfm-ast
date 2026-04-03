import { USFMParser, getParserNodeId, getParserSourceSpan } from '../dist';

function findFirst(
  nodes: unknown[] | undefined,
  pred: (n: unknown) => boolean
): unknown | undefined {
  if (!nodes) return undefined;
  for (const n of nodes) {
    if (pred(n)) return n;
    if (n && typeof n === 'object' && Array.isArray((n as { content?: unknown[] }).content)) {
      const hit = findFirst((n as { content: unknown[] }).content, pred);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

function findInEnhancedRoots(roots: unknown[], pred: (n: unknown) => boolean): unknown | undefined {
  return findFirst(roots, pred);
}

describe('parser metadata', () => {
  it('assigns monotonic _nodeId and wires parents after parse', () => {
    const parser = new USFMParser();
    parser.parse('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Hello.');
    const nodes = parser.getNodes();
    expect(nodes.length).toBeGreaterThan(0);
    const ids = nodes.map((n) => getParserNodeId(n)).filter((x): x is number => x !== undefined);
    expect(ids.length).toBe(nodes.length);
    expect(ids[0]).toBeGreaterThan(0);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]!);
    }
    const para = nodes.find((n) => (n as { type?: string }).type === 'para') as
      | { getParent?: () => unknown }
      | undefined;
    expect(para?.getParent?.()).toBeUndefined();
  });

  it('records root _sourceSpan when sourcePositions is enabled', () => {
    const p = new USFMParser({ sourcePositions: true });
    p.parse('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Hi.');
    const nodes = p.getNodes();
    expect(nodes.length).toBeGreaterThan(0);
    const span = getParserSourceSpan(nodes[0]);
    expect(span).toBeDefined();
    expect(span!.end).toBeGreaterThanOrEqual(span!.start);
  });

  it('nested nodes have _nodeId and nested _parent; multiple roots can have spans', () => {
    const p = new USFMParser({ sourcePositions: true });
    p.parse('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 Hello world.');
    const para = findInEnhancedRoots(p.getNodes() as unknown[], (n) => (n as { type?: string }).type === 'para');
    expect(para).toBeDefined();
    expect(getParserNodeId(para)).toBeDefined();

    const verse = findInEnhancedRoots(p.getNodes() as unknown[], (n) => (n as { type?: string }).type === 'verse');
    expect(verse).toBeDefined();
    expect(getParserSourceSpan(verse)).toBeDefined();
    const verseParent = (verse as { getParent?: () => { type?: string } }).getParent?.();
    expect(verseParent?.type).toBe('para');
  });

  it('_nodeId / _parent / _sourceSpan are non-enumerable in JSON', () => {
    const p = new USFMParser({ sourcePositions: true });
    p.parse('\\id TIT Titus\n\\c 1\n\\p\n\\v 1 X.');
    const usj = p.toJSON() as { content?: unknown[] };
    const raw = JSON.stringify(usj);
    expect(raw).not.toContain('_nodeId');
    expect(raw).not.toContain('_parent');
    expect(raw).not.toContain('_sourceSpan');
  });

  it('parseChapter sets book context for sid', () => {
    const p = new USFMParser();
    p.parseChapter('\\c 3\n\\p\n\\v 1 Test.', 'TIT', 3);
    const usj = p.toJSON() as { content?: unknown[] };

    function findVerse(nodes: unknown[] | undefined): { sid?: string } | undefined {
      if (!nodes) return undefined;
      for (const n of nodes) {
        if (typeof n !== 'object' || n === null) continue;
        const o = n as { type?: string; sid?: string; content?: unknown[] };
        if (o.type === 'verse') return o;
        if (Array.isArray(o.content)) {
          const v = findVerse(o.content);
          if (v) return v;
        }
      }
      return undefined;
    }

    const verse = findVerse(usj.content);
    expect(verse?.sid).toBe('TIT 3:1');
  });
});
