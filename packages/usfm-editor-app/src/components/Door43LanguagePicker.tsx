import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DcsLangnameEntry } from '@/lib/dcs-langnames-cache';
import { cn } from '@/lib/utils';
import { Languages, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAX_OPTIONS = 250;

type Props = {
  idPrefix: string;
  entries: DcsLangnameEntry[];
  valueLc: string;
  onChangeLc: (lc: string) => void;
  disabled?: boolean;
  /** `panel`: light bordered shell (e.g. Open from DCS). */
  variant?: 'default' | 'panel';
  /** Hide visible "Language" heading (e.g. when the wizard stepper already names this step). */
  hideLabel?: boolean;
  /** List grows and scrolls inside a flex parent (`min-h-0` + `flex-1` on ancestors). */
  fillListHeight?: boolean;
  className?: string;
};

/**
 * Search field plus a scrollable in-flow language list (not a floating dropdown).
 */
export function Door43LanguagePicker({
  idPrefix,
  entries,
  valueLc,
  onChangeLc,
  disabled,
  variant = 'default',
  hideLabel = false,
  fillListHeight = false,
  className,
}: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const loading = entries.length === 0;

  const displayValue = useMemo(() => {
    if (!valueLc) return '';
    const e = entries.find((x) => x.lc === valueLc);
    return e ? `${e.ln} (${e.lc})` : valueLc;
  }, [entries, valueLc]);

  /** While the field still shows only the chosen label, list all languages (prefilled UX). */
  const filterQuery = useMemo(() => {
    const raw = query.trim().toLowerCase();
    if (valueLc && raw === displayValue.trim().toLowerCase()) return '';
    return raw;
  }, [valueLc, query, displayValue]);

  const options = useMemo(() => {
    const current = valueLc ? entries.find((e) => e.lc === valueLc) : undefined;
    const q = filterQuery;
    let list: DcsLangnameEntry[];
    if (!q) {
      list = entries.slice(0, MAX_OPTIONS);
    } else {
      list = [];
      for (const e of entries) {
        if (list.length >= MAX_OPTIONS) break;
        const hay = `${e.lc} ${e.ln} ${e.ang ?? ''}`.toLowerCase();
        if (hay.includes(q)) list.push(e);
      }
    }
    if (current && !list.some((e) => e.lc === current.lc)) {
      list = [current, ...list].slice(0, MAX_OPTIONS);
    }
    return list;
  }, [entries, filterQuery, valueLc]);

  const pick = useCallback(
    (lc: string) => {
      onChangeLc(lc);
      const e = entries.find((x) => x.lc === lc);
      setQuery(e ? `${e.ln} (${e.lc})` : lc);
    },
    [entries, onChangeLc],
  );

  useEffect(() => {
    if (!valueLc) return;
    const e = entries.find((x) => x.lc === valueLc);
    if (e) setQuery(`${e.ln} (${e.lc})`);
  }, [valueLc, entries]);

  const panel = variant === 'panel';

  return (
    <div
      className={cn(
        panel ? 'space-y-2 rounded-lg border bg-muted/10 px-3 py-2' : 'space-y-2',
        fillListHeight && 'flex min-h-0 flex-1 flex-col',
        className,
      )}
    >
      {hideLabel ? (
        <Label htmlFor={`${idPrefix}-lang-combo`} className="sr-only">
          Language
        </Label>
      ) : (
        <Label htmlFor={`${idPrefix}-lang-combo`} className="flex items-center gap-2 text-sm font-medium">
          <Languages className="text-muted-foreground size-4 shrink-0" aria-hidden />
          Language
        </Label>
      )}
      <div className="relative shrink-0">
        <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          ref={inputRef}
          id={`${idPrefix}-lang-combo`}
          role="combobox"
          aria-expanded={!loading}
          aria-autocomplete="list"
          aria-controls={loading ? undefined : `${idPrefix}-lang-listbox`}
          placeholder={loading ? 'Loading languages…' : 'Search language name or code…'}
          value={query}
          disabled={disabled || loading}
          autoComplete="off"
          className={cn('pl-9', panel && 'h-9')}
          onChange={(e) => {
            setQuery(e.target.value);
            if (valueLc) onChangeLc('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              inputRef.current?.blur();
            }
            if (e.key === 'Enter' && options.length === 1) {
              e.preventDefault();
              pick(options[0]!.lc);
            }
          }}
        />
      </div>

      {loading ? (
        <div
          className={cn(
            'text-muted-foreground border-border mt-2 rounded-md border border-dashed px-3 py-8 text-center text-sm',
            fillListHeight && 'min-h-0 flex-1 py-12',
          )}
          role="status"
        >
          Loading languages…
        </div>
      ) : (
        <ul
          id={`${idPrefix}-lang-listbox`}
          role="listbox"
          aria-label="Languages"
          className={cn(
            'border-border bg-popover text-popover-foreground mt-2 overflow-y-auto rounded-md border shadow-sm',
            'p-1',
            fillListHeight ? 'min-h-0 flex-1' : panel ? 'max-h-[min(18rem,45vh)]' : 'max-h-[min(16rem,42vh)]',
          )}
        >
          {options.length === 0 ? (
            <li className="text-muted-foreground px-3 py-3 text-sm">No match</li>
          ) : (
            options.map((e) => (
              <li key={e.lc} role="option" aria-selected={e.lc === valueLc}>
                <button
                  type="button"
                  className={cn(
                    'hover:bg-accent focus:bg-accent w-full rounded-md text-left text-sm',
                    panel ? 'px-2.5 py-2' : 'px-2 py-1.5',
                    e.lc === valueLc && 'bg-accent ring-primary/20 ring-1',
                  )}
                  onClick={() => pick(e.lc)}
                >
                  <span className="font-medium">{e.ln}</span>{' '}
                  <span className="text-muted-foreground">({e.lc})</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
