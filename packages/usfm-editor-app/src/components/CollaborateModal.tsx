import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CollaborateModal({ open, onOpenChange }: Props) {
  const [ws, setWs] = useState('');

  useEffect(() => {
    if (open) setWs(localStorage.getItem('usfm-ws-relay') ?? '');
  }, [open]);

  function enableAndReload() {
    localStorage.setItem('usfm-ws-relay', ws.trim());
    sessionStorage.setItem('usfm-collab', '1');
    window.location.reload();
  }

  function disableAndReload() {
    sessionStorage.removeItem('usfm-collab');
    window.location.reload();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Collaborate</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          Optional WebSocket relay for remote peers. Tabs on this device sync via BroadcastChannel
          automatically.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="ws-relay">WebSocket relay URL</Label>
          <Input
            id="ws-relay"
            value={ws}
            onChange={(e) => setWs(e.target.value)}
            placeholder="wss://…"
          />
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={disableAndReload}>
            Disable &amp; reload
          </Button>
          <Button type="button" onClick={enableAndReload}>
            Enable &amp; reload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
