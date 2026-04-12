import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { bookCodeGroup } from '@/lib/book-code-groups';
import { cn } from '@/lib/utils';
import { BookOpen, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type BookComboRow = { code: string; name: string; path: string };

type Props = {
  idPrefix: string;
  books: BookComboRow[];
  valuePath: string | null;
  onChangePath: (path: string | null) => void;
  disabled?: boolean;
  /** Hide visible "Book" heading (use an external title). */
  hideLabel?: boolean;
  /** List grows and scrolls inside a flex parent (`min-h-0` + `flex-1` on ancestors). */
  fillListHeight?: boolean;
  className?: string;
};

function groupRows(rows: BookComboRow[]) {
  const ot: BookComboRow[] = [];
  const nt: BookComboRow[] = [];
  const other: BookComboRow[] = [];
  for (const b of rows) {
    const g = bookCodeGroup(b.code);
    if (g === 'ot') ot.push(b);
    else if (g === 'nt') nt.push(b);
    else other.push(b);
  }
  return { ot, nt, other };
}

/**
 * Search field plus a scrollable in-flow book list (OT/NT/Other), like `Door43LanguagePicker`.
 */
export function BookCombobox({
  idPrefix,
  books,
  valuePath,
  onChangePath,
  disabled,
  hideLabel = false,
  fillListHeight = false,
  className,
}: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (books.length === 1 && books[0]!.path !== valuePath) {
      onChangePath(books[0]!.path);
    }
  }, [books, valuePath, onChangePath]);

  const displayValue = useMemo(() => {
    if (!valuePath) return '';
    const b = books.find((x) => x.path === valuePath);
    return b ? `${b.name} (${b.code})` : '';
  }, [books, valuePath]);

  /** Prefilled selection: show full list until user edits search. */
  const filterQuery = useMemo(() => {
    const raw = query.trim().toLowerCase();
    if (valuePath && displayValue && raw === displayValue.trim().toLowerCase()) return '';
    return raw;
  }, [valuePath, query, displayValue]);

  const filtered = useMemo(() => {
    const fq = filterQuery;
    if (!fq) return books;
    return books.filter((b) => {
      const hay = `${b.name} ${b.code}`.toLowerCase();
      return hay.includes(fq);
    });
  }, [books, filterQuery]);

  const grouped = useMemo(() => groupRows(filtered), [filtered]);

  const selected = useMemo(() => (valuePath ? books.find((b) => b.path === valuePath) : undefined), [books, valuePath]);

  useEffect(() => {
    if (selected) {
      setQuery(`${selected.name} (${selected.code})`);
    }
  }, [selected]);

  useEffect(() => {
    if (books.length === 0) setQuery('');
  }, [books.length]);

  const pick = useCallback(
    (path: string) => {
      onChangePath(path);
      const b = books.find((x) => x.path === path);
      setQuery(b ? `${b.name} (${b.code})` : '');
    },
    [books, onChangePath],
  );

  const empty = books.length === 0;

  const flatFiltered = useMemo(() => {
    const { ot, nt, other } = grouped;
    return [...ot, ...nt, ...other];
  }, [grouped]);

  return (
    <div
      className={cn(
        'space-y-2',
        fillListHeight && 'flex min-h-0 flex-1 flex-col',
        className,
      )}
    >
      {hideLabel ? (
        <Label htmlFor={`${idPrefix}-book-combo`} className="sr-only">
          Book
        </Label>
      ) : (
        <Label htmlFor={`${idPrefix}-book-combo`} className="flex items-center gap-2 text-sm font-medium">
          <BookOpen className="size-4 opacity-70" aria-hidden />
          Book
        </Label>
      )}
      <div className="relative shrink-0">
        <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          ref={inputRef}
          id={`${idPrefix}-book-combo`}
          role="combobox"
          aria-expanded={!empty}
          aria-autocomplete="list"
          aria-controls={empty ? undefined : `${idPrefix}-book-listbox`}
          placeholder={empty ? 'No books in this project' : 'Search by name or code…'}
          value={query}
          disabled={disabled || empty}
          autoComplete="off"
          className="pl-9"
          onChange={(e) => {
            setQuery(e.target.value);
            if (valuePath) onChangePath(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') inputRef.current?.blur();
            if (e.key === 'Enter' && flatFiltered.length === 1) {
              e.preventDefault();
              pick(flatFiltered[0]!.path);
            }
          }}
        />
      </div>

      {empty ? (
        <div className="text-muted-foreground border-border mt-2 rounded-md border border-dashed px-3 py-6 text-center text-sm" role="status">
          No books in this project
        </div>
      ) : (
        <ul
          id={`${idPrefix}-book-listbox`}
          role="listbox"
          aria-label="Books"
          className={cn(
            'border-border bg-popover text-popover-foreground mt-2 overflow-y-auto rounded-md border p-1 shadow-sm',
            fillListHeight ? 'min-h-0 flex-1' : 'max-h-[min(16rem,42vh)]',
          )}
        >
          {filtered.length === 0 ? (
            <li className="text-muted-foreground px-2 py-2 text-sm">No match</li>
          ) : (
            <>
              {grouped.ot.length > 0 ? (
                <li className="px-2 py-1.5" role="presentation">
                  <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Old Testament</div>
                  <ul className="mt-1 space-y-0.5">
                    {grouped.ot.map((b) => (
                      <li key={b.path} role="option" aria-selected={b.path === valuePath}>
                        <button
                          type="button"
                          className={cn(
                            'hover:bg-accent focus:bg-accent w-full rounded px-2 py-1.5 text-left text-sm',
                            b.path === valuePath && 'bg-accent ring-primary/20 ring-1',
                          )}
                          onClick={() => pick(b.path)}
                        >
                          <span className="font-medium">{b.name}</span>{' '}
                          <span className="text-muted-foreground">({b.code})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {grouped.nt.length > 0 ? (
                <li className="px-2 py-1.5" role="presentation">
                  <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">New Testament</div>
                  <ul className="mt-1 space-y-0.5">
                    {grouped.nt.map((b) => (
                      <li key={b.path} role="option" aria-selected={b.path === valuePath}>
                        <button
                          type="button"
                          className={cn(
                            'hover:bg-accent focus:bg-accent w-full rounded px-2 py-1.5 text-left text-sm',
                            b.path === valuePath && 'bg-accent ring-primary/20 ring-1',
                          )}
                          onClick={() => pick(b.path)}
                        >
                          <span className="font-medium">{b.name}</span>{' '}
                          <span className="text-muted-foreground">({b.code})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {grouped.other.length > 0 ? (
                <li className="px-2 py-1.5" role="presentation">
                  <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Other</div>
                  <ul className="mt-1 space-y-0.5">
                    {grouped.other.map((b) => (
                      <li key={b.path} role="option" aria-selected={b.path === valuePath}>
                        <button
                          type="button"
                          className={cn(
                            'hover:bg-accent focus:bg-accent w-full rounded px-2 py-1.5 text-left text-sm',
                            b.path === valuePath && 'bg-accent ring-primary/20 ring-1',
                          )}
                          onClick={() => pick(b.path)}
                        >
                          <span className="font-medium">{b.name}</span>{' '}
                          <span className="text-muted-foreground">({b.code})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
