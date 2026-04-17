/**
 * Built-in {@link SourceTextProvider} implementations for reference/side-by-side panels.
 */

import { parseUsxToUsjDocument } from '@usfm-tools/adapters';
import {
  DocumentStore,
  type SourceTextProvider,
  type UsjDocument,
} from '@usfm-tools/editor-core';

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Decode Gitea Contents API `content` (base64) as UTF-8.
 * Raw `atob()` treats each byte as a Latin-1 code unit, corrupting UTF-8 (mojibake in UI,
 * broken alignment / helps matching).
 */
function decodeBase64Utf8(b64: string): string {
  const cleaned = b64.replace(/\s/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleaned, 'base64').toString('utf8');
  }
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Parse raw text to a USJ document given an inferred format. */
async function parseToUsj(text: string, ext: string): Promise<UsjDocument> {
  if (ext === 'usj' || ext === 'json') {
    return JSON.parse(text) as UsjDocument;
  }
  if (ext === 'usx' || ext === 'xml') {
    return parseUsxToUsjDocument(text) as unknown as UsjDocument;
  }
  const store = new DocumentStore({ silentConsole: true });
  store.loadUSFM(text);
  return store.getFullUSJ();
}

/**
 * Loads a local file as source text. Auto-detects format from the file
 * extension: `.usfm` / `.sfm` / `.txt` → USFM, `.usj` / `.json` → USJ,
 * `.usx` / `.xml` → USX.
 */
export class FileSourceTextProvider implements SourceTextProvider {
  readonly id = 'file';
  readonly displayName: string;

  constructor(private readonly file: File) {
    this.displayName = `File: ${file.name}`;
  }

  async load(): Promise<UsjDocument> {
    const text = await this.file.text();
    return parseToUsj(text, extensionOf(this.file.name));
  }
}

export interface DcsSourceTextOptions {
  baseUrl: string;
  owner: string;
  repo: string;
  filePath: string;
  ref?: string;
  token?: string;
  /** Block text direction when known (overrides inference from repo name). */
  direction?: 'ltr' | 'rtl';
}

/**
 * Extract a BCP 47 language code from a DCS repository name.
 * DCS repos follow the convention `{lang}_{resourceType}`, e.g.:
 *   `es-419_glt` → `es-419`, `en_ult` → `en`, `kbt-bali_tit` → `kbt-bali`.
 */
export function extractLangFromDcsRepo(repo: string): string | undefined {
  const underscoreIdx = repo.indexOf('_');
  if (underscoreIdx <= 0) return undefined;
  const candidate = repo.slice(0, underscoreIdx).toLowerCase();
  // Basic BCP 47 shape: 2–8 primary letters + optional hyphen-subtags
  if (/^[a-z]{2,8}(-[a-z0-9]{1,8})*$/.test(candidate)) return candidate;
  return undefined;
}

/**
 * Fetches a scripture file from a DCS (Door43 Content Service / Gitea)
 * repository via the Gitea Contents API.
 */
export class DcsSourceTextProvider implements SourceTextProvider {
  readonly id = 'dcs';
  readonly displayName: string;
  /** BCP 47 language code inferred from the repository name (e.g. `es-419`). */
  readonly langCode: string | undefined;
  readonly direction?: 'ltr' | 'rtl';

  constructor(private readonly options: DcsSourceTextOptions) {
    const { owner, repo, filePath } = options;
    this.displayName = `DCS: ${owner}/${repo}/${filePath}`;
    this.langCode = extractLangFromDcsRepo(repo);
    if (options.direction) this.direction = options.direction;
  }

  async load(): Promise<UsjDocument> {
    const { baseUrl, owner, repo, filePath, ref = 'master', token } = this.options;
    // Encode each path segment individually so that directory separators (/) are
    // preserved as real path separators in the URL, not encoded as %2F (which
    // causes Gitea to return 404 for files in subdirectories).
    const path = filePath.split('/').map((seg) => encodeURIComponent(seg)).join('/');
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `token ${token}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new Error(`DCS fetch failed: ${resp.status} ${resp.statusText}`);
    }

    interface GiteaContents {
      content?: string;
      encoding?: string;
      name?: string;
    }
    const json = (await resp.json()) as GiteaContents;

    const b64 = json.content ?? '';
    const decoded = decodeBase64Utf8(b64);

    const ext = extensionOf(json.name ?? filePath);
    return parseToUsj(decoded, ext);
  }
}
