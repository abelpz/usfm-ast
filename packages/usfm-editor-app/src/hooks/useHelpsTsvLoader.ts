import {
  door43WebRawFileUrl,
  formatHelpsPathTemplate,
  parseTnTsv,
  parseTwlTsv,
} from '@usfm-tools/editor-adapters';
import type { HelpEntry } from '@usfm-tools/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getFileContent } from '@/dcs-client';
import type { HelpsResourceConfig } from '@/lib/helps-config-storage';

type DcsAuth = { host: string; token?: string } | null;

async function loadTextFile(opts: {
  host: string;
  owner: string;
  repo: string;
  ref: string;
  path: string;
  token?: string;
}): Promise<string> {
  if (opts.token) {
    const r = await getFileContent({
      host: opts.host,
      token: opts.token,
      owner: opts.owner,
      repo: opts.repo,
      path: opts.path,
      ref: opts.ref,
    });
    return r.content;
  }
  const url = door43WebRawFileUrl({
    host: opts.host,
    owner: opts.owner,
    repo: opts.repo,
    ref: opts.ref,
    path: opts.path,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${opts.path}`);
  return res.text();
}

export type HelpsTsvState = {
  twl: HelpEntry[];
  tn: HelpEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * Load TWL + TN TSV for the given book when helps are enabled and config is valid.
 */
export function useHelpsTsvLoader(
  config: HelpsResourceConfig,
  bookCode: string | null,
  dcsAuth: DcsAuth,
): HelpsTsvState {
  const [twl, setTwl] = useState<HelpEntry[]>([]);
  const [tn, setTn] = useState<HelpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const token = dcsAuth?.token;
  const host = config.host || 'git.door43.org';

  const twlActive = Boolean(config.twlOwner?.trim() && config.twlRepo?.trim());
  const tnActive = Boolean(config.tnOwner?.trim() && config.tnRepo?.trim());

  const depsKey = useMemo(() => {
    if (!config.enabled || !bookCode) return '';
    return [
      nonce,
      host,
      token ?? '',
      twlActive ? config.twlOwner : '',
      twlActive ? config.twlRepo : '',
      twlActive ? config.twlRef : '',
      twlActive ? config.twlPathTpl : '',
      tnActive ? config.tnOwner : '',
      tnActive ? config.tnRepo : '',
      tnActive ? config.tnRef : '',
      tnActive ? config.tnPathTpl : '',
      bookCode,
    ].join('|');
  }, [nonce, host, token, config, bookCode, twlActive, tnActive]);

  useEffect(() => {
    if (!config.enabled || !bookCode) {
      setTwl([]);
      setTn([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (!twlActive && !tnActive) {
      setTwl([]);
      setTn([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const twlPath = twlActive ? formatHelpsPathTemplate(config.twlPathTpl, bookCode) : '';
    const tnPath = tnActive ? formatHelpsPathTemplate(config.tnPathTpl, bookCode) : '';
    void (async () => {
      try {
        const twlP =
          twlActive && twlPath
            ? loadTextFile({
                host,
                owner: config.twlOwner,
                repo: config.twlRepo,
                ref: config.twlRef,
                path: twlPath,
                token,
              })
            : Promise.resolve('');
        const tnP =
          tnActive && tnPath
            ? loadTextFile({
                host,
                owner: config.tnOwner,
                repo: config.tnRepo,
                ref: config.tnRef,
                path: tnPath,
                token,
              })
            : Promise.resolve('');
        const [twlText, tnText] = await Promise.all([twlP, tnP]);
        if (cancelled) return;
        setTwl(twlText ? parseTwlTsv(twlText) : []);
        setTn(tnText ? parseTnTsv(tnText) : []);
      } catch (e) {
        if (cancelled) return;
        setTwl([]);
        setTn([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [depsKey]);

  return { twl, tn, loading, error, reload };
}
