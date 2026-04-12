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
}

/**
 * Fetches a scripture file from a DCS (Door43 Content Service / Gitea)
 * repository via the Gitea Contents API.
 */
export class DcsSourceTextProvider implements SourceTextProvider {
  readonly id = 'dcs';
  readonly displayName: string;

  constructor(private readonly options: DcsSourceTextOptions) {
    const { owner, repo, filePath } = options;
    this.displayName = `DCS: ${owner}/${repo}/${filePath}`;
  }

  async load(): Promise<UsjDocument> {
    const { baseUrl, owner, repo, filePath, ref = 'master', token } = this.options;
    const path = encodeURIComponent(filePath);
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

    const b64 = (json.content ?? '').replace(/[\r\n]/g, '');
    const decoded = atob(b64);

    const ext = extensionOf(json.name ?? filePath);
    return parseToUsj(decoded, ext);
  }
}
