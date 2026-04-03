import { validateUsjStructure } from '../src/validate';

describe('validateUsjStructure', () => {
  it('accepts minimal canonical USJ', () => {
    const doc = { type: 'USJ' as const, version: '3.1', content: [] };
    expect(validateUsjStructure(doc)).toEqual({ ok: true });
  });

  it('accepts parser-shaped tree with string leaves', () => {
    const doc = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'book', marker: 'id', code: 'GEN', content: ['Genesis'] },
        {
          type: 'para',
          marker: 'p',
          content: ['In the ', { type: 'char', marker: 'nd', content: ['beginning'] }],
        },
      ],
    };
    expect(validateUsjStructure(doc)).toEqual({ ok: true });
  });

  it('rejects non-object root', () => {
    expect(validateUsjStructure(null).ok).toBe(false);
    expect(validateUsjStructure([]).ok).toBe(false);
    expect(validateUsjStructure('x').ok).toBe(false);
  });

  it('rejects wrong root type / version / content', () => {
    expect(validateUsjStructure({ type: 'book', version: '1', content: [] }).ok).toBe(false);
    expect(validateUsjStructure({ type: 'USJ', version: 3, content: [] }).ok).toBe(false);
    expect(validateUsjStructure({ type: 'USJ', version: '3.1', content: {} }).ok).toBe(false);
  });

  it('rejects object nodes without type', () => {
    const doc = {
      type: 'USJ',
      version: '3.1',
      content: [{ marker: 'p' }],
    };
    const r = validateUsjStructure(doc);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('type'))).toBe(true);
    }
  });
});
