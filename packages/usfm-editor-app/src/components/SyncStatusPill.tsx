import type { SyncStatusState } from '@/hooks/useSyncStatus';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, RefreshCw, WifiOff, Users } from 'lucide-react';

const iconMap: Record<SyncStatusState, React.ElementType> = {
  synced: CheckCircle2,
  offline: WifiOff,
  conflict: AlertCircle,
  syncing: RefreshCw,
};

const colorMap: Record<SyncStatusState, string> = {
  synced: 'text-emerald-500',
  offline: 'text-amber-500',
  conflict: 'text-destructive',
  syncing: 'text-blue-500',
};

const labelMap: Record<SyncStatusState, string> = {
  synced: 'Synced',
  offline: 'Offline',
  conflict: 'Conflict',
  syncing: 'Syncing…',
};

export function SyncStatusPill(props: {
  state: SyncStatusState;
  peerCount?: number;
  detail?: string;
  /** When false the pill renders nothing (no active sync target). */
  connected: boolean;
  className?: string;
}) {
  const { state, peerCount, detail, connected, className } = props;

  if (!connected && state !== 'conflict') return null;

  const Icon = iconMap[state];
  const peers = typeof peerCount === 'number' && peerCount > 0 ? peerCount : 0;
  const tooltip = [labelMap[state], detail].filter(Boolean).join(' · ');

  return (
    <span
      className={cn('flex items-center gap-1', className)}
      title={tooltip}
      aria-label={tooltip}
    >
      <Icon
        className={cn('size-4 shrink-0', colorMap[state], state === 'syncing' && 'animate-spin')}
        aria-hidden
      />
      {peers > 0 && (
        <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
          <Users className="size-3" aria-hidden />
          {peers}
        </span>
      )}
    </span>
  );
}
