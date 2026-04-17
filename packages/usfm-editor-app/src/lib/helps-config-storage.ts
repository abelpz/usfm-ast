const KEY = 'usfm-editor-helps-config-v1';

export type HelpsResourceConfig = {
  enabled: boolean;
  host: string;
  twlOwner: string;
  twlRepo: string;
  twlRef: string;
  twlPathTpl: string;
  tnOwner: string;
  tnRepo: string;
  tnRef: string;
  tnPathTpl: string;
  twArticleOwner: string;
  twArticleRepo: string;
  twArticleRef: string;
  taArticleOwner: string;
  taArticleRepo: string;
  taArticleRef: string;
};

export const DEFAULT_HELPS_CONFIG: HelpsResourceConfig = {
  enabled: false,
  host: 'git.door43.org',
  twlOwner: 'unfoldingWord',
  twlRepo: 'en_twl',
  twlRef: 'master',
  twlPathTpl: 'twl_{book}.tsv',
  tnOwner: 'unfoldingWord',
  tnRepo: 'en_tn',
  tnRef: 'master',
  tnPathTpl: 'tn_{book}.tsv',
  twArticleOwner: 'unfoldingWord',
  twArticleRepo: 'en_tw',
  twArticleRef: 'master',
  taArticleOwner: 'unfoldingWord',
  taArticleRepo: 'en_ta',
  taArticleRef: 'master',
};

export function loadHelpsConfig(): HelpsResourceConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_HELPS_CONFIG };
    const o = JSON.parse(raw) as Partial<HelpsResourceConfig>;
    return { ...DEFAULT_HELPS_CONFIG, ...o };
  } catch {
    return { ...DEFAULT_HELPS_CONFIG };
  }
}

export function saveHelpsConfig(c: HelpsResourceConfig): void {
  localStorage.setItem(KEY, JSON.stringify(c));
}
