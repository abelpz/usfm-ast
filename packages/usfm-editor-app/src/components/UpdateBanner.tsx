/**
 * In-app update-available banner rendered at the top of every page when a new
 * version of the desktop app is available. Only visible on Tauri.
 */
import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTauriUpdater } from '@/hooks/useTauriUpdater';

export function UpdateBanner() {
  const { update, dismiss } = useTauriUpdater();
  const [installing, setInstalling] = useState(false);

  if (!update) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await update.install();
    } catch {
      setInstalling(false);
    }
  };

  return (
    <div
      role="status"
      className="bg-primary text-primary-foreground flex items-center justify-between gap-3 px-4 py-2 text-sm"
    >
      <span className="flex items-center gap-2">
        <Download className="size-4 shrink-0" aria-hidden />
        <span>
          USFM Editor <strong>{update.version}</strong> is available.
        </span>
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-xs"
          onClick={() => void handleInstall()}
          disabled={installing}
        >
          {installing ? 'Installing…' : 'Download & Install'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground/80 hover:text-primary-foreground size-7"
          onClick={dismiss}
          aria-label="Dismiss update"
          disabled={installing}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
