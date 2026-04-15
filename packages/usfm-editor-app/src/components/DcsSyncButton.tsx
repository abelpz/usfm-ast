/**
 * DcsSyncButton — compact cloud-sync indicator for project & editor pages.
 *
 * Renders as a small icon button with a colored status dot. Clicking opens a
 * Popover with status details, force-sync, and auto-sync toggle. The full
 * "Connect / Disconnect" flow opens a separate dialog.
 *
 * Designed to be placed in a page header or topbar, not in the main content area.
 */
import { DcsLoginDialog } from '@/components/DcsLoginDialog';
import { Tip } from '@/components/Tip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createOrganization,
  createOrgRepo,
  createUserRepo,
  fetchAuthenticatedUser,
  getRepoInfo,
  listUserOrgs,
  type Door43OrgSummary,
  type Door43RepoInfo,
} from '@/dcs-client';
import type { DcsStoredCredentials } from '@/lib/dcs-storage';
import { loadDcsCredentials } from '@/lib/dcs-storage';
import { pushLocalProjectToDcs, suggestedDoor43RepoName } from '@/lib/dcs-project-sync';
import type { LocalProjectSyncState } from '@/hooks/useLocalProjectSync';
import type { ProjectMeta, ProjectStorage, ProjectSyncConfig } from '@usfm-tools/types';
import { AlertTriangle, Clock, Cloud, CloudOff, CloudUpload, Loader2, RefreshCw, Tag, Unplug, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

type SyncStatus = 'no-config' | 'syncing' | 'conflict' | 'pending' | 'synced';

function statusColor(s: SyncStatus): string {
  switch (s) {
    case 'syncing':
      return 'bg-blue-500';
    case 'conflict':
      return 'bg-destructive';
    case 'pending':
      return 'bg-amber-500';
    case 'synced':
      return 'bg-green-500';
    case 'no-config':
    default:
      return 'bg-muted-foreground/40';
  }
}

function statusLabel(s: SyncStatus): string {
  switch (s) {
    case 'syncing':
      return 'Syncing…';
    case 'conflict':
      return 'Merge conflict';
    case 'pending':
      return 'Sync pending';
    case 'synced':
      return 'In sync';
    case 'no-config':
    default:
      return 'Not connected to DCS';
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type DcsSyncButtonProps = {
  /** Project metadata. Needed for repo name suggestions and sync config. */
  meta: ProjectMeta;
  storage: ProjectStorage;
  /** Current state from `useLocalProjectSync`. */
  localSync: LocalProjectSyncState;
  /** Called after connecting / disconnecting so the parent can reload meta. */
  onUpdated: () => void;
  /** Extra class names for the trigger button. */
  className?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DcsSyncButton({ meta, storage, localSync, onUpdated, className }: DcsSyncButtonProps) {
  // Credentials
  const [creds, setCreds] = useState<DcsStoredCredentials | null>(() => loadDcsCredentials());

  // Dialog / popover visibility
  const [popOpen, setPopOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);

  // Connect-to-DCS form state
  const [username, setUsername] = useState('');
  const [orgFullName, setOrgFullName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgErr, setOrgErr] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<'user' | 'org'>('user');
  const [orgs, setOrgs] = useState<Door43OrgSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [repoName, setRepoName] = useState(() => suggestedDoor43RepoName(meta));
  const [checkResult, setCheckResult] = useState<Door43RepoInfo | 'missing' | null>(null);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const defaultHost = useMemo(() => creds?.host ?? 'git.door43.org', [creds?.host]);

  const sc = meta.syncConfig;

  // Derive status
  const status: SyncStatus = !sc
    ? 'no-config'
    : localSync.isSyncing
      ? 'syncing'
      : localSync.conflictPrUrl
        ? 'conflict'
        : meta.pendingSyncAt
          ? 'pending'
          : 'synced';

  // Load orgs when the connect dialog opens
  const loadOrgs = useCallback(async () => {
    if (!creds?.token) return;
    const list = await listUserOrgs({ host: creds.host, token: creds.token });
    setOrgs(list);
  }, [creds?.host, creds?.token]);

  useEffect(() => {
    if (!connectOpen || !creds?.token) return;
    void loadOrgs().catch(() => setOrgs([]));
  }, [connectOpen, creds?.token, creds?.host, loadOrgs]);

  useEffect(() => {
    if (orgs.length === 0) return;
    if (!selectedOrg || !orgs.some((o) => o.username === selectedOrg)) {
      setSelectedOrg(orgs[0]!.username);
    }
  }, [orgs, selectedOrg]);

  useEffect(() => {
    if (connectOpen) {
      setRepoName(suggestedDoor43RepoName(meta));
      setCheckResult(null);
      setCheckErr(null);
      setActionErr(null);
    }
  }, [connectOpen, meta.id, meta.language]);

  async function resolveOwner(): Promise<string> {
    if (!creds?.token) throw new Error('Not signed in');
    if (targetType === 'user') {
      const u = await fetchAuthenticatedUser({ host: creds.host, token: creds.token });
      return u.login;
    }
    if (!selectedOrg.trim()) throw new Error('Select an organization');
    return selectedOrg.trim();
  }

  async function onCheckAvailability() {
    if (!creds?.token) { setLoginOpen(true); return; }
    setCheckErr(null); setCheckResult(null); setBusy(true);
    try {
      const owner = await resolveOwner();
      const info = await getRepoInfo({ host: creds.host, token: creds.token, owner, repo: repoName.trim().toLowerCase() });
      setCheckResult(info ?? 'missing');
    } catch (e) { setCheckErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function onLinkAndPush() {
    if (!creds?.token) { setLoginOpen(true); return; }
    if (!checkResult || checkResult === 'missing') { setActionErr('Check availability first.'); return; }
    setBusy(true); setActionErr(null);
    try {
      const owner = await resolveOwner();
      const sync: ProjectSyncConfig = { host: creds.host, owner, repo: repoName.trim().toLowerCase(), branch: checkResult.defaultBranch || 'main', targetType: targetType === 'org' ? 'org' : 'user' };
      const exists = await getRepoInfo({ host: creds.host, token: creds.token, owner: sync.owner, repo: sync.repo });
      if (!exists) throw new Error('Repository not found.');
      await storage.updateProject(meta.id, { syncConfig: sync });
      await pushLocalProjectToDcs({ storage, projectId: meta.id, token: creds.token, sync });
      await storage.updateProject(meta.id, { lastRemoteSyncAt: new Date().toISOString() });
      setConnectOpen(false);
      onUpdated();
    } catch (e) { setActionErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function onCreateAndPush() {
    if (!creds?.token) { setLoginOpen(true); return; }
    setBusy(true); setActionErr(null);
    try {
      const owner = await resolveOwner();
      const name = repoName.trim().toLowerCase();
      const { host, token } = creds;
      const created = targetType === 'user'
        ? await createUserRepo({ host, token, name, private: false, autoInit: true })
        : await createOrgRepo({ host, token, org: owner, name, private: false, autoInit: true });
      const sync: ProjectSyncConfig = { host, owner, repo: name, branch: created.defaultBranch ?? 'main', targetType: targetType === 'org' ? 'org' : 'user' };
      await storage.updateProject(meta.id, { syncConfig: sync });
      await pushLocalProjectToDcs({ storage, projectId: meta.id, token, sync });
      await storage.updateProject(meta.id, { lastRemoteSyncAt: new Date().toISOString() });
      setConnectOpen(false);
      onUpdated();
    } catch (e) { setActionErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function onCreateOrg() {
    if (!creds?.token) return;
    setOrgErr(null); setOrgBusy(true);
    try {
      const created = await createOrganization({ host: creds.host, token: creds.token, username: username.trim().toLowerCase(), fullName: orgFullName.trim() || undefined, description: orgDescription.trim() || undefined, visibility: 'public' });
      await loadOrgs();
      setSelectedOrg(created.username);
      setTargetType('org');
      setOrgDialogOpen(false);
      setUsername(''); setOrgFullName(''); setOrgDescription('');
    } catch (e) { setOrgErr(e instanceof Error ? e.message : String(e)); }
    finally { setOrgBusy(false); }
  }

  async function onForceSync() {
    if (!sc) return;
    if (!creds?.token) { setLoginOpen(true); return; }
    setPopOpen(false);
    await localSync.forceSync();
    onUpdated();
  }

  async function onDisconnect() {
    setBusy(true);
    try {
      await storage.updateProject(meta.id, { syncConfig: undefined, lastRemoteSyncAt: undefined });
      await storage.setSyncShas(meta.id, {});
      onUpdated();
    } finally { setBusy(false); }
  }

  const lastSync = localSync.lastSyncAt ?? meta.lastRemoteSyncAt;

  return (
    <>
      <Popover open={popOpen} onOpenChange={setPopOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('relative size-8', className)}
            title={statusLabel(status)}
            aria-label={`DCS sync: ${statusLabel(status)}`}
          >
            {status === 'syncing' ? (
              <CloudUpload className="size-4 animate-pulse text-blue-500" aria-hidden />
            ) : status === 'no-config' ? (
              <CloudOff className="text-muted-foreground size-4" aria-hidden />
            ) : (
              <Cloud className={cn('size-4', status === 'conflict' ? 'text-destructive' : status === 'pending' ? 'text-amber-500' : 'text-foreground')} aria-hidden />
            )}
            {/* Status dot */}
            <span
              className={cn(
                'absolute bottom-0.5 right-0.5 size-2 rounded-full ring-1 ring-background',
                statusColor(status),
                status === 'syncing' && 'animate-pulse',
              )}
              aria-hidden
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="p-0">
          <div className="px-3 py-2.5 border-b flex items-center gap-2">
            <span className={cn('size-2 rounded-full shrink-0', statusColor(status))} aria-hidden />
            <span className="text-sm font-medium">{statusLabel(status)}</span>
          </div>

          <div className="px-3 py-2.5 space-y-2 text-xs text-muted-foreground">
            {sc ? (
              <>
                <p className="font-mono text-foreground truncate">
                  {sc.host.replace('https://', '')}/{sc.owner}/{sc.repo}
                  <span className="text-muted-foreground ml-1">({sc.branch})</span>
                </p>
                <p className="flex items-center gap-1">
                  <Clock className="size-3 shrink-0" aria-hidden />
                  {lastSync
                    ? lastSync.slice(0, 19).replace('T', ' ') + ' UTC'
                    : '—'}
                </p>

                {meta.pendingSyncAt && !localSync.isSyncing ? (
                  <Tip label="Will retry when back online" side="left">
                    <p className="text-amber-600 flex items-center gap-1 w-fit">
                      <WifiOff className="size-3 shrink-0" aria-hidden />
                      <span>Pending</span>
                    </p>
                  </Tip>
                ) : null}

                {localSync.conflictPrUrl && !localSync.isSyncing ? (
                  <p className="text-destructive flex items-center gap-1">
                    <AlertTriangle className="size-3 shrink-0" aria-hidden />
                    <a href={localSync.conflictPrUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      Resolve conflict ↗
                    </a>
                  </p>
                ) : null}

                {localSync.pendingReleaseCount > 0 ? (
                  <p className="text-primary flex items-center gap-1">
                    <Tag className="size-3 shrink-0" aria-hidden />
                    {localSync.pendingReleaseCount}
                  </p>
                ) : null}
              </>
            ) : (
              <p>Not connected to a Door43 repository.</p>
            )}
          </div>

          <div className="px-3 py-2 border-t flex items-center gap-2">
            {sc ? (
              <>
                <Tip label="Sync now">
                  <Button
                    type="button"
                    size="icon"
                    className="size-7"
                    disabled={localSync.isSyncing || busy}
                    onClick={() => void onForceSync()}
                    aria-label="Sync now"
                  >
                    {localSync.isSyncing
                      ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      : <RefreshCw className="size-3.5" aria-hidden />}
                  </Button>
                </Tip>

                <Tip label="Auto-sync">
                  <label className="ml-auto flex cursor-pointer items-center gap-1 select-none" aria-label="Auto-sync">
                    <Checkbox
                      checked={localSync.autoSync}
                      onCheckedChange={(v) => localSync.setAutoSync(v === true)}
                    />
                    <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                  </label>
                </Tip>

                <Tip label="Disconnect">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground"
                    disabled={busy}
                    onClick={() => { setPopOpen(false); void onDisconnect(); }}
                    aria-label="Disconnect"
                  >
                    <Unplug className="size-3.5" aria-hidden />
                  </Button>
                </Tip>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs w-full"
                onClick={() => { setPopOpen(false); if (!creds?.token) { setLoginOpen(true); } else { setConnectOpen(true); } }}
              >
                Connect to Door43
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Login dialog */}
      <DcsLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        defaultHost={defaultHost}
        contextMessage="Sign in to link or create a Door43 repository for this project."
        onSuccess={(c) => { setCreds(c); setConnectOpen(true); }}
      />

      {/* Connect / create repo dialog */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Connect project to Door43</DialogTitle>
            <DialogDescription>
              Repository name should follow <span className="font-mono">{`{language}_{id}`}</span> (e.g.{' '}
              <span className="font-mono">es-419_tpl</span>).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!creds?.token ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => setLoginOpen(true)}>
                Sign in to Door43
              </Button>
            ) : null}

            <div className="space-y-2">
              <Label>Target</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={targetType === 'user' ? 'default' : 'outline'} onClick={() => setTargetType('user')}>Personal account</Button>
                <Button type="button" size="sm" variant={targetType === 'org' ? 'default' : 'outline'} onClick={() => setTargetType('org')}>Organization</Button>
              </div>
            </div>

            {targetType === 'org' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <Label htmlFor="dcs-org-pick">Organization</Label>
                    {orgs.length === 0 ? (
                      <p className="text-muted-foreground text-xs">No organizations found.</p>
                    ) : (
                      <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                        <SelectTrigger id="dcs-org-pick"><SelectValue placeholder="Choose organization" /></SelectTrigger>
                        <SelectContent>
                          {orgs.map((o) => (
                            <SelectItem key={o.username} value={o.username}>
                              {o.username}{o.fullName ? ` — ${o.fullName}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setOrgDialogOpen(true)}>New org</Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="dcs-repo-name">Repository name</Label>
              <Input id="dcs-repo-name" value={repoName} onChange={(e) => setRepoName(e.target.value)} className="font-mono" autoComplete="off" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onCheckAvailability()}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Check availability
              </Button>
            </div>

            {checkErr ? <p className="text-destructive text-sm">{checkErr}</p> : null}
            {checkResult === 'missing' ? <p className="text-muted-foreground text-sm">No repository found under the selected owner.</p> : null}
            {checkResult && checkResult !== 'missing' ? (
              <p className="text-muted-foreground text-sm">Found: <span className="text-foreground font-mono">{checkResult.fullName}</span> (branch: {checkResult.defaultBranch})</p>
            ) : null}
            {actionErr ? <p className="text-destructive text-sm">{actionErr}</p> : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setConnectOpen(false)}>Cancel</Button>
            <Button type="button" disabled={busy || !checkResult || checkResult === 'missing'} onClick={() => void onLinkAndPush()}>Link and push</Button>
            <Button type="button" disabled={busy} onClick={() => void onCreateAndPush()}>Create repo and push</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New org dialog */}
      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>Door43 organization username (slug).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="new-org-user">Username (slug)</Label><Input id="new-org-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="my-org" className="font-mono" /></div>
            <div><Label htmlFor="new-org-fn">Display name (optional)</Label><Input id="new-org-fn" value={orgFullName} onChange={(e) => setOrgFullName(e.target.value)} /></div>
            <div><Label htmlFor="new-org-desc">Description (optional)</Label><Input id="new-org-desc" value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} /></div>
            {orgErr ? <p className="text-destructive text-sm">{orgErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOrgDialogOpen(false)}>Cancel</Button>
            <Button type="button" disabled={orgBusy || !username.trim()} onClick={() => void onCreateOrg()}>
              {orgBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Create organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
