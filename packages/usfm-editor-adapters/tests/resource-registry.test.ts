/**
 * Tests for ResourceTypeRegistry.
 */
import { ResourceTypeRegistry } from '../src/helps/resource-registry';
import type { ResourceTypeDefinition } from '@usfm-tools/types';

class StubLoader {
  async loadContent(_key: string, _book: string) { return []; }
}

function makeDef(id: string, subjects: string[]): ResourceTypeDefinition {
  return {
    id,
    displayName: id.toUpperCase(),
    subjects,
    loader: StubLoader as unknown as ResourceTypeDefinition['loader'],
  };
}

describe('ResourceTypeRegistry', () => {
  it('registers a definition and retrieves it by id', () => {
    const registry = new ResourceTypeRegistry();
    const def = makeDef('tn', ['Translation Notes']);
    registry.register(def);
    expect(registry.get('tn')).toBe(def);
  });

  it('returns undefined for unknown id', () => {
    const registry = new ResourceTypeRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('list returns all registered definitions', () => {
    const registry = new ResourceTypeRegistry();
    const tn = makeDef('tn', ['Translation Notes']);
    const twl = makeDef('twl', ['Translation Words List']);
    registry.register(tn);
    registry.register(twl);
    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(tn);
    expect(list).toContain(twl);
  });

  it('list returns empty array when nothing is registered', () => {
    const registry = new ResourceTypeRegistry();
    expect(registry.list()).toEqual([]);
  });

  it('register overwrites an existing definition with the same id', () => {
    const registry = new ResourceTypeRegistry();
    const first = makeDef('tn', ['Translation Notes']);
    const second = makeDef('tn', ['Translation Notes', 'TN']);
    registry.register(first);
    registry.register(second);
    expect(registry.get('tn')).toBe(second);
    expect(registry.list()).toHaveLength(1);
  });

  describe('findBySubject', () => {
    it('finds a definition by exact subject (case-insensitive)', () => {
      const registry = new ResourceTypeRegistry();
      const tn = makeDef('tn', ['Translation Notes']);
      registry.register(tn);
      expect(registry.findBySubject('Translation Notes')).toBe(tn);
      expect(registry.findBySubject('translation notes')).toBe(tn);
      expect(registry.findBySubject('TRANSLATION NOTES')).toBe(tn);
    });

    it('returns undefined when no subject matches', () => {
      const registry = new ResourceTypeRegistry();
      registry.register(makeDef('tn', ['Translation Notes']));
      expect(registry.findBySubject('Bible')).toBeUndefined();
    });

    it('matches against any of multiple subjects', () => {
      const registry = new ResourceTypeRegistry();
      const def = makeDef('bible', ['Aligned Bible', 'Bible']);
      registry.register(def);
      expect(registry.findBySubject('Aligned Bible')).toBe(def);
      expect(registry.findBySubject('Bible')).toBe(def);
    });

    it('trims whitespace from the query', () => {
      const registry = new ResourceTypeRegistry();
      const def = makeDef('tn', ['Translation Notes']);
      registry.register(def);
      expect(registry.findBySubject('  Translation Notes  ')).toBe(def);
    });
  });
});
