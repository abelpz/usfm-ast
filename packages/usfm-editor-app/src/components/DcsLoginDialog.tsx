import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DcsStoredCredentials } from '@/lib/dcs-storage';
import { DcsLoginForm } from './DcsLoginForm';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultHost?: string;
  contextMessage?: string;
  onSuccess?: (creds: DcsStoredCredentials) => void;
};

export function DcsLoginDialog({ open, onOpenChange, defaultHost, contextMessage, onSuccess }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Door43</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in with your Door43 account to use API features.
          </DialogDescription>
        </DialogHeader>
        <DcsLoginForm
          defaultHost={defaultHost}
          contextMessage={contextMessage}
          idPrefix="dcs-login-dlg"
          onSuccess={(c) => {
            onSuccess?.(c);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
