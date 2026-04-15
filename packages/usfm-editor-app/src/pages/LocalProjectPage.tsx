import { BookCombobox, type BookComboRow } from '@/components/BookCombobox';
import { DcsSyncButton } from '@/components/DcsSyncButton';
import { Tip } from '@/components/Tip';
import { Button } from '@/components/ui/button';
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
import { Checkbox } from '@/components/ui/checkbox';
import { getProjectStorage } from '@/lib/project-storage';
import type { ProjectLaunchConfig } from '@/lib/project-launch';
import { blankUsfmForBook } from '@/lib/usfm-project';
import { USFM_BOOK_CODES } from '@usfm-tools/editor';
import {
  listRCBooks,
  parseResourceContainer,
  serializeResourceContainer,
  type ResourceContainerManifest,
} from '@usfm-tools/project-formats';
import type { ProjectMeta, ProjectRelease } from '@usfm-tools/types';
import { useLocalProjectSync } from '@/hooks/useLocalProjectSync';
import { cn } from '@/lib/utils';
import { ArrowLeft, BookOpen, Circle, Loader2, Plus, Tag } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const VERSION_RE = /^v\d+(\.\d+){0,2}$/;

function bookSortIndex(code: string): number {
  const i = USFM_BOOK_CODES.findIndex(([c]) => c === code);
  return i >= 0 ? i + 1 : 1000;
}

function latestReleaseLabelForBook(releases: ProjectRelease[], bookCode: string): string | null {
  const sorted = [...releases].sort((a, b) => b.created.localeCompare(a.created));
  for (const r of sorted) {
    if (r.books.map((b) => b.toUpperCase()).includes(bookCode.toUpperCase())) {
      return r.versionLabel ? `${r.version} (${r.versionLabel})` : r.version;
    }
  }
  return null;
}

/**
 * Extract the human-readable book title from a USFM document.
 * Priority: \h > \toc2 > \toc1 (the first non-empty match wins).
 */
function extractUsfmTitle(usfm: string): string | null {
  const markers = [/^\\h\s+(.+)/m, /^\\toc2\s+(.+)/m, /^\\toc1\s+(.+)/m];
  for (const re of markers) {
    const m = usfm.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

export function LocalProjectPage() {
  const { id: projectId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const storage = useMemo(() => getProjectStorage(), []);

  const localSync = useLocalProjectSync(projectId || undefined);

  const [tab, setTab] = useState<'books' | 'releases'>('books');

  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [books, setBooks] = useState<{ code: string; name: string; path: string }[]>([]);
  /** USFM-derived titles keyed by book code (loaded async after books are known). */
  const [usfmTitles, setUsfmTitles] = useState<Record<string, string>>({});
  const [releases, setReleases] = useState<ProjectRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addPick, setAddPick] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [relOpen, setRelOpen] = useState(false);
  const [relVersion, setRelVersion] = useState('v1.0.0');
  const [relLabel, setRelLabel] = useState('');
  const [relTitle, setRelTitle] = useState('');
  const [relBooks, setRelBooks] = useState<Record<string, boolean>>({});
  const [relBusy, setRelBusy] = useState(false);
  const [relErr, setRelErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId.trim()) {
      setErr('Missing project id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const m = await storage.getProject(projectId.trim());
      if (!m) {
        setMeta(null);
        setBooks([]);
        setErr('Project not found.');
        return;
      }
      setMeta(m);
      const yaml = await storage.readFile(projectId.trim(), 'manifest.yaml');
      if (!yaml) {
        setBooks([]);
        setErr('manifest.yaml is missing.');
      } else {
        const rc = parseResourceContainer(yaml);
        setBooks(listRCBooks(rc));
      }
      setReleases(await storage.listReleases(projectId.trim()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, storage]);

  useEffect(() => {
    void load();
  }, [load]);

  // Asynchronously read each book's USFM file and extract the translated title.
  useEffect(() => {
    if (!books.length || !projectId) return;
    let cancelled = false;
    void (async () => {
      const titles: Record<string, string> = {};
      for (const b of books) {
        try {
          const usfm = await storage.readFile(projectId, b.path);
          if (usfm && !cancelled) {
            const t = extractUsfmTitle(usfm);
            if (t) titles[b.code] = t;
          }
        } catch {
          // Non-critical — fall back to manifest name
        }
      }
      if (!cancelled) setUsfmTitles(titles);
    })();
    return () => { cancelled = true; };
  }, [books, projectId, storage]);

  const existingCodes = useMemo(() => new Set(books.map((b) => b.code.toUpperCase())), [books]);

  const addBookCandidates: BookComboRow[] = useMemo(
    () =>
      USFM_BOOK_CODES.filter(([c]) => !existingCodes.has(c)).map(([code, name]) => ({
        code,
        name,
        path: code,
      })),
    [existingCodes],
  );

  async function onAddBook() {
    if (!meta || !addPick) return;
    const code = addPick.toUpperCase();
    const row = USFM_BOOK_CODES.find(([c]) => c === code);
    const displayName = row?.[1] ?? code;
    setAddBusy(true);
    try {
      const yaml = await storage.readFile(meta.id, 'manifest.yaml');
      if (!yaml) throw new Error('manifest.yaml not found');
      const manifest: ResourceContainerManifest = parseResourceContainer(yaml);
      const sort = bookSortIndex(code);
      const path = `${String(sort).padStart(2, '0')}-${code}.usfm`;
      const usfm = blankUsfmForBook(code, displayName);
      await storage.writeFile(meta.id, path, usfm);
      const nextProjects = [...(manifest.projects ?? [])];
      nextProjects.push({ identifier: code, title: displayName, path: `./${path}`, sort });
      manifest.projects = nextProjects;
      await storage.writeFile(meta.id, 'manifest.yaml', serializeResourceContainer(manifest));
      setAddOpen(false);
      setAddPick(null);
      await load();
      const launch: ProjectLaunchConfig = {
        initialUsfm: usfm,
        skipPersistedDcsInitialFetch: true,
        sourceLanguage: meta.sourceRefLanguage ?? undefined,
        openReferencePanel: true,
        localProject: { projectId: meta.id, bookCode: code, mode: 'translate' },
        projectMeta: { name: `${meta.name} — ${code}`, bookCode: code, source: 'local' },
      };
      navigate(`/project/${encodeURIComponent(meta.id)}/editor`, { state: launch });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAddBusy(false);
    }
  }

  function openBook(book: { code: string; name: string }) {
    if (!meta) return;
    const usfm = blankUsfmForBook(book.code, book.name);
    navigate(`/project/${encodeURIComponent(meta.id)}/editor`, {
      state: {
        initialUsfm: usfm,
        skipPersistedDcsInitialFetch: true,
        sourceLanguage: meta.sourceRefLanguage ?? undefined,
        openReferencePanel: true,
        localProject: { projectId: meta.id, bookCode: book.code, mode: 'translate' },
        projectMeta: { name: `${meta.name} — ${book.code}`, bookCode: book.code, source: 'local' },
      } satisfies ProjectLaunchConfig,
    });
  }

  function openReleaseDialog() {
    if (books.length === 0) return;
    const init: Record<string, boolean> = {};
    for (const b of books) init[b.code] = true;
    setRelBooks(init);
    setRelVersion('v1.0.0');
    setRelLabel('');
    setRelTitle('');
    setRelErr(null);
    setRelOpen(true);
  }

  async function submitRelease() {
    if (!meta) return;
    const v = relVersion.trim();
    if (!VERSION_RE.test(v)) { setRelErr('Version must look like v1, v1.0, or v1.0.0'); return; }
    if (releases.some((r) => r.version === v)) { setRelErr('A release with this version already exists.'); return; }
    const picked = books.filter((b) => relBooks[b.code]).map((b) => b.code);
    if (picked.length === 0) { setRelErr('Select at least one book.'); return; }
    setRelBusy(true);
    setRelErr(null);
    try {
      const rel: ProjectRelease = {
        version: v,
        versionLabel: relLabel.trim() || undefined,
        title: relTitle.trim() || undefined,
        created: new Date().toISOString(),
        books: picked,
      };
      await storage.createRelease(meta.id, rel);
      setRelOpen(false);
      await load();
    } catch (e) {
      setRelErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRelBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-background text-foreground flex min-h-dvh items-center justify-center gap-2">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <span className="text-muted-foreground text-sm">Loading project…</span>
      </div>
    );
  }

  if (!meta && err) {
    return (
      <div className="bg-background text-foreground flex min-h-dvh flex-col gap-4 p-6">
        <Link to="/" className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Home
        </Link>
        <p className="text-destructive">{err}</p>
      </div>
    );
  }

  if (!meta) return null;

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Tip label="Home" side="right">
            <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
              <Link to="/" aria-label="Home">
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            </Button>
          </Tip>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{meta.name}</h1>
            <p className="text-muted-foreground text-xs">
              <span className="font-mono">{meta.id}</span>
              {' · '}
              {meta.language}
            </p>
          </div>
        </div>
        <DcsSyncButton meta={meta} storage={storage} localSync={localSync} onUpdated={() => void load()} />
      </header>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="border-border border-b px-4">
        <nav className="-mb-px flex gap-1" aria-label="Project sections">
          {(
            [
              { key: 'books', label: 'Books', icon: BookOpen, count: books.length },
              { key: 'releases', label: 'Releases', icon: Tag, count: releases.length },
            ] as const
          ).map(({ key, label, icon: Icon, count }) => (
            <Tip key={key} label={label} side="bottom">
              <button
                type="button"
                onClick={() => setTab(key)}
                aria-label={label}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  tab === key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs',
                    tab === key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            </Tip>
          ))}
        </nav>
      </div>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4">
        {err ? <p className="text-destructive text-sm">{err}</p> : null}

        {/* Books tab */}
        {tab === 'books' ? (
          <section>
            <div className="mb-3 flex items-center justify-end gap-2">
              <Tip label="Add book">
                <Button type="button" size="icon" className="size-8" onClick={() => setAddOpen(true)} aria-label="Add book">
                  <Plus className="size-4" aria-hidden />
                </Button>
              </Tip>
            </div>
            {books.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No books yet. Add a book to start translating.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {books.map((b) => {
                  const rel = latestReleaseLabelForBook(releases, b.code);
                  // Prefer title extracted from the USFM document, fall back to manifest name.
                  const displayName = usfmTitles[b.code] ?? b.name;
                  return (
                    <li key={b.code}>
                      <button
                        type="button"
                        onClick={() => openBook(b)}
                        className="border-border bg-card hover:bg-accent/40 flex w-full aspect-[2/3] flex-col justify-between rounded-lg border p-3 text-left shadow-sm transition-colors"
                      >
                        <span className="font-mono text-[10px] font-semibold text-muted-foreground leading-none">
                          {b.code}
                        </span>
                        <span className="text-foreground font-bold text-base leading-snug line-clamp-3 text-center w-full">
                          {displayName}
                        </span>
                        {rel ? (
                          <span className="flex items-center gap-0.5 text-muted-foreground text-[10px] leading-none">
                            <Tag className="size-2.5 shrink-0" aria-hidden />
                            {rel}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground text-[10px] leading-none">
                            <Circle className="size-1.5 shrink-0 fill-muted-foreground/40 text-muted-foreground/40" aria-hidden />
                            Draft
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {/* Releases tab */}
        {tab === 'releases' ? (
          <section>
            <div className="mb-3 flex items-center justify-end gap-2">
              <Tip label="Create release">
                <Button
                  type="button"
                  size="icon"
                  className="size-8"
                  variant="secondary"
                  disabled={books.length === 0}
                  onClick={openReleaseDialog}
                  aria-label="Create release"
                >
                  <Tag className="size-4" aria-hidden />
                </Button>
              </Tip>
            </div>
            {releases.length === 0 ? (
              <p className="text-muted-foreground text-sm">No releases recorded yet.</p>
            ) : (
              <ul className="border-border divide-y rounded-md border text-sm">
                {releases.map((r) => (
                  <li key={r.version} className="flex flex-col gap-0.5 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Tag className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
                      <span className="font-medium">
                        {r.version}
                        {r.versionLabel ? (
                          <span className="text-muted-foreground font-normal"> · {r.versionLabel}</span>
                        ) : null}
                      </span>
                    </div>
                    {r.title ? (
                      <span className="text-muted-foreground text-xs pl-5">{r.title}</span>
                    ) : null}
                    <span className="text-muted-foreground text-xs pl-5">
                      {r.books.map((code) => usfmTitles[code] ?? code).join(', ')} — {r.created.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </main>

      {/* ── Add book dialog ─────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Add book</DialogTitle>
            <DialogDescription>
              Choose a book to add to this project. You will open it in the editor.
            </DialogDescription>
          </DialogHeader>
          <BookCombobox
            idPrefix="local-add"
            books={addBookCandidates}
            valuePath={addPick}
            onChangePath={setAddPick}
            disabled={addBusy}
            fillListHeight
            className="max-h-64"
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!addPick || addBusy}
              className="gap-2"
              onClick={() => void onAddBook()}
            >
              {addBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <BookOpen className="size-4" aria-hidden />
              )}
              Add and open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create release dialog ───────────────────────────────── */}
      <Dialog open={relOpen} onOpenChange={setRelOpen}>
        <DialogContent showCloseButton className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create release</DialogTitle>
            <DialogDescription>
              Record a version label and which books are included.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="rel-ver">Version (required)</Label>
              <Input
                id="rel-ver"
                value={relVersion}
                onChange={(e) => setRelVersion(e.target.value)}
                placeholder="v1.0.0"
              />
            </div>
            <div>
              <Label htmlFor="rel-lab">Publishing label (optional, 2–4 chars)</Label>
              <Input
                id="rel-lab"
                value={relLabel}
                onChange={(e) => setRelLabel(e.target.value)}
                placeholder="1960"
                maxLength={4}
              />
            </div>
            <div>
              <Label htmlFor="rel-title">Title (optional)</Label>
              <Input
                id="rel-title"
                value={relTitle}
                onChange={(e) => setRelTitle(e.target.value)}
                placeholder="Release title"
              />
            </div>
            <div className="space-y-2">
              <Label>Books in this release</Label>
              {books.map((b) => (
                <label key={b.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={relBooks[b.code] ?? false}
                    onCheckedChange={(c) =>
                      setRelBooks((prev) => ({ ...prev, [b.code]: c === true }))
                    }
                  />
                  <span>
                    {usfmTitles[b.code] ?? b.name}
                    <span className="text-muted-foreground ml-1 font-mono text-xs">({b.code})</span>
                  </span>
                </label>
              ))}
            </div>
            {relErr ? <p className="text-destructive text-sm">{relErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setRelOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={relBusy} onClick={() => void submitRelease()}>
              {relBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
