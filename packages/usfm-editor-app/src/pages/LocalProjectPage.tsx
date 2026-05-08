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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { getProjectStorage } from '@/lib/project-storage';
import {
  downloadUsfmFileInBrowser,
  importSingleBookUsfmFile,
  readBookUsfmForExport,
} from '@/lib/book-usfm-handoff';
import { blankUsfmForBook, extractUsfmTitle } from '@/lib/usfm-project';
import { getLocalizedBookName, preloadBookNames } from '@/lib/book-names-locale';
import { USFM_BOOK_CODES } from '@usfm-tools/editor';
import {
  listRCBooks,
  listSBBooks,
  parseResourceContainer,
  parseScriptureBurrito,
  serializeResourceContainer,
  type ResourceContainerManifest,
} from '@usfm-tools/project-formats';
import type { ProjectMeta, ProjectRelease } from '@usfm-tools/types';
import { useLocalProjectSync } from '@/hooks/useLocalProjectSync';
import { cn } from '@/lib/utils';
import { newBookCodesFromSnapshot, newPathsFromSnapshot } from '@/lib/bundle-import-snapshot';
import { restoreBundleImportSnapshot } from '@/lib/bundle-import-rollback';
import {
  conflictsForBook,
  resolveAllConflictsForBook,
  resolveAllPendingConflicts,
} from '@/lib/file-conflict-helpers';
import { ProjectBundleControls } from '@/components/ProjectBundleControls';
import { PeerSyncPanel } from '@/components/PeerSyncPanel';
import { ArrowLeft, BookOpen, Check, Circle, FileDown, FileText, FileUp, Loader2, Plus, Tag, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function LocalProjectPage() {
  const { id: projectId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const storage = useMemo(() => getProjectStorage(), []);

  const localSync = useLocalProjectSync(projectId || undefined);

  const [tab, setTab] = useState<'books' | 'releases' | 'settings'>('books');

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
  const [bookNamesReady, setBookNamesReady] = useState(false);

  const [relOpen, setRelOpen] = useState(false);
  const [relVersion, setRelVersion] = useState('v1.0.0');
  const [relLabel, setRelLabel] = useState('');
  const [relTitle, setRelTitle] = useState('');
  const [relBooks, setRelBooks] = useState<Record<string, boolean>>({});
  const [relBusy, setRelBusy] = useState(false);
  const [relErr, setRelErr] = useState<string | null>(null);

  const bookImportInputRef = useRef<HTMLInputElement>(null);
  const [bookImportBusy, setBookImportBusy] = useState(false);
  const [bookHandoffMsg, setBookHandoffMsg] = useState<string | null>(null);

  const [readmeDraft, setReadmeDraft] = useState('');
  const [licenseDraft, setLicenseDraft] = useState('');
  /** Which license file exists or should be written on save. */
  const [licensePath, setLicensePath] = useState<'LICENSE' | 'LICENSE.md'>('LICENSE');
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [readmeSaving, setReadmeSaving] = useState(false);
  const [licenseSaving, setLicenseSaving] = useState(false);

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
      if (yaml) {
        const rc = parseResourceContainer(yaml);
        setBooks(listRCBooks(rc));
      } else {
        const md = await storage.readFile(projectId.trim(), 'metadata.json');
        if (md) {
          try {
            const sb = parseScriptureBurrito(JSON.parse(md) as unknown);
            setBooks(listSBBooks(sb));
          } catch {
            setBooks([]);
            setErr('metadata.json could not be parsed.');
          }
        } else {
          setBooks([]);
          setErr('manifest.yaml or metadata.json is required.');
        }
      }
      setReleases(await storage.listReleases(projectId.trim()));
      const readme = await storage.readFile(projectId.trim(), 'README.md');
      setReadmeDraft(readme ?? '');
      const lic = await storage.readFile(projectId.trim(), 'LICENSE');
      const licMd = await storage.readFile(projectId.trim(), 'LICENSE.md');
      if (lic !== null) {
        setLicenseDraft(lic);
        setLicensePath('LICENSE');
      } else if (licMd !== null) {
        setLicenseDraft(licMd);
        setLicensePath('LICENSE.md');
      } else {
        setLicenseDraft('');
        setLicensePath('LICENSE');
      }
      setSettingsErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, storage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void preloadBookNames().then(() => setBookNamesReady(true));
  }, []);

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

  const newBookCodes = useMemo(() => newBookCodesFromSnapshot(meta, books), [meta, books]);
  const newFileCountFromImport = useMemo(() => newPathsFromSnapshot(meta).length, [meta]);

  const lc = meta?.sourceRefLanguage ?? meta?.language ?? 'en';

  const addBookCandidates: BookComboRow[] = useMemo(
    () =>
      USFM_BOOK_CODES.filter(([c]) => !existingCodes.has(c)).map(([code, englishName]) => ({
        code,
        name: bookNamesReady ? getLocalizedBookName(lc, code, englishName) : englishName,
        path: code,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existingCodes, lc, bookNamesReady],
  );

  async function onAddBook() {
    if (!meta || !addPick) return;
    const code = addPick.toUpperCase();
    const row = USFM_BOOK_CODES.find(([c]) => c === code);
    const englishName = row?.[1] ?? code;
    const displayName = getLocalizedBookName(lc, code, englishName);
    setAddBusy(true);
    try {
      const yaml = await storage.readFile(meta.id, 'manifest.yaml');
      if (!yaml) throw new Error('manifest.yaml not found (add book requires a Resource Container manifest).');
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
      navigate(`/project/${encodeURIComponent(meta.id)}/book/${encodeURIComponent(code)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAddBusy(false);
    }
  }

  function goToBookTools(book: { code: string }) {
    if (!meta) return;
    navigate(`/project/${encodeURIComponent(meta.id)}/book/${encodeURIComponent(book.code)}`);
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

  async function saveReadme() {
    if (!meta) return;
    setReadmeSaving(true);
    setSettingsErr(null);
    try {
      await storage.writeFile(meta.id, 'README.md', readmeDraft);
      const updated = new Date().toISOString();
      await storage.updateProject(meta.id, { updated });
      setMeta((m) => (m ? { ...m, updated } : null));
      localSync.notifyChange();
    } catch (e) {
      setSettingsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setReadmeSaving(false);
    }
  }

  async function saveLicense() {
    if (!meta) return;
    setLicenseSaving(true);
    setSettingsErr(null);
    try {
      await storage.writeFile(meta.id, licensePath, licenseDraft);
      const updated = new Date().toISOString();
      await storage.updateProject(meta.id, { updated });
      setMeta((m) => (m ? { ...m, updated } : null));
      localSync.notifyChange();
    } catch (e) {
      setSettingsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLicenseSaving(false);
    }
  }

  const pendingConflicts = meta?.pendingConflicts ?? [];

  const onDownloadBookUsfm = useCallback(
    async (b: { path: string; code: string }) => {
      if (!meta) return;
      setBookHandoffMsg(null);
      setErr(null);
      try {
        const { content, filename } = await readBookUsfmForExport({
          storage,
          projectId: meta.id,
          path: b.path,
        });
        downloadUsfmFileInBrowser(filename, content);
        setBookHandoffMsg('Book file downloaded.');
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [meta, storage],
  );

  const onPickBookUsfmFile = useCallback(() => {
    setBookHandoffMsg(null);
    bookImportInputRef.current?.click();
  }, []);

  const onBookUsfmFileChange = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file || !meta) return;
      setBookImportBusy(true);
      setErr(null);
      setBookHandoffMsg(null);
      try {
        const text = await file.text();
        const { conflicts } = await importSingleBookUsfmFile({
          storage,
          projectId: meta.id,
          text,
          enableMerge: true,
        });
        if (conflicts.length > 0) {
          const cur = await storage.getProject(meta.id);
          const prev = cur?.pendingConflicts ?? [];
          const touched = new Set(conflicts.map((c) => c.path));
          const merged = [...prev.filter((c) => !touched.has(c.path)), ...conflicts];
          await storage.updateProject(meta.id, { pendingConflicts: merged });
          setBookHandoffMsg('Review the conflict in the editor, then continue.');
        } else {
          setBookHandoffMsg('Book file imported.');
        }
        await load();
        localSync.notifyChange();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBookImportBusy(false);
      }
    },
    [meta, storage, load, localSync],
  );

  const resolveBookConflicts = useCallback(
    async (bookCode: string, side: 'ours' | 'theirs') => {
      if (!meta) return;
      try {
        await resolveAllConflictsForBook(storage, meta.id, pendingConflicts, bookCode, side);
        await load();
        localSync.notifyChange();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [meta, pendingConflicts, storage, load, localSync],
  );

  const rollbackBundleImport = useCallback(async () => {
    if (!meta?.bundleImportSnapshot) return;
    const ok = window.confirm(
      'Restore all project files to how they were before the last bundle import? Pending conflict choices will be cleared.',
    );
    if (!ok) return;
    try {
      await restoreBundleImportSnapshot(storage, meta.id);
      await load();
      localSync.notifyChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [meta?.bundleImportSnapshot, meta?.id, storage, load, localSync]);

  const dismissImportSnapshot = useCallback(async () => {
    if (!meta?.bundleImportSnapshot) return;
    try {
      await storage.updateProject(meta.id, { bundleImportSnapshot: undefined });
      await load();
      localSync.notifyChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [meta?.bundleImportSnapshot, meta?.id, storage, load, localSync]);

  const discardAllConflicts = useCallback(async () => {
    if (!meta || pendingConflicts.length === 0) return;
    const ok = window.confirm(
      'Discard all incoming changes and keep your local version for every conflicted file? This cannot be undone.',
    );
    if (!ok) return;
    try {
      await resolveAllPendingConflicts(storage, meta.id, 'ours');
      await load();
      localSync.notifyChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [meta, pendingConflicts.length, storage, load, localSync]);

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
            {meta.syncConfig ? (
              <p className="text-muted-foreground mt-0.5 font-mono text-[11px] break-all">
                Door43: {meta.syncConfig.host}/{meta.syncConfig.owner}/{meta.syncConfig.repo}@{meta.syncConfig.branch}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {pendingConflicts.length > 0 ? (
            <Tip label="Discard all incoming (keep local)">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-8 text-amber-600 dark:text-amber-400"
                aria-label="Discard all incoming changes, keep local"
                onClick={() => void discardAllConflicts()}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </Tip>
          ) : (
            <ProjectBundleControls
              projectId={projectId.trim()}
              onImported={() => void load()}
              variant="header"
              actionsAlign="end"
            />
          )}
          {meta.bundleImportSnapshot ? (
            <Tip label="Restore files before import">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-8"
                aria-label="Restore files before import"
                onClick={() => void rollbackBundleImport()}
              >
                <Undo2 className="size-4" aria-hidden />
              </Button>
            </Tip>
          ) : null}
          <DcsSyncButton meta={meta} storage={storage} localSync={localSync} onUpdated={() => void load()} />
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="border-border border-b px-4">
        <nav className="-mb-px flex gap-1" aria-label="Project sections">
          {(
            [
              { key: 'books', label: 'Books', icon: BookOpen, count: books.length },
              { key: 'releases', label: 'Releases', icon: Tag, count: releases.length },
              { key: 'settings', label: 'Settings', icon: FileText },
            ] as const
          ).map((item) => {
            const { key, label, icon: Icon } = item;
            const count = 'count' in item ? item.count : undefined;
            return (
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
                {typeof count === 'number' ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs',
                    tab === key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
                ) : null}
              </button>
            </Tip>
            );
          })}
        </nav>
      </div>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4">
        {err ? <p className="text-destructive text-sm">{err}</p> : null}
        {bookHandoffMsg ? (
          <p className="text-muted-foreground text-sm" role="status">
            {bookHandoffMsg}
          </p>
        ) : null}

        {newFileCountFromImport > 0 ? (
          <div
            className="border-border bg-sky-50/80 dark:bg-sky-950/25 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
            role="status"
          >
            <span className="text-foreground">
              Last import added {newFileCountFromImport} new file
              {newFileCountFromImport === 1 ? '' : 's'}.
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => void dismissImportSnapshot()}>
              Dismiss
            </Button>
          </div>
        ) : null}

        {/* Books tab */}
        {tab === 'books' ? (
          <section>
            <div className="mb-3 flex items-center justify-end gap-2">
              <input
                ref={bookImportInputRef}
                type="file"
                accept=".usfm,.sfm,.txt,text/plain"
                className="sr-only"
                onChange={onBookUsfmFileChange}
              />
              <Tip label="Add or update from a book file">
                <Button
                  type="button"
                  size="icon"
                  className="size-8"
                  onClick={onPickBookUsfmFile}
                  disabled={bookImportBusy}
                  aria-label="Add or update from a book file"
                >
                  {bookImportBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FileUp className="size-4" aria-hidden />
                  )}
                </Button>
              </Tip>
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
                  const bookConflicts = conflictsForBook(pendingConflicts, b.code);
                  const hasBookConflict = bookConflicts.length > 0;
                  const showNewFromImportDot = !hasBookConflict && newBookCodes.has(b.code);
                  return (
                    <li key={b.code} className="flex flex-col">
                      <div
                        className={cn(
                          'border-border bg-card flex w-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border shadow-sm transition-colors',
                          hasBookConflict ? 'ring-1 ring-red-500/40' : '',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => goToBookTools(b)}
                          className="hover:bg-accent/40 flex aspect-[2/3] min-h-0 w-full flex-col justify-between p-3 text-left transition-colors"
                        >
                          <span className="flex items-start justify-between gap-1">
                            <span className="font-mono text-[10px] font-semibold leading-none text-muted-foreground">
                              {b.code}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {hasBookConflict ? (
                                <span
                                  className="size-2 shrink-0 rounded-full bg-red-500"
                                  title="Unresolved conflicts in this book"
                                  aria-hidden
                                />
                              ) : null}
                              {showNewFromImportDot ? (
                                <Tip label="New from last import" side="top">
                                  <span
                                    className="size-2 shrink-0 rounded-full bg-sky-500"
                                    aria-label="New from last import"
                                  />
                                </Tip>
                              ) : null}
                            </span>
                          </span>
                          <span className="text-foreground line-clamp-3 w-full text-center text-base font-bold leading-snug">
                            {displayName}
                          </span>
                          {rel ? (
                            <span className="flex items-center gap-0.5 text-[10px] leading-none text-muted-foreground">
                              <Tag className="size-2.5 shrink-0" aria-hidden />
                              {rel}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
                              <Circle className="size-1.5 shrink-0 fill-muted-foreground/40 text-muted-foreground/40" aria-hidden />
                              Draft
                            </span>
                          )}
                        </button>
                        <div
                          className="border-border flex items-center justify-center border-t bg-muted/20 px-1 py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tip label="Download USFM file" side="top">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-muted-foreground"
                              aria-label="Download USFM file"
                              onClick={() => void onDownloadBookUsfm(b)}
                            >
                              <FileDown className="size-4" aria-hidden />
                            </Button>
                          </Tip>
                        </div>
                        {hasBookConflict ? (
                          <div
                            className="border-border flex items-center justify-center gap-0.5 border-t bg-muted/30 px-1 py-1"
                            onClick={(e) => e.stopPropagation()}
                            role="group"
                            aria-label="Resolve whole book"
                          >
                            <Tip label="Use imported text for this book" side="top">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 text-emerald-700 dark:text-emerald-400"
                                aria-label="Use imported text for this book"
                                onClick={() => void resolveBookConflicts(b.code, 'theirs')}
                              >
                                <Check className="size-4" aria-hidden />
                              </Button>
                            </Tip>
                            <Tip label="Keep local text for this book" side="top">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground"
                                aria-label="Keep local text for this book"
                                onClick={() => void resolveBookConflicts(b.code, 'ours')}
                              >
                                <Undo2 className="size-4" aria-hidden />
                              </Button>
                            </Tip>
                          </div>
                        ) : null}
                      </div>
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

        {/* Settings tab */}
        {tab === 'settings' ? (
          <section className="flex flex-col gap-6">
            <p className="text-muted-foreground text-sm">
              Edit repository documentation. Default license for new projects is CC BY-SA 4.0 (common for Door43 scripture
              resources). Full legal text:{' '}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/legalcode"
                className="text-primary underline"
                target="_blank"
                rel="noreferrer"
              >
                creativecommons.org
              </a>
              .
            </p>
            {settingsErr ? <p className="text-destructive text-sm">{settingsErr}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="proj-readme">README.md</Label>
              <Textarea
                id="proj-readme"
                rows={12}
                value={readmeDraft}
                onChange={(e) => setReadmeDraft(e.target.value)}
                className="font-mono text-sm"
                spellCheck
              />
              <Button type="button" size="sm" disabled={readmeSaving} onClick={() => void saveReadme()}>
                {readmeSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Save README
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-license">
                {licensePath}
                {licensePath === 'LICENSE.md' ? ' (Markdown)' : ''}
              </Label>
              <Textarea
                id="proj-license"
                rows={14}
                value={licenseDraft}
                onChange={(e) => setLicenseDraft(e.target.value)}
                className="font-mono text-sm"
                spellCheck={false}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" disabled={licenseSaving} onClick={() => void saveLicense()}>
                  {licenseSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Save license
                </Button>
                {licensePath === 'LICENSE.md' ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setLicensePath('LICENSE')}>
                    Use plain LICENSE filename next save
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => setLicensePath('LICENSE.md')}>
                    Use LICENSE.md next save
                  </Button>
                )}
              </div>
            </div>

            <hr className="border-border" />

            <PeerSyncPanel
              projectId={projectId}
              displayName={meta?.name?.trim() || projectId}
              onImported={() => void load()}
            />
          </section>
        ) : null}
      </main>

      {/* ── Add book dialog ─────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Add book</DialogTitle>
            <DialogDescription>
              Choose a book to add to this project. On the next screen you can pick a tool (e.g. Edit or Align).
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
