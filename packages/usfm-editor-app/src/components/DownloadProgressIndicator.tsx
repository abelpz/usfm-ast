/**
 * Compact, non-intrusive indicator that appears in the app shell
 * while background source downloads are active.
 *
 * Shows: "Downloading Spanish resources… 3/7" with a link to the
 * Source Cache management page for details.
 */
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDownloadQueue } from '@/hooks/useDownloadQueue';

export function DownloadProgressIndicator() {
  const { isDownloading, totalProgress, latestProgress } = useDownloadQueue();

  if (!isDownloading && totalProgress.reposTotal === 0) return null;

  const { reposCompleted, reposTotal } = totalProgress;
  const langMatch = latestProgress?.job.langCode;
  const langLabel = langMatch || 'resources';

  return (
    <Link
      to="/source-cache"
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="View download details"
    >
      {isDownloading && (
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
      )}
      <span>
        {isDownloading
          ? `Downloading ${langLabel}… ${reposCompleted}/${reposTotal}`
          : `Downloaded ${reposCompleted}/${reposTotal} repos`}
      </span>
    </Link>
  );
}
