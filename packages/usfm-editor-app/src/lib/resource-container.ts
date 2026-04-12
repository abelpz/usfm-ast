/**
 * unfoldingWord / Door43 Resource Container manifest.yaml (dublin_core + projects).
 * @see https://git.door43.org/unfoldingWord/en_ult/src/branch/master/manifest.yaml
 */

import yaml from 'js-yaml';

export type RCSourceEntry = {
  identifier?: string;
  language?: string;
  version?: string;
};

export type RCDublinCore = {
  conformsto?: string;
  type?: string;
  format?: string;
  identifier?: string;
  title?: string;
  description?: string;
  language?: { identifier?: string; title?: string; direction?: string };
  version?: string;
  creator?: string;
  rights?: string;
  issued?: string;
  modified?: string;
  source?: RCSourceEntry[];
  relation?: string[];
};

export type RCProject = {
  title?: string;
  versification?: string;
  identifier?: string;
  sort?: number;
  path?: string;
  categories?: string[];
};

export type ResourceContainerManifest = {
  dublin_core?: RCDublinCore;
  checking?: { checking_entity?: string[]; checking_level?: string };
  projects?: RCProject[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseResourceContainer(yamlString: string): ResourceContainerManifest {
  const doc = yaml.load(yamlString, { json: true });
  if (!isRecord(doc)) throw new Error('Resource Container: manifest root must be a mapping');
  const out: ResourceContainerManifest = {};

  if (doc.dublin_core !== undefined) {
    if (!isRecord(doc.dublin_core)) throw new Error('Resource Container: dublin_core must be an object');
    out.dublin_core = doc.dublin_core as RCDublinCore;
  }

  if (doc.checking !== undefined) {
    if (!isRecord(doc.checking)) throw new Error('Resource Container: checking must be an object');
    out.checking = {
      checking_entity: Array.isArray(doc.checking.checking_entity)
        ? (doc.checking.checking_entity as string[]).filter((x) => typeof x === 'string')
        : undefined,
      checking_level:
        typeof doc.checking.checking_level === 'string' ? doc.checking.checking_level : undefined,
    };
  }

  if (doc.projects !== undefined) {
    if (!Array.isArray(doc.projects)) throw new Error('Resource Container: projects must be a list');
    out.projects = doc.projects.filter(isRecord) as RCProject[];
  }

  return out;
}

export type RCBookRef = { code: string; name: string; path: string; sort: number };

/**
 * Scripture USFM projects from manifest `projects` (paths like `./57-TIT.usfm`).
 */
export function listRCBooks(manifest: ResourceContainerManifest): RCBookRef[] {
  const projects = manifest.projects ?? [];
  const list: RCBookRef[] = [];
  for (const p of projects) {
    const path = typeof p.path === 'string' ? p.path.replace(/^\.\//, '') : '';
    if (!path.toLowerCase().endsWith('.usfm')) continue;
    const id = (p.identifier ?? '').trim().toUpperCase();
    if (!id) continue;
    const name = typeof p.title === 'string' ? p.title : id;
    const sort = typeof p.sort === 'number' ? p.sort : 9999;
    list.push({ code: id, name, path, sort });
  }
  list.sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  return list;
}
