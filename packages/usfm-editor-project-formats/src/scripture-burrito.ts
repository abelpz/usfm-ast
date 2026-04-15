/**
 * Scripture Burrito 1.x metadata.json parsing and validation.
 * Extended fields: per-ingredient `x-source`, root `x-activeAlignment`, `x-checkingConfig`.
 * @see https://docs.burrito.bible/en/latest/schema_docs/metadata.html
 */

import type { ActiveAlignmentPointer, BookSourceProvenance, SbCheckingConfig } from '@usfm-tools/types';
import { parseBookSourceProvenance } from './book-source-provenance';

export type SBLocalizedMap = Record<string, string>;

export type SBMeta = {
  version: string;
  category?: string;
  defaultLocale?: string;
  dateCreated?: string;
  normalization?: string;
  generator?: { softwareName?: string; softwareVersion?: string; userName?: string };
};

export type SBIngredient = {
  mimeType?: string;
  size?: number;
  scope?: Record<string, unknown>;
  checksum?: { md5?: string; sha1?: string; sha256?: string };
  /** URL for external large media */
  url?: string;
  role?: string;
  /** Pragmatic SB extension: per-book / per-ingredient source versions used in translation */
  'x-source'?: BookSourceProvenance[];
};

export type SBFlavor = {
  name?: string;
  usfmVersion?: string;
  translationType?: string;
  audience?: string;
  projectType?: string;
  [key: string]: unknown;
};

export type SBFlavorType = {
  name?: string;
  flavor?: SBFlavor;
  currentScope?: Record<string, unknown>;
};

export type SBTypeBlock = {
  flavorType?: SBFlavorType;
};

export type ScriptureBurritoMeta = {
  format: string;
  meta: SBMeta;
  identification?: {
    name?: SBLocalizedMap;
    abbreviation?: SBLocalizedMap;
    description?: SBLocalizedMap;
    primary?: Record<string, Record<string, { revision?: string; timestamp?: string }>>;
  };
  languages?: Array<{ tag?: string; name?: SBLocalizedMap; scriptDirection?: string }>;
  type?: SBTypeBlock;
  ingredients: Record<string, SBIngredient>;
  localizedNames?: Record<string, { abbr?: SBLocalizedMap; short?: SBLocalizedMap; long?: SBLocalizedMap }>;
  copyright?: unknown;
  confidential?: boolean;
  idAuthorities?: Record<string, { id?: string; name?: SBLocalizedMap }>;
  relationships?: unknown;
  /** Pragmatic: which alignment file per book is merged into USFM */
  'x-activeAlignment'?: Record<string, ActiveAlignmentPointer>;
  /** Pragmatic: where checking artifacts live */
  'x-checkingConfig'?: SbCheckingConfig;
  [key: string]: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function expectString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Scripture Burrito: missing or invalid string: ${field}`);
  return v;
}

function parseActiveAlignmentBlock(raw: unknown): Record<string, ActiveAlignmentPointer> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, ActiveAlignmentPointer> = {};
  for (const [bookKey, v] of Object.entries(raw)) {
    if (!isRecord(v)) continue;
    const sourceLanguage =
      typeof v.sourceLanguage === 'string'
        ? v.sourceLanguage
        : typeof v.source_language === 'string'
          ? v.source_language
          : '';
    const path = typeof v.path === 'string' ? v.path : '';
    if (!sourceLanguage.trim() || !path.trim()) continue;
    const bk = bookKey.toUpperCase();
    out[bk] = { sourceLanguage: sourceLanguage.trim(), path: path.trim() };
  }
  return Object.keys(out).length ? out : undefined;
}

function parseCheckingConfigBlock(raw: unknown): SbCheckingConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const path = typeof raw.path === 'string' ? raw.path.trim() : '';
  const stagesFile =
    typeof raw.stagesFile === 'string'
      ? raw.stagesFile.trim()
      : typeof raw.stages_file === 'string'
        ? raw.stages_file.trim()
        : '';
  if (!path || !stagesFile) return undefined;
  return { path, stagesFile };
}

/**
 * Parse and validate `metadata.json` content as Scripture Burrito metadata.
 */
export function parseScriptureBurrito(json: unknown): ScriptureBurritoMeta {
  if (!isRecord(json)) throw new Error('Scripture Burrito: root must be an object');

  const format = expectString(json.format, 'format').toLowerCase();
  if (format !== 'scripture burrito') {
    throw new Error(`Scripture Burrito: unsupported format "${json.format}" (expected "scripture burrito")`);
  }

  if (!isRecord(json.meta)) throw new Error('Scripture Burrito: missing "meta" object');
  const metaVersion = expectString(json.meta.version, 'meta.version');
  const meta: SBMeta = {
    version: metaVersion,
    category: typeof json.meta.category === 'string' ? json.meta.category : undefined,
    defaultLocale: typeof json.meta.defaultLocale === 'string' ? json.meta.defaultLocale : undefined,
    dateCreated: typeof json.meta.dateCreated === 'string' ? json.meta.dateCreated : undefined,
    normalization: typeof json.meta.normalization === 'string' ? json.meta.normalization : undefined,
    generator: isRecord(json.meta.generator)
      ? {
          softwareName: typeof json.meta.generator.softwareName === 'string' ? json.meta.generator.softwareName : undefined,
          softwareVersion:
            typeof json.meta.generator.softwareVersion === 'string' ? json.meta.generator.softwareVersion : undefined,
          userName: typeof json.meta.generator.userName === 'string' ? json.meta.generator.userName : undefined,
        }
      : undefined,
  };

  if (!isRecord(json.ingredients)) throw new Error('Scripture Burrito: missing "ingredients" object');

  const ingredients: Record<string, SBIngredient> = {};
  for (const [path, raw] of Object.entries(json.ingredients)) {
    if (!isRecord(raw)) continue;
    const ing: SBIngredient = {};
    if (typeof raw.mimeType === 'string') ing.mimeType = raw.mimeType;
    if (typeof raw.size === 'number') ing.size = raw.size;
    if (typeof raw.url === 'string') ing.url = raw.url;
    if (typeof raw.role === 'string') ing.role = raw.role;
    if (isRecord(raw.checksum)) {
      ing.checksum = {
        md5: typeof raw.checksum.md5 === 'string' ? raw.checksum.md5 : undefined,
        sha1: typeof raw.checksum.sha1 === 'string' ? raw.checksum.sha1 : undefined,
        sha256: typeof raw.checksum.sha256 === 'string' ? raw.checksum.sha256 : undefined,
      };
    }
    if (isRecord(raw.scope)) ing.scope = raw.scope as Record<string, unknown>;
    const xsource = raw['x-source'];
    if (Array.isArray(xsource)) {
      const parsed = xsource.map(parseBookSourceProvenance).filter((x): x is BookSourceProvenance => x != null);
      if (parsed.length) ing['x-source'] = parsed;
    }
    ingredients[path] = ing;
  }

  const out: ScriptureBurritoMeta = {
    format: json.format as string,
    meta,
    ingredients,
    confidential: typeof json.confidential === 'boolean' ? json.confidential : undefined,
  };

  if (json.identification) out.identification = json.identification as ScriptureBurritoMeta['identification'];
  if (Array.isArray(json.languages)) out.languages = json.languages as ScriptureBurritoMeta['languages'];
  if (json.type) out.type = json.type as SBTypeBlock;
  if (json.localizedNames) out.localizedNames = json.localizedNames as ScriptureBurritoMeta['localizedNames'];
  if (json.copyright !== undefined) out.copyright = json.copyright;
  if (json.idAuthorities) out.idAuthorities = json.idAuthorities as ScriptureBurritoMeta['idAuthorities'];
  if (json.relationships !== undefined) out.relationships = json.relationships;

  const xaa = parseActiveAlignmentBlock(json['x-activeAlignment']);
  if (xaa) out['x-activeAlignment'] = xaa;
  const xcc = parseCheckingConfigBlock(json['x-checkingConfig']);
  if (xcc) out['x-checkingConfig'] = xcc;

  return out;
}

/** Strip optional `NN-` sort prefix (e.g. `57-TIT.usfm` → `TIT`). */
export function bookFromIngredientPath(path: string): string | null {
  const base = path.split('/').pop()?.replace(/\.usfm$/i, '') ?? '';
  const stripped = base.replace(/^\d{1,2}-/i, '');
  const u = stripped.toUpperCase();
  if (/^([1-4][A-Z]{2}|[A-Z]{3})$/.test(u)) return u;
  return null;
}

/** True when ingredient is primary scripture text (USFM). */
export function isSBIngredientUsfm(ing: SBIngredient): boolean {
  const mt = (ing.mimeType ?? '').toLowerCase();
  if (mt.includes('audio') || mt.startsWith('video/')) return false;
  if (mt === 'application/json' && ing.role === 'alignment') return false;
  return mt === 'text/plain' || mt === 'text/usfm' || mt === 'text/x-usfm' || mt === 'text/usfm3' || mt === '';
}

export type SBBookRef = { code: string; name: string; path: string };

/**
 * List scripture books available from ingredients + optional currentScope.
 */
export function listSBBooks(meta: ScriptureBurritoMeta, defaultLocale = 'en'): SBBookRef[] {
  const seen = new Map<string, SBBookRef>();
  const locNames = meta.localizedNames ?? {};

  function displayNameForCode(code: string): string {
    const key = `book-${code.toLowerCase()}`;
    const entry = locNames[key];
    if (entry?.short?.[defaultLocale]) return entry.short[defaultLocale]!;
    if (entry?.long?.[defaultLocale]) return entry.long[defaultLocale]!;
    if (entry?.abbr?.[defaultLocale]) return entry.abbr[defaultLocale]!;
    return code;
  }

  for (const [path, ing] of Object.entries(meta.ingredients)) {
    if (!isSBIngredientUsfm(ing)) continue;
    const codes: string[] = [];
    const scopeKeyOkLocal = /^([1-4][A-Z]{2}|[A-Z]{3})$/i;
    if (ing.scope && typeof ing.scope === 'object') {
      for (const k of Object.keys(ing.scope)) {
        const ku = k.toUpperCase();
        if (scopeKeyOkLocal.test(ku)) codes.push(ku);
      }
    }
    const fromPath = bookFromIngredientPath(path);
    if (codes.length === 0 && fromPath) codes.push(fromPath);
    for (const code of codes) {
      if (!seen.has(code)) {
        seen.set(code, { code, name: displayNameForCode(code), path });
      }
    }
  }

  const scope = meta.type?.flavorType?.currentScope;
  /** USFM book codes: `GEN` … `REV`, or numbered `1SA`, `2TI`, `3JN`. */
  const bookCodeKey = /^([1-4][A-Z]{2}|[A-Z]{3})$/;
  if (isRecord(scope)) {
    for (const k of Object.keys(scope)) {
      const ku = k.toUpperCase();
      if (!bookCodeKey.test(ku)) continue;
      const code = ku;
      if (!seen.has(code)) {
        const path =
          Object.keys(meta.ingredients).find((p) => {
            const ing = meta.ingredients[p]!;
            if (!isSBIngredientUsfm(ing)) return false;
            if (ing.scope && code in ing.scope) return true;
            const fp = bookFromIngredientPath(p);
            return fp === code;
          }) ?? `${code}.usfm`;
        seen.set(code, { code, name: displayNameForCode(code), path });
      }
    }
  }

  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
}
