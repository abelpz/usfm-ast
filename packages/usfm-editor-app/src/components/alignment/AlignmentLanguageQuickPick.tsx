import { Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_CATALOG_TOPIC,
  fetchCatalogLanguages,
  type Door43LanguageOption,
} from '@/dcs-client';
import { DEFAULT_HELPS_CONFIG } from '@/lib/helps-config-storage';
import { cn } from '@/lib/utils';

type Props = {
  /** Called when the user selects a language. */
  onPick: (lang: Door43LanguageOption) => void;
  /** DCS host override. Defaults to the default catalog host. */
  host?: string;
  /** Currently selected language code (for highlighting). */
  currentLang?: string | null;
};

/**
 * Reusable language picker list. Renders a search input + scrollable list of
 * Door43 catalog source languages. Designed to be embedded inside a Popover,
 * Dialog, or any container — the caller controls the surrounding chrome.
 */
export function AlignmentLanguageQuickPick({ onPick, host, currentLang }: Props) {
  const catalogHost = host ?? DEFAULT_HELPS_CONFIG.host;

  const [langList, setLangList] = useState<Door43LanguageOption[]>([]);
  const [langQuery, setLangQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load on mount
  useEffect(() => {
    setLoading(true);
    setError(null);
    void fetchCatalogLanguages(catalogHost, DEFAULT_CATALOG_TOPIC, 'Aligned Bible,Bible')
      .then((list) => setLangList(list))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [catalogHost]);

  const filteredLangs = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return langList;
    return langList.filter(
      (l) =>
        l.lc.toLowerCase().includes(q) ||
        l.ln.toLowerCase().includes(q) ||
        (l.ang ?? '').toLowerCase().includes(q),
    );
  }, [langList, langQuery]);

  return (
    <div className="flex flex-col gap-0">
      <div className="border-b p-2">
        <div className="relative">
          <Input
            value={langQuery}
            onChange={(e) => setLangQuery(e.target.value)}
            placeholder="Search language…"
            className="h-7 pr-6 text-xs"
            autoFocus
          />
          {langQuery ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute right-1.5 top-1/2 -translate-y-1/2"
              onClick={() => setLangQuery('')}
              aria-label="Clear search"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-1.5 px-3 py-4 text-center text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Loading languages…
          </p>
        ) : error ? (
          <p className="text-destructive px-3 py-2 text-xs">{error}</p>
        ) : filteredLangs.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2 text-xs">No languages found.</p>
        ) : (
          filteredLangs.map((l) => (
            <button
              key={l.lc}
              type="button"
              onClick={() => onPick(l)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent',
                l.lc === currentLang && 'bg-primary/10 font-medium text-primary',
              )}
            >
              <span className="text-muted-foreground w-10 shrink-0 font-mono">{l.lc}</span>
              <span className="truncate">
                {l.ln}
                {l.ang && l.ang !== l.ln ? ` · ${l.ang}` : ''}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
