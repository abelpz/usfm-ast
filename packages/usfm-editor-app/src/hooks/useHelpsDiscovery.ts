import {
  DEFAULT_CATALOG_TOPIC,
  fetchCatalogSourceEntry,
  type CatalogEntry,
  searchCatalogSources,
} from '@/dcs-client';
import { DEFAULT_HELPS_CONFIG, type HelpsResourceConfig } from '@/lib/helps-config-storage';
import { useEffect, useMemo, useState } from 'react';

/** Door43 catalog `subject` for TSV Translation Notes (matches tc-study). */
export const CATALOG_SUBJECT_TN = 'TSV Translation Notes';
/** Door43 catalog `subject` for TSV Translation Words Links. */
export const CATALOG_SUBJECT_TWL = 'TSV Translation Words Links';
export const CATALOG_SUBJECT_TW = 'Translation Words';
export const CATALOG_SUBJECT_TA = 'Translation Academy';

function subjectMatches(entry: CatalogEntry, expected: string): boolean {
  const s = entry.subject.trim();
  return s === expected || s.includes(expected);
}

function pickEntry(entries: CatalogEntry[], expectedSubject: string): CatalogEntry | undefined {
  return entries.find((e) => subjectMatches(e, expectedSubject));
}

/** Prefer ingredient path `twl_JON.tsv` / `tn_JON.tsv` for the book; else first matching prefix. */
function resolveTsvPath(entry: CatalogEntry, kind: 'twl' | 'tn', bookUpper: string): string | null {
  const bc = bookUpper.toUpperCase();
  const tsvs = entry.ingredients.filter((i) => /\.tsv$/i.test(i.path.replace(/^\.\//, '')));
  const exact = new RegExp(`(^|/)${kind}[_-]${bc}\\.tsv$`, 'i');
  for (const ing of tsvs) {
    const p = ing.path.replace(/^\.\//, '');
    if (exact.test(p)) return p;
  }
  const loose = new RegExp(`${kind}[_-]${bc}\\.tsv$`, 'i');
  for (const ing of tsvs) {
    const p = ing.path.replace(/^\.\//, '');
    if (loose.test(p)) return p;
  }
  return `${kind}_${bc}.tsv`;
}

async function ensureHydrated(host: string, entry: CatalogEntry): Promise<CatalogEntry> {
  if (entry.ingredients.length > 0) return entry;
  const full = await fetchCatalogSourceEntry({
    host,
    owner: entry.ownerLogin,
    repo: entry.repoName,
    tag: entry.releaseTag,
  });
  return full ?? entry;
}

function entryToArticleRepos(entry: CatalogEntry | undefined): { twOwner: string; twRepo: string; twRef: string } | null {
  if (!entry) return null;
  return {
    twOwner: entry.ownerLogin,
    twRepo: entry.repoName,
    twRef: entry.releaseTag,
  };
}

function entryToTaRepos(entry: CatalogEntry | undefined): { taOwner: string; taRepo: string; taRef: string } | null {
  if (!entry) return null;
  return {
    taOwner: entry.ownerLogin,
    taRepo: entry.repoName,
    taRef: entry.releaseTag,
  };
}

export type HelpsDiscoveryState = {
  /** Resolved helps config when discovery succeeds; null while idle / no language. */
  config: HelpsResourceConfig | null;
  loading: boolean;
  error: string | null;
  /** Raw catalog rows used (for debugging / UI). */
  catalogEntries: CatalogEntry[];
};

/**
 * When `sourceLanguage` and `bookCode` are set, search Door43 catalog (tc-ready) for TN/TWL
 * and optional TW/TA article repos for the same language, then build {@link HelpsResourceConfig}.
 */
export function useHelpsDiscovery(options: {
  host?: string;
  /** e.g. es-419 from translate wizard */
  sourceLanguage: string | undefined;
  /** USFM book code from reference or target */
  bookCode: string | null;
  /** When false, skip discovery (manual helps only). */
  autoDiscover: boolean;
}): HelpsDiscoveryState {
  const host = options.host?.trim() || DEFAULT_HELPS_CONFIG.host;
  const lang = options.sourceLanguage?.trim() ?? '';
  const book = options.bookCode?.trim().toUpperCase() ?? '';
  const auto = options.autoDiscover;

  const [config, setConfig] = useState<HelpsResourceConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);

  const depsKey = useMemo(
    () => [auto ? '1' : '0', host, lang, book].join('|'),
    [auto, host, lang, book],
  );

  useEffect(() => {
    if (!auto || !lang || !book) {
      setConfig(null);
      setCatalogEntries([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setConfig(null);
    setCatalogEntries([]);

    void (async () => {
      try {
        const [tnRows, twlRows, twCatalogRows, taCatalogRows] = await Promise.all([
          searchCatalogSources({ host, lang, topic: DEFAULT_CATALOG_TOPIC, subject: CATALOG_SUBJECT_TN }),
          searchCatalogSources({ host, lang, topic: DEFAULT_CATALOG_TOPIC, subject: CATALOG_SUBJECT_TWL }),
          searchCatalogSources({ host, lang, topic: DEFAULT_CATALOG_TOPIC, subject: CATALOG_SUBJECT_TW }),
          searchCatalogSources({ host, lang, topic: DEFAULT_CATALOG_TOPIC, subject: CATALOG_SUBJECT_TA }),
        ]);
        if (cancelled) return;

        const merged = [...tnRows, ...twlRows, ...twCatalogRows, ...taCatalogRows];
        const seen = new Set<string>();
        const uniq: CatalogEntry[] = [];
        for (const e of merged) {
          const k = `${e.fullName}@${e.releaseTag}`;
          if (seen.has(k)) continue;
          seen.add(k);
          uniq.push(e);
        }
        setCatalogEntries(uniq);

        const tnEntryRaw = pickEntry(tnRows, CATALOG_SUBJECT_TN) ?? tnRows[0];
        const twlEntryRaw = pickEntry(twlRows, CATALOG_SUBJECT_TWL) ?? twlRows[0];
        const twArticleEntry = pickEntry(twCatalogRows, CATALOG_SUBJECT_TW) ?? twCatalogRows[0];
        const taArticleEntry = pickEntry(taCatalogRows, CATALOG_SUBJECT_TA) ?? taCatalogRows[0];

        const tnEntry = tnEntryRaw ? await ensureHydrated(host, tnEntryRaw) : undefined;
        const twlEntry = twlEntryRaw ? await ensureHydrated(host, twlEntryRaw) : undefined;
        if (cancelled) return;

        const twRepos = entryToArticleRepos(twArticleEntry);
        const taRepos = entryToTaRepos(taArticleEntry);

        const twlPath = twlEntry ? resolveTsvPath(twlEntry, 'twl', book) : null;
        const tnPath = tnEntry ? resolveTsvPath(tnEntry, 'tn', book) : null;

        const hasTwl = Boolean(twlEntry && twlPath);
        const hasTn = Boolean(tnEntry && tnPath);
        if (!hasTwl && !hasTn) {
          setError('No published TSV Translation Notes or Translation Words Links found for this language in the catalog.');
          setConfig(null);
          return;
        }

        const next: HelpsResourceConfig = {
          ...DEFAULT_HELPS_CONFIG,
          enabled: true,
          host,
          twlOwner: twlEntry?.ownerLogin ?? '',
          twlRepo: twlEntry?.repoName ?? '',
          twlRef: twlEntry?.releaseTag ?? '',
          twlPathTpl: twlPath ?? `twl_${book}.tsv`,
          tnOwner: tnEntry?.ownerLogin ?? '',
          tnRepo: tnEntry?.repoName ?? '',
          tnRef: tnEntry?.releaseTag ?? '',
          tnPathTpl: tnPath ?? `tn_${book}.tsv`,
          twArticleOwner: twRepos?.twOwner ?? DEFAULT_HELPS_CONFIG.twArticleOwner,
          twArticleRepo: twRepos?.twRepo ?? DEFAULT_HELPS_CONFIG.twArticleRepo,
          twArticleRef: twRepos?.twRef ?? DEFAULT_HELPS_CONFIG.twArticleRef,
          taArticleOwner: taRepos?.taOwner ?? DEFAULT_HELPS_CONFIG.taArticleOwner,
          taArticleRepo: taRepos?.taRepo ?? DEFAULT_HELPS_CONFIG.taArticleRepo,
          taArticleRef: taRepos?.taRef ?? DEFAULT_HELPS_CONFIG.taArticleRef,
        };

        setConfig(next);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setConfig(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [depsKey, host, lang, book, auto]);

  return { config, loading, error, catalogEntries };
}
