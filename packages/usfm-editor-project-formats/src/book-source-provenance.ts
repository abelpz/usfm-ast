import type { BookSourceProvenance } from '@usfm-tools/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse one provenance row from SB (`x-source`) or RC (`x_source`) YAML/JSON. */
export function parseBookSourceProvenance(raw: unknown): BookSourceProvenance | null {
  if (!isRecord(raw)) return null;
  const identifier = typeof raw.identifier === 'string' ? raw.identifier.trim() : '';
  const language = typeof raw.language === 'string' ? raw.language.trim() : '';
  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  if (!identifier || !language || !version) return null;
  const commitSha =
    typeof raw.commitSha === 'string'
      ? raw.commitSha.trim()
      : typeof raw.commit_sha === 'string'
        ? raw.commit_sha.trim()
        : undefined;
  const translatedAt =
    typeof raw.translatedAt === 'string'
      ? raw.translatedAt.trim()
      : typeof raw.translated_at === 'string'
        ? raw.translated_at.trim()
        : undefined;
  return {
    identifier,
    language,
    version,
    ...(commitSha ? { commitSha } : {}),
    ...(translatedAt ? { translatedAt } : {}),
  };
}
