import type { ResourceTypeDefinition } from '@usfm-tools/types';

/** Code-level registry for translation helps resource types (TWL, TN, …). */
export class ResourceTypeRegistry {
  private readonly byId = new Map<string, ResourceTypeDefinition>();

  register(def: ResourceTypeDefinition): void {
    this.byId.set(def.id, def);
  }

  get(id: string): ResourceTypeDefinition | undefined {
    return this.byId.get(id);
  }

  list(): ResourceTypeDefinition[] {
    return [...this.byId.values()];
  }

  findBySubject(subject: string): ResourceTypeDefinition | undefined {
    const s = subject.trim().toLowerCase();
    return this.list().find((d) => d.subjects.some((x: string) => x.toLowerCase() === s));
  }
}
