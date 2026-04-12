import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogEntry } from '@/dcs-client';
import { cn } from '@/lib/utils';
import { Library } from 'lucide-react';
import { useState } from 'react';

function CatalogOrgAvatar({ avatarUrl, ownerLogin }: { avatarUrl?: string; ownerLogin: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const letter = (ownerLogin.charAt(0) || '?').toUpperCase();
  const showImg = Boolean(avatarUrl?.trim()) && !imgFailed;

  return (
    <div
      className="border-border bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm font-medium"
      title={ownerLogin}
    >
      {showImg ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span aria-hidden>{letter}</span>
      )}
    </div>
  );
}

type Props = {
  entries: CatalogEntry[];
  selectedKey: string | null;
  rowKey: (e: CatalogEntry) => string;
  onSelect: (entry: CatalogEntry) => void;
  loading: boolean;
  /** List fills parent and scrolls (`min-h-0` + `flex-1` on flex parents). */
  fillHeight?: boolean;
};

/**
 * Card-style list of published catalog sources (title, repo, version) for the translate wizard.
 */
export function TranslateCatalogSourceList({ entries, selectedKey, rowKey, onSelect, loading, fillHeight }: Props) {
  if (loading) {
    return (
      <div className={cn('space-y-3 p-1', fillHeight && 'flex min-h-0 flex-1 flex-col')}>
        <Skeleton className="h-[4.5rem] w-full shrink-0 rounded-xl" />
        <Skeleton className="h-[4.5rem] w-full shrink-0 rounded-xl" />
        <Skeleton className="h-[4.5rem] w-full shrink-0 rounded-xl" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center text-sm">
        <Library className="size-8 opacity-40" aria-hidden />
        <p>No published sources for this language.</p>
        <p className="text-xs">Try another language or check Door43.</p>
      </div>
    );
  }

  return (
    <ul
      className={cn(
        'flex flex-col gap-2 overflow-y-auto p-0.5',
        fillHeight ? 'min-h-0 flex-1' : 'max-h-[min(22rem,55vh)]',
      )}
      role="list"
    >
      {entries.map((row) => {
        const k = rowKey(row);
        const selected = selectedKey === k;
        const repoPath = `${row.ownerLogin}/${row.repoName}`;
        return (
          <li key={k}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className={cn(
                'border-border hover:bg-accent/60 w-full rounded-xl border-2 p-3 text-left transition-colors',
                selected && 'border-primary bg-accent/40 ring-primary/25 shadow-sm ring-2',
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="flex min-w-0 flex-1 gap-3">
                  <CatalogOrgAvatar avatarUrl={row.ownerAvatarUrl} ownerLogin={row.ownerLogin} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-foreground leading-snug font-semibold tracking-tight">{row.title}</p>
                    <p className="text-muted-foreground font-mono text-xs break-all sm:text-sm">{repoPath}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:flex-col sm:items-end">
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase sm:text-xs">
                    {row.abbreviation}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">
                    {row.releaseTag}
                  </Badge>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
