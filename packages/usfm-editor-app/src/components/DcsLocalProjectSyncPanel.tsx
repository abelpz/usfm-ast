import { DcsLoginDialog } from '@/components/DcsLoginDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useLocalProjectSync } from '@/hooks/useLocalProjectSync';
import type { ProjectMeta, ProjectStorage, ProjectSyncConfig } from '@usfm-tools/types';
import { AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Props = {
  meta: ProjectMeta;
  storage: ProjectStorage;
  onUpdated: () => void;
};

export function DcsLocalProjectSyncPanel({ meta, storage, onUpdated }: Props) {
  const [creds, setCreds] = useState<DcsStoredCredentials | null>(() => loadDcsCredentials());

  // Sync hook — owns auto-push, dirty detection, online/offline retry, release publishing.
  const localSync = useLocalProjectSync(meta.id);

  const [mainOpen, setMainOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);

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

  const loadOrgs = useCallback(async () => {
    if (!creds?.token) return;
    const list = await listUserOrgs({ host: creds.host, token: creds.token });
    setOrgs(list);
  }, [creds?.host, creds?.token]);

  useEffect(() => {
    if (!mainOpen || !creds?.token) return;
    void loadOrgs().catch(() => setOrgs([]));
  }, [mainOpen, creds?.token, creds?.host, loadOrgs]);

  useEffect(() => {
    if (orgs.length === 0) return;
    if (!selectedOrg || !orgs.some((o) => o.username === selectedOrg)) {
      setSelectedOrg(orgs[0]!.username);
    }
  }, [orgs, selectedOrg]);

  useEffect(() => {
    if (mainOpen) {
      setRepoName(suggestedDoor43RepoName(meta));
      setCheckResult(null);
      setCheckErr(null);
      setActionErr(null);
    }
  }, [mainOpen, meta.id, meta.language]);

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
    if (!creds?.token) {
      setLoginOpen(true);
      return;
    }
    setCheckErr(null);
    setCheckResult(null);
    setBusy(true);
    try {
      const owner = await resolveOwner();
      const info = await getRepoInfo({
        host: creds.host,
        token: creds.token,
        owner,
        repo: repoName.trim().toLowerCase(),
      });
      setCheckResult(info ?? 'missing');
    } catch (e) {
      setCheckErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLinkAndPush() {
    if (!creds?.token) {
      setLoginOpen(true);
      return;
    }
    if (checkResult === null || checkResult === 'missing') {
      setActionErr('Check availability first and confirm the repository exists.');
      return;
    }
    setBusy(true);
    setActionErr(null);
    try {
      const owner = await resolveOwner();
      const sync: ProjectSyncConfig = {
        host: creds.host,
        owner,
        repo: repoName.trim().toLowerCase(),
        branch: checkResult.defaultBranch || 'main',
        targetType: targetType === 'org' ? 'org' : 'user',
      };
      const exists = await getRepoInfo({
        host: creds.host,
        token: creds.token,
        owner: sync.owner,
        repo: sync.repo,
      });
      if (!exists) throw new Error('Repository not found.');
      await storage.updateProject(meta.id, { syncConfig: sync });
      await pushLocalProjectToDcs({
        storage,
        projectId: meta.id,
        token: creds.token,
        sync,
      });
      await storage.updateProject(meta.id, {
        lastRemoteSyncAt: new Date().toISOString(),
      });
      setMainOpen(false);
      onUpdated();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateAndPush() {
    if (!creds?.token) {
      setLoginOpen(true);
      return;
    }
    setBusy(true);
    setActionErr(null);
    try {
      const owner = await resolveOwner();
      const name = repoName.trim().toLowerCase();
      const host = creds.host;
      const token = creds.token;
      const created =
        targetType === 'user'
          ? await createUserRepo({ host, token, name, private: false, autoInit: true })
          : await createOrgRepo({ host, token, org: owner, name, private: false, autoInit: true });
      const sync: ProjectSyncConfig = {
        host,
        owner,
        repo: name,
        branch: created.defaultBranch ?? 'main',
        targetType: targetType === 'org' ? 'org' : 'user',
      };
      await storage.updateProject(meta.id, { syncConfig: sync });
      await pushLocalProjectToDcs({ storage, projectId: meta.id, token, sync });
      await storage.updateProject(meta.id, {
        lastRemoteSyncAt: new Date().toISOString(),
      });
      setMainOpen(false);
      onUpdated();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateOrg() {
    if (!creds?.token) return;
    setOrgErr(null);
    setOrgBusy(true);
    try {
      const created = await createOrganization({
        host: creds.host,
        token: creds.token,
        username: username.trim().toLowerCase(),
        fullName: orgFullName.trim() || undefined,
        description: orgDescription.trim() || undefined,
        visibility: 'public',
      });
      await loadOrgs();
      setSelectedOrg(created.username);
      setTargetType('org');
      setOrgDialogOpen(false);
      setUsername('');
      setOrgFullName('');
      setOrgDescription('');
    } catch (e) {
      setOrgErr(e instanceof Error ? e.message : String(e));
    } finally {
      setOrgBusy(false);
    }
  }

  async function onForceSync() {
    if (!meta.syncConfig) return;
    if (!creds?.token) {
      setLoginOpen(true);
      return;
    }
    setActionErr(null);
    try {
      await localSync.forceSync();
      onUpdated();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDisconnect() {
    setBusy(true);
    try {
      await storage.updateProject(meta.id, {
        syncConfig: undefined,
        lastRemoteSyncAt: undefined,
      });
      await storage.setSyncShas(meta.id, {});
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  const sc = meta.syncConfig;

  return (
    <section className="border-border rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Sync to DCS</h2>
        {!sc ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => setMainOpen(true)}>
            Connect to Door43
          </Button>
        ) : null}
      </div>

      {sc ? (
        <div className="text-muted-foreground space-y-2 text-sm">
          <p>
            <span className="text-foreground font-medium">Target:</span>{' '}
            <span className="font-mono">
              {sc.host}/{sc.owner}/{sc.repo}
            </span>{' '}
            <span className="text-xs">({sc.branch})</span>
          </p>
          {localSync.lastSyncAt ?? meta.lastRemoteSyncAt ? (
            <p className="text-xs">
              Last push:{' '}
              {(localSync.lastSyncAt ?? meta.lastRemoteSyncAt)!.slice(0, 19).replace('T', ' ')} UTC
            </p>
          ) : (
            <p className="text-xs">No successful push recorded yet.</p>
          )}

          {/* Pending-sync warning shown when a previous push failed or device was offline. */}
          {meta.pendingSyncAt && !localSync.isSyncing ? (
            <p className="text-warning flex items-center gap-1 text-xs">
              <WifiOff className="size-3 shrink-0" aria-hidden />
              Sync pending — will retry on reconnect
            </p>
          ) : null}

          {/* Merge conflict alert — shown when auto-merge to book/main branch failed. */}
          {localSync.conflictPrUrl && !localSync.isSyncing ? (
            <p className="text-destructive flex items-center gap-1 text-xs">
              <AlertTriangle className="size-3 shrink-0" aria-hidden />
              Merge conflict —{' '}
              <a
                href={localSync.conflictPrUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                resolve on DCS
              </a>
              . Auto-merge will resume after the conflict is resolved.
            </p>
          ) : null}

          {/* Pending releases badge */}
          {localSync.pendingReleaseCount > 0 ? (
            <p className="text-xs">
              <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">
                {localSync.pendingReleaseCount} release{localSync.pendingReleaseCount > 1 ? 's' : ''} pending
                publish
              </span>
            </p>
          ) : null}

          {actionErr ? <p className="text-destructive text-xs">{actionErr}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={localSync.isSyncing}
              onClick={() => void onForceSync()}
            >
              {localSync.isSyncing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Force sync
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onDisconnect()}
            >
              Disconnect
            </Button>

            {/* Auto-sync toggle */}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5">
              <Checkbox
                id="auto-sync-toggle"
                checked={localSync.autoSync}
                onCheckedChange={(v) => localSync.setAutoSync(v === true)}
              />
              <span className="text-xs select-none">Auto-sync</span>
            </label>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Push this project to a Door43 (Gitea) repository. Auto-sync runs from the editor after you
          save.
        </p>
      )}

      <DcsLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        defaultHost={defaultHost}
        contextMessage="Sign in to link or create a Door43 repository for this project."
        onSuccess={(c) => {
          setCreds(c);
          setMainOpen(true);
        }}
      />

      <Dialog open={mainOpen} onOpenChange={setMainOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Connect project to Door43</DialogTitle>
            <DialogDescription>
              Repository name should follow <span className="font-mono">{`{language}_{id}`}</span> (e.g.{' '}
              <span className="font-mono">es-419_tpl</span>). If you see 403 Forbidden, sign out of Door43 in the editor
              and sign in again so your token includes organization permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!creds?.token ? (
              <p className="text-muted-foreground text-sm">
                <Button type="button" size="sm" variant="secondary" onClick={() => setLoginOpen(true)}>
                  Sign in to Door43
                </Button>
              </p>
            ) : null}

            <div className="space-y-2">
              <Label>Target</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={targetType === 'user' ? 'default' : 'outline'}
                  onClick={() => setTargetType('user')}
                >
                  Personal account
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={targetType === 'org' ? 'default' : 'outline'}
                  onClick={() => setTargetType('org')}
                >
                  Organization
                </Button>
              </div>
            </div>

            {targetType === 'org' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <Label htmlFor="dcs-org-pick">Organization</Label>
                    {orgs.length === 0 ? (
                      <p className="text-muted-foreground text-xs">No organizations found. Create one below.</p>
                    ) : (
                      <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                        <SelectTrigger id="dcs-org-pick">
                          <SelectValue placeholder="Choose organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {orgs.map((o) => (
                            <SelectItem key={o.username} value={o.username}>
                              {o.username}
                              {o.fullName ? ` — ${o.fullName}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setOrgDialogOpen(true)}>
                    New organization
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="dcs-repo-name">Repository name</Label>
              <Input
                id="dcs-repo-name"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className="font-mono"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onCheckAvailability()}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Check availability
              </Button>
            </div>

            {checkErr ? <p className="text-destructive text-sm">{checkErr}</p> : null}
            {checkResult === 'missing' ? (
              <p className="text-muted-foreground text-sm">No repository with this name under the selected owner.</p>
            ) : null}
            {checkResult && checkResult !== 'missing' ? (
              <p className="text-muted-foreground text-sm">
                Found: <span className="text-foreground font-mono">{checkResult.fullName}</span> (default branch:{' '}
                {checkResult.defaultBranch})
              </p>
            ) : null}

            {actionErr ? <p className="text-destructive text-sm">{actionErr}</p> : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setMainOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || checkResult === null || checkResult === 'missing'}
              onClick={() => void onLinkAndPush()}
            >
              Link and push
            </Button>
            <Button type="button" disabled={busy} onClick={() => void onCreateAndPush()}>
              Create repo and push
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>Door43 organization username (slug). You must have permission to create orgs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-org-user">Username (slug)</Label>
              <Input
                id="new-org-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="my-org"
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="new-org-fn">Display name (optional)</Label>
              <Input id="new-org-fn" value={orgFullName} onChange={(e) => setOrgFullName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="new-org-desc">Description (optional)</Label>
              <Input id="new-org-desc" value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} />
            </div>
            {orgErr ? <p className="text-destructive text-sm">{orgErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOrgDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={orgBusy || !username.trim()} onClick={() => void onCreateOrg()}>
              {orgBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Create organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
