import {
  createUserRepo,
  deleteToken,
  fetchAuthenticatedUser,
  listAuthenticatedUserRepos,
  listRepoContents,
  type Door43ContentEntry,
  type Door43RepoRow,
  type Door43UserInfo,
} from '@/dcs-client';
import {
  DCS_CREDS_KEY,
  DCS_TARGET_KEY,
  loadDcsCredentials,
  loadDcsTarget,
  type DcsStoredCredentials,
  type DcsStoredTarget,
} from '@/lib/dcs-storage';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { DcsLoginForm } from '@/components/DcsLoginForm';
import { FolderOpen, LogOut, Save } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DcsModal({ open, onOpenChange }: Props) {
  const [creds, setCreds] = useState<DcsStoredCredentials | null>(() => loadDcsCredentials());
  const [user, setUser] = useState<Door43UserInfo | null>(null);
  const [repos, setRepos] = useState<Door43RepoRow[]>([]);
  const [repoFilter, setRepoFilter] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<{
    owner: string;
    repo: string;
    fullName: string;
  } | null>(null);
  const [browsePath, setBrowsePath] = useState('');
  const [entries, setEntries] = useState<Door43ContentEntry[]>([]);

  const [branch, setBranch] = useState('main');
  const [usfmPath, setUsfmPath] = useState('');
  const [journalPath, setJournalPath] = useState('usfm-ast/journal.json');
  const [syncEnabled, setSyncEnabled] = useState(false);

  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refreshUser = useCallback(async (c: DcsStoredCredentials | null) => {
    if (!c) {
      setUser(null);
      return;
    }
    try {
      setUser(await fetchAuthenticatedUser({ host: c.host, token: c.token }));
    } catch {
      setUser(null);
    }
  }, []);

  const refreshRepos = useCallback(async (c: DcsStoredCredentials | null) => {
    if (!c) {
      setRepos([]);
      return;
    }
    try {
      const rows = await listAuthenticatedUserRepos({ host: c.host, token: c.token, limit: 100 });
      setRepos(rows);
    } catch {
      setRepos([]);
    }
  }, []);

  const refreshContents = useCallback(
    async (c: DcsStoredCredentials | null, repo: typeof selectedRepo, path: string, ref: string) => {
      if (!c || !repo) {
        setEntries([]);
        return;
      }
      try {
        const list = await listRepoContents({
          host: c.host,
          token: c.token,
          owner: repo.owner,
          repo: repo.repo,
          path: path || undefined,
          ref: ref || 'main',
        });
        setEntries(list);
      } catch {
        setEntries([]);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const c = loadDcsCredentials();
    const t = loadDcsTarget();
    setCreds(c);
    if (t) {
      setSelectedRepo({ owner: t.owner, repo: t.repo, fullName: `${t.owner}/${t.repo}` });
      setBrowsePath(t.usfmPath.includes('/') ? t.usfmPath.replace(/\/[^/]+$/, '') : '');
      setBranch(t.branch);
      setUsfmPath(t.usfmPath);
      setJournalPath(t.journalPath);
      setSyncEnabled(t.syncEnabled);
    } else {
      setSelectedRepo(null);
      setBrowsePath('');
      setBranch('main');
      setUsfmPath('');
      setJournalPath('usfm-ast/journal.json');
      setSyncEnabled(false);
    }
    void (async () => {
      if (!c) {
        setUser(null);
        setRepos([]);
        return;
      }
      try {
        const u = await fetchAuthenticatedUser({ host: c.host, token: c.token });
        setUser(u);
        await refreshRepos(c);
      } catch {
        localStorage.removeItem(DCS_CREDS_KEY);
        setCreds(null);
        setUser(null);
        setRepos([]);
      }
    })();
  }, [open, refreshRepos]);

  useEffect(() => {
    if (!open || !creds || !selectedRepo) return;
    void refreshContents(creds, selectedRepo, browsePath, branch);
  }, [open, creds, selectedRepo, browsePath, branch, refreshContents]);

  async function onLogout() {
    const c = creds;
    if (c?.tokenId !== undefined) {
      try {
        await deleteToken({
          host: c.host,
          username: c.username,
          token: c.token,
          tokenIdOrName: c.tokenId,
        });
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem(DCS_CREDS_KEY);
    localStorage.removeItem(DCS_TARGET_KEY);
    setCreds(null);
    setUser(null);
    setRepos([]);
    setSelectedRepo(null);
  }

  async function onCreateRepo() {
    setCreateErr(null);
    if (!creds || !newRepoName.trim()) return;
    try {
      const created = await createUserRepo({
        host: creds.host,
        token: creds.token,
        name: newRepoName.trim(),
        description: newRepoDesc.trim() || undefined,
        private: newRepoPrivate,
        autoInit: true,
      });
      const rows = await listAuthenticatedUserRepos({
        host: creds.host,
        token: creds.token,
        limit: 100,
      });
      setRepos(rows);
      const [co, ...crest] = created.fullName.split('/');
      setSelectedRepo({
        owner: co ?? creds.username,
        repo: crest.length ? crest.join('/') : created.name,
        fullName: created.fullName,
      });
      setBrowsePath('');
      setNewRepoName('');
      setNewRepoDesc('');
      setCreateOpen(false);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    }
  }

  function onSave() {
    if (!selectedRepo) {
      localStorage.removeItem(DCS_TARGET_KEY);
      onOpenChange(false);
      return;
    }
    if (!usfmPath.trim()) {
      window.alert('Select a USFM file in the repository (or enter path).');
      return;
    }
    const next: DcsStoredTarget = {
      owner: selectedRepo.owner,
      repo: selectedRepo.repo,
      branch: branch.trim() || 'main',
      usfmPath: usfmPath.trim(),
      journalPath: journalPath.trim() || 'usfm-ast/journal.json',
      syncEnabled,
    };
    localStorage.setItem(DCS_TARGET_KEY, JSON.stringify(next));
    window.location.reload();
  }

  const filteredRepos = repos.filter((r) =>
    repoFilter.trim() ? r.fullName.toLowerCase().includes(repoFilter.trim().toLowerCase()) : true,
  );

  const sortedEntries = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const defaultHost = creds?.host ?? loadDcsCredentials()?.host ?? 'git.door43.org';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-hidden sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Door43 / DCS</DialogTitle>
        </DialogHeader>

        {!creds ? (
          <DcsLoginForm
            key={open ? 'open' : 'closed'}
            idPrefix="dcs-modal-login"
            defaultHost={defaultHost}
            compact
            onSuccess={(next) => {
              setCreds(next);
              void (async () => {
                try {
                  const u = await fetchAuthenticatedUser({ host: next.host, token: next.token });
                  setUser(u);
                  await refreshRepos(next);
                } catch {
                  setUser(null);
                }
              })();
            }}
          />
        ) : (
          <ScrollArea className="max-h-[55vh] pr-4">
            <div className="flex flex-col gap-4">
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg border p-3">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="size-10 rounded-full" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {user?.fullName || user?.login || creds.username}
                  </div>
                  <div className="text-muted-foreground text-sm">@{user?.login || creds.username}</div>
                  <p className="text-muted-foreground mt-1 text-xs">Pick a repository, then choose a USFM file.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => void onLogout()}>
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </Button>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <FolderOpen className="size-4" aria-hidden />
                  Repository
                </h3>
                <Input
                  placeholder="Filter repos…"
                  value={repoFilter}
                  onChange={(e) => setRepoFilter(e.target.value)}
                  className="mb-2"
                />
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-1">
                  {filteredRepos.map((r) => (
                    <Button
                      key={r.fullName}
                      type="button"
                      variant={selectedRepo?.fullName === r.fullName ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-auto justify-start py-2 font-normal"
                      onClick={() => {
                        const [o, ...rest] = r.fullName.split('/');
                        if (!o) return;
                        setSelectedRepo({
                          owner: o,
                          repo: rest.join('/'),
                          fullName: r.fullName,
                        });
                        setBrowsePath('');
                      }}
                    >
                      {r.fullName}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedRepo ? (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">USFM file in repo</h3>
                    <div className="mb-2 grid gap-2">
                      <Label>Branch / ref</Label>
                      <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
                    </div>
                    <p className="text-muted-foreground mb-2 font-mono text-xs">
                      {browsePath ? `/${browsePath}` : '/ (root)'}
                    </p>
                    <div className="mb-2 flex max-h-36 flex-col gap-1 overflow-y-auto rounded-md border p-1">
                      {browsePath ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-start font-normal"
                          onClick={() => {
                            const parts = browsePath.split('/').filter(Boolean);
                            parts.pop();
                            setBrowsePath(parts.join('/'));
                          }}
                        >
                          .. (up)
                        </Button>
                      ) : null}
                      {sortedEntries.map((ent) => (
                        <Button
                          key={ent.path}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto justify-start py-1.5 font-normal"
                          onClick={() => {
                            if (ent.type === 'dir') {
                              setBrowsePath(ent.path);
                              return;
                            }
                            const lower = ent.name.toLowerCase();
                            if (lower.endsWith('.usfm') || lower.endsWith('.sfm') || lower.endsWith('.txt')) {
                              setUsfmPath(ent.path);
                            }
                          }}
                        >
                          {ent.type === 'dir' ? `📁 ${ent.name}/` : ent.name}
                        </Button>
                      ))}
                    </div>
                    <div className="grid gap-2">
                      <Label>Selected USFM path</Label>
                      <Input value={usfmPath} readOnly className="font-mono text-xs" />
                    </div>
                  </div>
                </>
              ) : null}

              <details className="rounded-lg border">
                <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-sm font-medium">
                  Advanced: sync &amp; new repo
                </summary>
                <div className="space-y-4 border-t px-3 py-3">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Sync</h3>
                    <div className="grid gap-2">
                      <Label>Journal file path (JSON)</Label>
                      <Input value={journalPath} onChange={(e) => setJournalPath(e.target.value)} />
                    </div>
                    <label className="mt-2 flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={syncEnabled}
                        onCheckedChange={(v) => setSyncEnabled(v === true)}
                        className="mt-0.5"
                      />
                      <span>
                        Enable DCS journal + snapshot sync (reload required). Use <strong>Collaborate</strong> for
                        realtime.
                      </span>
                    </label>
                  </div>
                  <Separator />
                  <details className="mt-1" open={createOpen} onToggle={(e) => setCreateOpen(e.currentTarget.open)}>
                    <summary className="text-muted-foreground cursor-pointer text-sm">Create new repository</summary>
                    <div className="mt-2 grid gap-2">
                      <Input
                        placeholder="Name"
                        value={newRepoName}
                        onChange={(e) => setNewRepoName(e.target.value)}
                      />
                      <Input
                        placeholder="Description"
                        value={newRepoDesc}
                        onChange={(e) => setNewRepoDesc(e.target.value)}
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={newRepoPrivate}
                          onCheckedChange={(v) => setNewRepoPrivate(v === true)}
                        />
                        Private
                      </label>
                      {createErr ? <p className="text-destructive text-sm">{createErr}</p> : null}
                      <Button type="button" size="sm" onClick={() => void onCreateRepo()}>
                        Create
                      </Button>
                    </div>
                  </details>
                </div>
              </details>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {creds ? (
            <Button type="button" className="gap-2" onClick={onSave}>
              <Save className="size-4" aria-hidden />
              Save &amp; reload
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
