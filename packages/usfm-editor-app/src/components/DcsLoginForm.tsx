import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAndCreateToken } from '@/dcs-client';
import { dcsForgotPasswordUrl, dcsSignUpUrl } from '@/lib/dcs-auth-urls';
import { saveDcsCredentialsAsync, type DcsStoredCredentials } from '@/lib/dcs-storage';
import { useKV } from '@/platform/PlatformContext';
import { cn } from '@/lib/utils';
import { BookOpen, ChevronDown, ChevronUp, KeyRound, Loader2, Lock, LogIn, User, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export type DcsLoginFormProps = {
  /** Initial host (hidden until Advanced). */
  defaultHost?: string;
  /** Optional message above the form (e.g. why sign-in is needed). */
  contextMessage?: string;
  /** Called after credentials are stored successfully. */
  onSuccess?: (creds: DcsStoredCredentials) => void;
  /** Show compact padding (when embedded in DcsModal). */
  compact?: boolean;
  /** ID prefix for inputs when multiple forms exist. */
  idPrefix?: string;
  className?: string;
};

export function DcsLoginForm({
  defaultHost = 'git.door43.org',
  contextMessage,
  onSuccess,
  compact,
  idPrefix = 'dcs-login',
  className,
}: DcsLoginFormProps) {
  const kv = useKV();
  const [host, setHost] = useState(defaultHost);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);

  useEffect(() => {
    setHost(defaultHost);
  }, [defaultHost]);

  const onLogin = useCallback(async () => {
    setLoginErr(null);
    if (!username.trim() || !password) {
      setLoginErr('Username and password required.');
      return;
    }
    setBusy(true);
    try {
      const h = host.trim() || 'git.door43.org';
      const tok = await loginAndCreateToken({
        host: h,
        username: username.trim(),
        password,
        tokenName: `usfm-editor-app-${new Date().toISOString().slice(0, 10)}`,
      });
      const next: DcsStoredCredentials = {
        host: h,
        token: tok.sha1,
        username: username.trim(),
        tokenId: tok.id,
      };
      await saveDcsCredentialsAsync(kv, next);
      setPassword('');
      setSuccessFlash(true);
      window.setTimeout(() => {
        setSuccessFlash(false);
        onSuccess?.(next);
      }, 900);
    } catch (e) {
      setLoginErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [host, username, password, onSuccess, kv]);

  const signUp = dcsSignUpUrl(host);
  const forgot = dcsForgotPasswordUrl(host);

  if (successFlash) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center gap-3 py-8', className)}
        role="status"
        aria-live="polite"
      >
        <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
          <LogIn className="size-7" aria-hidden />
        </div>
        <p className="text-center text-sm font-medium">Signed in</p>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-4', compact ? '' : 'py-1', className)}>
      {contextMessage ? (
        <p className="text-muted-foreground text-center text-sm">{contextMessage}</p>
      ) : null}
      <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
        <BookOpen className="text-primary size-8 shrink-0" aria-hidden />
        <span className="text-center">Sign in with your Door43 account</span>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-user`} className="flex items-center gap-2">
          <User className="size-4 shrink-0 opacity-70" aria-hidden />
          Username
        </Label>
        <Input
          id={`${idPrefix}-user`}
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-pass`} className="flex items-center gap-2">
          <Lock className="size-4 shrink-0 opacity-70" aria-hidden />
          Password
        </Label>
        <Input
          id={`${idPrefix}-pass`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onLogin();
          }}
        />
      </div>

      {showAdvanced ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-host`}>Server</Label>
          <Input
            id={`${idPrefix}-host`}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={busy}
            placeholder="git.door43.org"
          />
        </div>
      ) : null}

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 text-xs underline-offset-4 hover:underline"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        Advanced (server)
      </button>

      {loginErr ? <p className="text-destructive text-center text-sm">{loginErr}</p> : null}

      <Button type="button" className="gap-2" disabled={busy} onClick={() => void onLogin()}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
        Sign in
      </Button>

      <div className="flex flex-col gap-2 border-t pt-3 text-center text-sm">
        <a
          href={signUp}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex items-center justify-center gap-2 font-medium underline-offset-4 hover:underline"
        >
          <UserPlus className="size-4 shrink-0" aria-hidden />
          Create an account
        </a>
        <a
          href={forgot}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground inline-flex items-center justify-center gap-2 underline-offset-4 hover:underline"
        >
          <KeyRound className="size-4 shrink-0" aria-hidden />
          Forgot password?
        </a>
      </div>
    </div>
  );
}
