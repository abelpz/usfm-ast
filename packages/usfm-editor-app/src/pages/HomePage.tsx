import { BookCombobox } from '@/components/BookCombobox';
import { DcsLoginDialog } from '@/components/DcsLoginDialog';
import { Tip } from '@/components/Tip';
import { Door43LanguagePicker } from '@/components/Door43LanguagePicker';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/ui/stepper';
import { fetchAuthenticatedUser, getFileContent, type Door43RepoRow, type Door43UserInfo } from '@/dcs-client';
import { booksFromDetectedProject, loadDcsProjectDescriptor, type DetectedDcsProject } from '@/lib/dcs-format-detect';
import { findLocalProjectForDcsRepo, importDcsRepoAsProject } from '@/lib/dcs-import-project';
import { resolveEditorProjectFormat } from '@/lib/project-create';
import {
  listRCBooks,
  listSBBooks,
  parseResourceContainer,
  parseScriptureBurrito,
  scaffoldRcProject,
} from '@usfm-tools/project-formats';
import { getCatalogLanguages, getLangnames, type DcsLangnameEntry } from '@/lib/dcs-langnames-cache';
import {
  peekReposSearchWizardCache,
  searchReposForScriptureLanguageWizardCached,
} from '@/lib/dcs-wizard-query-cache';
import { groupedBookSelectItems } from '@/lib/book-code-groups';
import { cn } from '@/lib/utils';
import { DCS_CREDS_KEY, loadDcsCredentials, type DcsStoredCredentials } from '@/lib/dcs-storage';
import { useKV } from '@/platform/PlatformContext';
import type { ProjectLaunchConfig } from '@/lib/project-launch';
import { getProjectStorage } from '@/lib/project-storage';
import { addRecentProject, loadRecentProjects, removeRecentProject, type RecentProjectEntry } from '@/lib/recent-projects';
import { blankTranslationFromSourceUsfm, blankUsfmForBook, extractBookCodeFromUsfm } from '@/lib/usfm-project';
import { USFM_BOOK_CODES } from '@usfm-tools/editor';
import type { ProjectMeta } from '@usfm-tools/types';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Database,
  FilePlus,
  FileText,
  FileUp,
  FolderPlus,
  FolderOpen,
  Globe,
  Hash,
  Loader2,
  LogIn,
  Monitor,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const DEFAULT_HOST = 'git.door43.org';

const LAST_LANG_STORAGE_KEY = 'usfm-editor-dcs-last-lang';

function readLastLang(): string {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_LANG_STORAGE_KEY) ?? '' : '';
  } catch {
    return '';
  }
}

function writeLastLang(lc: string): void {
  try {
    if (typeof localStorage !== 'undefined' && lc.trim()) localStorage.setItem(LAST_LANG_STORAGE_KEY, lc.trim());
  } catch {
    /* ignore */
  }
}

function sessionUserIdKey(host: string): string {
  return `usfm-editor-dcs-uid:${host}`;
}

function formatRecentAge(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

async function readFileFromDirectory(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<string> {
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) throw new Error('Empty path');
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!);
  }
  const fh = await dir.getFileHandle(parts[parts.length - 1]!);
  const file = await fh.getFile();
  return file.text();
}

export function HomePage() {
  const navigate = useNavigate();
  const kv = useKV();
  const loc = useLocation();
  /** Re-read after Door43 sign-in from the launcher modal (useDcsCredentials only runs once per mount). */
  const [credentials, setCredentials] = useState<DcsStoredCredentials | null>(() => loadDcsCredentials());
  const host = credentials?.host ?? DEFAULT_HOST;
  const token = credentials?.token;

  const [headerLoginOpen, setHeaderLoginOpen] = useState(false);
  const [loginContextMessage, setLoginContextMessage] = useState<string | undefined>();
  const [resumeMineReposAfterLogin, setResumeMineReposAfterLogin] = useState(false);
  const [homeUser, setHomeUser] = useState<Door43UserInfo | null>(null);

  const [blankOpen, setBlankOpen] = useState(false);
  const [blankCode, setBlankCode] = useState('TIT');

  /** One modal for “Open project” / “Load book” (device vs Door43). */
  type LauncherState =
    | null
    | { kind: 'openProject'; tab: 'device' | 'dcs' }
    | { kind: 'loadBook'; tab: 'device' | 'dcs' };
  const [launcher, setLauncher] = useState<LauncherState>(null);
  const loadBookFileRef = useRef<HTMLInputElement>(null);
  /** Invalidates in-flight `loadDcsProjectDescriptor` when the user picks another repo or goes Back. */
  const dcsRepoDetectSeqRef = useRef(0);

  /** Shared DCS wizard: `project` = open repo on Door43; `book` = load one USFM book into editor. */
  const [dcsWizardPurpose, setDcsWizardPurpose] = useState<'project' | 'book'>('book');
  /** 0 = language, 1 = repos, 2 = book or project confirm */
  const [dcsWizardStep, setDcsWizardStep] = useState(0);
  const [dcsTab, setDcsTab] = useState<'mine' | 'public'>('public');
  const [dcsLangLc, setDcsLangLc] = useState(readLastLang);
  const [langEntries, setLangEntries] = useState<DcsLangnameEntry[]>([]);
  /** Door43 catalog languages (start-project reference step). */
  const [catalogLangEntries, setCatalogLangEntries] = useState<DcsLangnameEntry[]>([]);
  const [dcsNumericUserId, setDcsNumericUserId] = useState<number | null>(() => {
    try {
      const s = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(sessionUserIdKey(DEFAULT_HOST)) : null;
      const n = s ? Number(s) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  });
  const [dcsLoading, setDcsLoading] = useState(false);
  const [dcsRepos, setDcsRepos] = useState<Door43RepoRow[]>([]);
  const [dcsSelected, setDcsSelected] = useState<Door43RepoRow | null>(null);
  const [dcsRef, setDcsRef] = useState('main');
  const [dcsBooks, setDcsBooks] = useState<{ code: string; name: string; path: string }[]>([]);
  const [dcsDetectedProject, setDcsDetectedProject] = useState<DetectedDcsProject | null>(null);
  const [dcsBookPick, setDcsBookPick] = useState<string | null>(null);
  const [dcsErr, setDcsErr] = useState<string | null>(null);

  const [startProjOpen, setStartProjOpen] = useState(false);
  const [startProjStep, setStartProjStep] = useState<0 | 1>(0);
  const [startProjSourceLang, setStartProjSourceLang] = useState('');
  const [startProjId, setStartProjId] = useState('');
  const [startProjName, setStartProjName] = useState('');
  const [startProjLang, setStartProjLang] = useState('');
  const [startProjIdTouched, setStartProjIdTouched] = useState(false);
  const [startProjBusy, setStartProjBusy] = useState(false);
  const [startProjErr, setStartProjErr] = useState<string | null>(null);
  const [localProjects, setLocalProjects] = useState<ProjectMeta[]>([]);

  const [folderBusy, setFolderBusy] = useState(false);
  const [folderErr, setFolderErr] = useState<string | null>(null);

  const [recentList, setRecentList] = useState(() => loadRecentProjects());

  useEffect(() => {
    if (loc.pathname !== '/') return;
    let cancelled = false;
    void getProjectStorage()
      .listProjects()
      .then((rows) => {
        if (!cancelled) setLocalProjects(rows);
      })
      .catch(() => {
        if (!cancelled) setLocalProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loc.pathname]);

  const goEditor = useCallback(
    (cfg: ProjectLaunchConfig) => {
      navigate('/editor', { state: cfg });
    },
    [navigate],
  );

  const resetDcsOpenWizardState = useCallback(() => {
    dcsRepoDetectSeqRef.current += 1;
    setDcsWizardStep(0);
    setDcsTab('public');
    setDcsLangLc(readLastLang());
    setDcsRepos([]);
    setDcsSelected(null);
    setDcsRef('main');
    setDcsBooks([]);
    setDcsDetectedProject(null);
    setDcsBookPick(null);
    setDcsErr(null);
    setDcsLoading(false);
  }, []);

  const dcsWizardEmbedded = Boolean(launcher?.tab === 'dcs');

  useEffect(() => {
    if (!dcsWizardEmbedded) {
      resetDcsOpenWizardState();
      return;
    }
    setDcsWizardPurpose(launcher?.kind === 'openProject' ? 'project' : 'book');
    resetDcsOpenWizardState();
  }, [dcsWizardEmbedded, launcher?.kind, resetDcsOpenWizardState]);

  const bookGroups = useMemo(() => groupedBookSelectItems(), []);

  const dcsStepperSteps = useMemo(
    () =>
      dcsWizardPurpose === 'project'
        ? [
            { id: 'd0', label: 'Language' },
            { id: 'd1', label: 'Repository' },
            { id: 'd2', label: 'Open' },
          ]
        : [
            { id: 'd0', label: 'Language' },
            { id: 'd1', label: 'Repository' },
            { id: 'd2', label: 'Book' },
          ],
    [dcsWizardPurpose],
  );

  const recentProjectEntries = useMemo(
    () => recentList.filter((r) => r.source === 'dcs_repo'),
    [recentList],
  );
  const recentFileEntries = useMemo(
    () => recentList.filter((r) => r.source !== 'dcs_repo'),
    [recentList],
  );

  const hasRecents =
    localProjects.length > 0 || recentProjectEntries.length > 0 || recentFileEntries.length > 0;

  async function onLogoutHome() {
    try {
      localStorage.removeItem(DCS_CREDS_KEY);
    } catch {
      /* ignore */
    }
    try {
      await kv.remove(DCS_CREDS_KEY);
    } catch {
      /* ignore */
    }
    setCredentials(null);
    setHomeUser(null);
  }

  useEffect(() => {
    let cancelled = false;
    void getLangnames(host).then((rows) => {
      if (!cancelled) setLangEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [host]);

  useEffect(() => {
    let cancelled = false;
    void getCatalogLanguages(host).then((rows) => {
      if (!cancelled) setCatalogLangEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [host]);

  useEffect(() => {
    if (!credentials?.token) {
      setDcsNumericUserId(null);
      return;
    }
    const h = credentials.host;
    let cancelled = false;
    void (async () => {
      try {
        const u = await fetchAuthenticatedUser({ host: h, token: credentials.token });
        if (!cancelled) {
          setDcsNumericUserId(u.id);
          try {
            sessionStorage.setItem(sessionUserIdKey(h), String(u.id));
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (!cancelled) setDcsNumericUserId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [credentials?.token, credentials?.host]);

  useEffect(() => {
    if (!credentials?.token) {
      setHomeUser(null);
      return;
    }
    const h = credentials.host;
    const tok = credentials.token;
    let cancelled = false;
    void fetchAuthenticatedUser({ host: h, token: tok })
      .then((u) => {
        if (!cancelled) setHomeUser(u);
      })
      .catch(() => {
        if (!cancelled) setHomeUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [credentials?.token, credentials?.host]);

  function launchBlank() {
    const pair = USFM_BOOK_CODES.find(([c]) => c === blankCode) ?? [blankCode, blankCode];
    const usfm = blankUsfmForBook(pair[0]!, pair[1]!);
    const recent = addRecentProject({
      name: `${pair[1]} (blank)`,
      bookCode: pair[0]!,
      source: 'blank',
    });
    goEditor({
      initialUsfm: usfm,
      skipPersistedDcsInitialFetch: true,
      openReferencePanel: true,
      projectMeta: { name: recent.name, bookCode: pair[0]!, source: 'blank', recentId: recent.id },
    });
    setBlankOpen(false);
  }

  async function pickProjectFolder() {
    const w = window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
    if (!w.showDirectoryPicker) {
      setFolderErr('Folder picker is not supported in this browser. Use a single USFM file instead.');
      return;
    }
    setFolderBusy(true);
    setFolderErr(null);
    try {
      const root = await w.showDirectoryPicker();
      let metaText: string | null = null;
      let metaName: 'sb' | 'rc' | null = null;
      try {
        metaText = await readFileFromDirectory(root, 'metadata.json');
        metaName = 'sb';
      } catch {
        try {
          metaText = await readFileFromDirectory(root, 'manifest.yaml');
          metaName = 'rc';
        } catch {
          metaText = null;
        }
      }
      if (!metaText || !metaName) {
        setFolderErr('No metadata.json (Scripture Burrito) or manifest.yaml (Resource Container) found in this folder.');
        setFolderBusy(false);
        return;
      }
      let books: { code: string; name: string; path: string }[] = [];
      if (metaName === 'sb') {
        const meta = parseScriptureBurrito(JSON.parse(metaText) as unknown);
        books = listSBBooks(meta);
      } else {
        const manifest = parseResourceContainer(metaText);
        books = listRCBooks(manifest);
      }
      if (books.length === 0) {
        setFolderErr('No USFM books found in manifest.');
        setFolderBusy(false);
        return;
      }
      const choice = window.prompt(`Book codes:\n${books.map((b) => `${b.code} — ${b.name}`).join('\n')}\n\nEnter book code to open:`);
      const picked = books.find((b) => b.code.toUpperCase() === (choice ?? '').trim().toUpperCase());
      if (!picked) {
        setFolderErr('Cancelled or unknown book code.');
        setFolderBusy(false);
        return;
      }
      const rel = picked.path.replace(/^\.\//, '');
      const usfm = await readFileFromDirectory(root, rel);
      const recent = addRecentProject({
        name: `${picked.name} (folder)`,
        bookCode: picked.code,
        source: 'continue',
      });
      goEditor({
        initialUsfm: usfm,
        skipPersistedDcsInitialFetch: true,
        projectMeta: { name: recent.name, bookCode: picked.code, source: 'continue', recentId: recent.id },
      });
      setLauncher(null);
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFolderBusy(false);
    }
  }

  async function onLoadBookFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    const text = await f.text();
    const code = extractBookCodeFromUsfm(text) ?? 'UNK';
    const recent = addRecentProject({ name: f.name, bookCode: code, source: 'device' });
    goEditor({
      initialUsfm: text,
      skipPersistedDcsInitialFetch: true,
      openReferencePanel: true,
      projectMeta: { name: recent.name, bookCode: code, source: 'device', recentId: recent.id },
    });
    setLauncher(null);
  }

  const refreshDcsRepos = useCallback(
    async (auth: DcsStoredCredentials | null = credentials) => {
      setDcsErr(null);
      const lang = dcsLangLc.trim();
      if (!lang) {
        setDcsErr('Select a language first.');
        return;
      }
      try {
        if (dcsTab === 'mine') {
          if (!auth?.token) {
            setDcsLoading(false);
            return;
          }
          let uid = dcsNumericUserId;
          if (uid == null) {
            setDcsLoading(true);
            setDcsRepos([]);
            const u = await fetchAuthenticatedUser({ host: auth.host, token: auth.token });
            uid = u.id;
            setDcsNumericUserId(uid);
            try {
              sessionStorage.setItem(sessionUserIdKey(auth.host), String(uid));
            } catch {
              /* ignore */
            }
          }
          const cachedMine = peekReposSearchWizardCache(host, lang, uid);
          if (cachedMine) {
            setDcsRepos(cachedMine);
            setDcsLoading(false);
            return;
          }
          setDcsLoading(true);
          setDcsRepos([]);
          const rows = await searchReposForScriptureLanguageWizardCached({
            host,
            token: auth.token,
            uid,
            lang,
          });
          setDcsRepos(rows);
        } else {
          const cachedPub = peekReposSearchWizardCache(host, lang, undefined);
          if (cachedPub) {
            setDcsRepos(cachedPub);
            setDcsLoading(false);
            return;
          }
          setDcsLoading(true);
          setDcsRepos([]);
          const rows = await searchReposForScriptureLanguageWizardCached({ host, lang });
          setDcsRepos(rows);
        }
      } catch (e) {
        setDcsErr(e instanceof Error ? e.message : String(e));
      } finally {
        setDcsLoading(false);
      }
    },
    [credentials, dcsLangLc, dcsNumericUserId, dcsTab, host],
  );

  useEffect(() => {
    if (!dcsWizardEmbedded || dcsWizardStep !== 1) return;
    const lang = dcsLangLc.trim();
    if (!lang) return;
    if (dcsTab === 'mine' && !credentials?.token) return;
    void refreshDcsRepos(credentials);
  }, [dcsWizardEmbedded, dcsWizardStep, dcsLangLc, dcsTab, credentials, refreshDcsRepos]);

  async function onSelectDcsRepo(row: Door43RepoRow) {
    const seq = ++dcsRepoDetectSeqRef.current;
    setDcsSelected(row);
    setDcsErr(null);
    setDcsBooks([]);
    setDcsDetectedProject(null);
    setDcsBookPick(null);
    const owner = row.owner ?? row.fullName.split('/')[0];
    const repo = row.name;
    const ref = row.defaultBranch ?? dcsRef;
    if (row.defaultBranch) setDcsRef(row.defaultBranch);
    if (dcsWizardEmbedded && dcsWizardStep === 1) setDcsWizardStep(2);
    setDcsLoading(true);
    try {
      const project = await loadDcsProjectDescriptor({
        host,
        token,
        owner: owner!,
        repo,
        ref,
      });
      if (seq !== dcsRepoDetectSeqRef.current) return;
      setDcsDetectedProject(project);
      if (dcsWizardPurpose === 'book') {
        const books = booksFromDetectedProject(project);
        setDcsBooks(books);
        if (books.length === 1) setDcsBookPick(books[0]!.path);
      }
    } catch (e) {
      if (seq !== dcsRepoDetectSeqRef.current) return;
      setDcsErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === dcsRepoDetectSeqRef.current) setDcsLoading(false);
    }
  }

  async function openDcsBook() {
    if (!dcsSelected) return;
    const book = dcsBooks.find((b) => b.path === dcsBookPick);
    if (!book) {
      setDcsErr('Select a book.');
      return;
    }
    const owner = dcsSelected.owner ?? dcsSelected.fullName.split('/')[0];
    const repo = dcsSelected.name;
    const ref = dcsRef || dcsSelected.defaultBranch || 'main';
    setDcsLoading(true);
    setDcsErr(null);
    try {
      const file = await getFileContent({
        host,
        token,
        owner: owner!,
        repo,
        path: book.path,
        ref,
      });
      const fmt = dcsDetectedProject
        ? resolveEditorProjectFormat({
            repoFormat: dcsDetectedProject.format,
            enhanced: dcsDetectedProject.enhanced,
          })
        : { projectFormat: 'raw-usfm' as const };
      const recent = addRecentProject({
        name: `${dcsSelected.fullName} — ${book.code}`,
        bookCode: book.code,
        source: 'dcs',
        dcs: { owner: owner!, repo, ref, path: book.path, host },
        projectFormat: fmt.projectFormat,
        repoLayout: fmt.repoLayout,
      });
      goEditor({
        initialUsfm: file.content,
        skipPersistedDcsInitialFetch: true,
        openReferencePanel: true,
        projectFormat: fmt.projectFormat,
        repoLayout: fmt.repoLayout,
        projectMeta: { name: recent.name, bookCode: book.code, source: 'dcs', recentId: recent.id },
      });
      setLauncher(null);
    } catch (e) {
      setDcsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDcsLoading(false);
    }
  }

  async function createLocalProject() {
    const id = startProjId.trim().toUpperCase();
    if (!/^[A-Z]{3,8}$/.test(id)) {
      setStartProjErr('ID must be 3-8 letters (A-Z).');
      return;
    }
    const storage = getProjectStorage();
    const existing = await storage.getProject(id);
    if (existing) {
      setStartProjErr('A project with this ID already exists.');
      return;
    }
    setStartProjBusy(true);
    setStartProjErr(null);
    try {
      const files = scaffoldRcProject({
        identifier: id,
        languageTag: startProjLang.trim() || 'en',
        title: startProjName.trim() || id,
      });
      const now = new Date().toISOString();
      await storage.createProject({
        id,
        name: startProjName.trim() || id,
        language: startProjLang.trim() || 'en',
        format: 'resource-container',
        created: now,
        updated: now,
        sourceRefLanguage: startProjSourceLang.trim() || undefined,
      });
      const fileMap = files as Record<string, string>;
      for (const [path, content] of Object.entries(fileMap)) {
        await storage.writeFile(id, path, content);
      }
      setStartProjOpen(false);
      setStartProjStep(0);
      setStartProjSourceLang('');
      setStartProjId('');
      setStartProjName('');
      setStartProjLang('');
      setStartProjIdTouched(false);
      setLocalProjects(await storage.listProjects());
      navigate(`/project/${id}`);
    } catch (e) {
      setStartProjErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStartProjBusy(false);
    }
  }

  async function deleteLocalProject(pid: string) {
    if (!window.confirm('Delete this local project and all its files? This cannot be undone.')) return;
    try {
      const storage = getProjectStorage();
      await storage.deleteProject(pid);
      setLocalProjects(await storage.listProjects());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function openDcsRepoProject() {
    if (!dcsSelected) return;
    const owner = dcsSelected.owner ?? dcsSelected.fullName.split('/')[0]!;
    const repo = dcsSelected.name;
    const ref = dcsRef || dcsSelected.defaultBranch || 'main';
    setDcsErr(null);
    let project = dcsDetectedProject;
    try {
      if (!project) {
        project = await loadDcsProjectDescriptor({
          host,
          token,
          owner,
          repo,
          ref,
        });
        setDcsDetectedProject(project);
      }
      if (project.format === 'raw-usfm') {
        setDcsErr(
          'This repository has no manifest.yaml or metadata.json. Project-level import requires a Resource Container or Scripture Burrito layout.',
        );
        return;
      }
      setDcsLoading(true);
      const storage = getProjectStorage();
      const id = await importDcsRepoAsProject({
        storage,
        host,
        token,
        owner,
        repo,
        ref,
        project,
      });
      setLocalProjects(await storage.listProjects());
      setLauncher(null);
      navigate(`/project/${encodeURIComponent(id)}`);
    } catch (e) {
      setDcsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDcsLoading(false);
    }
  }

  async function reopenRecent(r: RecentProjectEntry) {
    if (r.source === 'dcs_repo' && r.dcs) {
      const h = r.dcs.host ?? host;
      setDcsLoading(true);
      try {
        const storage = getProjectStorage();
        const existing = await findLocalProjectForDcsRepo(storage, r.dcs.owner, r.dcs.repo);
        if (existing) {
          navigate(`/project/${encodeURIComponent(existing)}`);
          return;
        }
        const project = await loadDcsProjectDescriptor({
          host: h,
          token,
          owner: r.dcs.owner,
          repo: r.dcs.repo,
          ref: r.dcs.ref,
        });
        if (project.format === 'raw-usfm') {
          alert(
            'This Door43 project has no manifest.yaml or metadata.json. Open it on Door43 or import a Resource Container / Scripture Burrito repository.',
          );
          return;
        }
        const id = await importDcsRepoAsProject({
          storage,
          host: h,
          token,
          owner: r.dcs.owner,
          repo: r.dcs.repo,
          ref: r.dcs.ref,
          project,
        });
        setLocalProjects(await storage.listProjects());
        navigate(`/project/${encodeURIComponent(id)}`);
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      } finally {
        setDcsLoading(false);
      }
      return;
    }
    if (r.source === 'dcs' && r.dcs?.path) {
      setDcsLoading(true);
      try {
        const file = await getFileContent({
          host: r.dcs.host ?? host,
          token,
          owner: r.dcs.owner,
          repo: r.dcs.repo,
          path: r.dcs.path,
          ref: r.dcs.ref,
        });
        goEditor({
          initialUsfm: file.content,
          skipPersistedDcsInitialFetch: true,
          openReferencePanel: true,
          projectMeta: { name: r.name, bookCode: r.bookCode, source: 'dcs', recentId: r.id },
        });
      } catch {
        /* fall through */
      } finally {
        setDcsLoading(false);
      }
      return;
    }
    if (r.source === 'blank') {
      const pair = USFM_BOOK_CODES.find(([c]) => c === r.bookCode);
      const usfm = blankUsfmForBook(r.bookCode, pair?.[1] ?? r.bookCode);
      goEditor({
        initialUsfm: usfm,
        skipPersistedDcsInitialFetch: true,
        openReferencePanel: true,
        projectMeta: { name: r.name, bookCode: r.bookCode, source: 'blank', recentId: r.id },
      });
      return;
    }
    if (r.source === 'device') {
      alert('Open this book again with “Load book” → This device and pick the file.');
      return;
    }
    if (r.source === 'translate' && r.dcs?.path) {
      setDcsLoading(true);
      try {
        const file = await getFileContent({
          host: r.dcs.host ?? host,
          token,
          owner: r.dcs.owner,
          repo: r.dcs.repo,
          path: r.dcs.path,
          ref: r.dcs.ref,
        });
        const over = Boolean(r.translateOverSource);
        if (over) {
          goEditor({
            initialUsfm: file.content,
            skipPersistedDcsInitialFetch: true,
            openReferencePanel: false,
            projectMeta: { name: r.name, bookCode: r.bookCode, source: 'translate', recentId: r.id },
          });
        } else {
          goEditor({
            initialUsfm: blankTranslationFromSourceUsfm(file.content),
            sourceReferenceUsfm: file.content,
            openReferencePanel: true,
            skipPersistedDcsInitialFetch: true,
            projectMeta: { name: r.name, bookCode: r.bookCode, source: 'translate', recentId: r.id },
          });
        }
      } catch {
        /* fall through */
      } finally {
        setDcsLoading(false);
      }
      return;
    }
    alert('Re-open this book with “Load book” (device or Door43).');
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="border-border/80 bg-background/80 supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-4 border-b px-5 py-3.5 backdrop-blur-md sm:px-6 sm:py-4">
        <div className="flex items-center">
          <span className="text-primary" aria-label="Scripture Editor">
            <BookOpen className="size-6" aria-hidden />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {credentials?.token && homeUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2 px-2">
                  {homeUser.avatarUrl ? (
                    <img src={homeUser.avatarUrl} alt="" className="size-7 rounded-full" />
                  ) : (
                    <BookOpen className="size-4" aria-hidden />
                  )}
                  <span className="max-w-[8rem] truncate">{homeUser.login || credentials.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setLoginContextMessage(undefined);
                    void onLogoutHome();
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setLoginContextMessage(undefined);
                setResumeMineReposAfterLogin(false);
                setHeaderLoginOpen(true);
              }}
            >
              <LogIn className="size-4" aria-hidden />
              Sign in
            </Button>
          )}
        </div>
      </header>
      {dcsLoading ? (
        <div className="bg-primary/80 fixed left-0 right-0 top-0 z-40 h-1 animate-pulse" aria-busy="true" />
      ) : null}

      {/*
        App-shell layout: true sidebar panel (border-r, no card decoration) + content area.
        - Desktop + has recents → sidebar nav | content (recents)
        - Mobile + has recents → compact action bar at top | content (recents) below
        - No recents (any size) → welcome card left-aligned in content area
      */}
      <main className="mx-auto flex w-full max-w-5xl flex-1">

        {/* ── TRUE SIDEBAR: desktop only, when recents exist ── */}
        {hasRecents && (
          <aside className="hidden w-52 shrink-0 flex-col border-r border-border/60 bg-muted/20 px-3 py-6 lg:flex">
            <nav className="flex flex-col gap-5">
              {/* Project */}
              <div>
                <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Project
                </p>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => { setStartProjErr(null); setStartProjOpen(true); }}
                    className="focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <FolderPlus className="size-4 shrink-0 text-emerald-600" aria-hidden />
                    New
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFolderErr(null); setLauncher({ kind: 'openProject', tab: 'device' }); }}
                    className="focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <FolderOpen className="size-4 shrink-0 text-emerald-600" aria-hidden />
                    Open
                  </button>
                </div>
              </div>

              {/* Book file */}
              <div>
                <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Book file
                </p>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setBlankOpen(true)}
                    className="focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <FilePlus className="size-4 shrink-0 text-sky-600" aria-hidden />
                    New
                  </button>
                  <button
                    type="button"
                    onClick={() => setLauncher({ kind: 'loadBook', tab: 'device' })}
                    className="focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <FileUp className="size-4 shrink-0 text-sky-600" aria-hidden />
                    Open
                  </button>
                </div>
              </div>
            </nav>

            {/* Offline cache pinned to sidebar bottom */}
            <div className="mt-auto">
              <Button variant="ghost" size="sm" asChild className="w-full justify-start gap-2.5 px-2.5 text-muted-foreground hover:text-foreground">
                <Link to="/source-cache">
                  <Database className="size-4" />
                  Offline cache
                </Link>
              </Button>
            </div>
          </aside>
        )}

        {/* ── CONTENT AREA ── */}
        <div className="flex min-w-0 flex-1 flex-col px-5 py-6 lg:px-8">

          {/* MOBILE ACTION BAR — compact horizontal strip, mobile only, has recents */}
          {hasRecents && (
            <div className="mb-6 flex flex-wrap items-start gap-x-6 gap-y-4 border-b border-border/60 pb-5 lg:hidden">
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Project</p>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => { setStartProjErr(null); setStartProjOpen(true); }}
                    className="focus-visible:ring-ring flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <FolderPlus className="size-4 shrink-0 text-emerald-600" aria-hidden />
                    New
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFolderErr(null); setLauncher({ kind: 'openProject', tab: 'device' }); }}
                    className="focus-visible:ring-ring flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <FolderOpen className="size-4 shrink-0 text-emerald-600" aria-hidden />
                    Open
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Book file</p>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => setBlankOpen(true)}
                    className="focus-visible:ring-ring flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <FilePlus className="size-4 shrink-0 text-sky-600" aria-hidden />
                    New
                  </button>
                  <button
                    type="button"
                    onClick={() => setLauncher({ kind: 'loadBook', tab: 'device' })}
                    className="focus-visible:ring-ring flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <FileUp className="size-4 shrink-0 text-sky-600" aria-hidden />
                    Open
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* WELCOME CARD — no recents (new user) */}
          {!hasRecents && (
            <div className="border-border/80 w-fit rounded-xl border bg-card">
              <div className="flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0">
                <div className="flex flex-col gap-2 p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Project</p>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => { setStartProjErr(null); setStartProjOpen(true); }}
                      className="focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                    >
                      <FolderPlus className="size-4 shrink-0 text-emerald-600" aria-hidden />
                      New
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFolderErr(null); setLauncher({ kind: 'openProject', tab: 'device' }); }}
                      className="focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                    >
                      <FolderOpen className="size-4 shrink-0 text-emerald-600" aria-hidden />
                      Open
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Book file</p>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => setBlankOpen(true)}
                      className="focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                    >
                      <FilePlus className="size-4 shrink-0 text-sky-600" aria-hidden />
                      New
                    </button>
                    <button
                      type="button"
                      onClick={() => setLauncher({ kind: 'loadBook', tab: 'device' })}
                      className="focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:outline-none"
                    >
                      <FileUp className="size-4 shrink-0 text-sky-600" aria-hidden />
                      Open
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RECENTS — only when items exist */}
          {hasRecents && (
            <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
              {(localProjects.length > 0 || recentProjectEntries.length > 0) && (
                <section className="flex min-w-0 flex-col gap-2">
                  <h2 className="text-foreground text-sm font-semibold">Projects</h2>
                  {(localProjects.length > 0 || recentProjectEntries.length > 0) && (
                    <ul className="divide-border divide-y">
                      {localProjects.map((p) => (
                        <li key={p.id} className="group flex items-center gap-2 py-2.5 pr-1">
                          <div className="min-w-0 flex-1">
                            <Button variant="link" asChild className="text-foreground hover:text-primary h-auto min-w-0 truncate p-0 text-left text-sm font-medium no-underline hover:underline">
                              <Link to={`/project/${encodeURIComponent(p.id)}`}>{p.name}</Link>
                            </Button>
                            <p className="text-muted-foreground text-xs">
                              <span className="font-mono">{p.id}</span> · {p.language} · {p.updated.slice(0, 10)}
                            </p>
                          </div>
                          <Tip label="Delete project" side="left">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={() => void deleteLocalProject(p.id)}
                              aria-label="Delete project"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </Tip>
                        </li>
                      ))}
                      {recentProjectEntries.map((r) => (
                        <li key={r.id} className="group flex items-center gap-2 py-2.5 pr-1">
                          <button
                            type="button"
                            className="text-foreground hover:text-primary min-w-0 flex-1 truncate text-left text-sm"
                            onClick={() => void reopenRecent(r)}
                          >
                            {r.name}
                          </button>
                          <span className="text-muted-foreground tabular-nums shrink-0 text-xs">{formatRecentAge(r.timestamp)}</span>
                          <Tip label="Remove" side="left">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={() => { removeRecentProject(r.id); setRecentList(loadRecentProjects()); }}
                              aria-label="Remove from recents"
                            >
                              <X className="size-3.5" aria-hidden />
                            </Button>
                          </Tip>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {recentFileEntries.length > 0 && (
                <section className="flex min-w-0 flex-col gap-2">
                  <h2 className="text-foreground text-sm font-semibold">Recent books</h2>
                  <ul className="divide-border divide-y">
                    {recentFileEntries.map((r) => (
                      <li key={r.id} className="group flex items-center gap-2 py-2.5 pr-1">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-foreground hover:text-primary block w-full truncate text-left text-sm"
                            onClick={() => void reopenRecent(r)}
                          >
                            {r.name}
                          </button>
                          <p className="text-muted-foreground text-xs">{r.bookCode}</p>
                        </div>
                        <span className="text-muted-foreground tabular-nums shrink-0 text-xs">{formatRecentAge(r.timestamp)}</span>
                        <Tip label="Remove" side="left">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => { removeRecentProject(r.id); setRecentList(loadRecentProjects()); }}
                            aria-label="Remove from recents"
                          >
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        </Tip>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {/* Offline cache — footer of content area on mobile; on desktop it lives in the sidebar */}
          <div className="mt-auto pt-8 lg:hidden">
            <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground hover:text-foreground">
              <Link to="/source-cache">
                <Database className="size-4" />
                Offline cache
              </Link>
            </Button>
          </div>
          {!hasRecents && (
            <div className="mt-auto pt-8 hidden lg:block">
              <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground hover:text-foreground">
                <Link to="/source-cache">
                  <Database className="size-4" />
                  Offline cache
                </Link>
              </Button>
            </div>
          )}

        </div>
      </main>

      <Dialog open={blankOpen} onOpenChange={setBlankOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>New blank book</DialogTitle>
            <DialogDescription>Choose the book code for your new translation file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Book</Label>
            <Select value={blankCode} onValueChange={setBlankCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  <SelectLabel>Old Testament</SelectLabel>
                  {bookGroups.ot.map(({ code, name }) => (
                    <SelectItem key={code} value={code}>
                      {name} ({code})
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>New Testament</SelectLabel>
                  {bookGroups.nt.map(({ code, name }) => (
                    <SelectItem key={code} value={code}>
                      {name} ({code})
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Other</SelectLabel>
                  {bookGroups.other.map(({ code, name }) => (
                    <SelectItem key={code} value={code}>
                      {name} ({code})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex-row flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" className="shrink-0" onClick={() => setBlankOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="shrink-0 gap-2" onClick={launchBlank}>
              <BookOpen className="size-4" aria-hidden />
              Open editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={launcher != null}
        onOpenChange={(o) => {
          if (!o) setLauncher(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>{launcher?.kind === 'openProject' ? 'Open project' : 'Load book'}</DialogTitle>
            <DialogDescription>
              {launcher?.tab === 'device' && launcher?.kind === 'openProject' && 'Unzipped Burrito or Resource Container folder on this device.'}
              {launcher?.tab === 'device' && launcher?.kind === 'loadBook' && 'USFM / USJ / USX file on this device.'}
              {launcher?.tab === 'dcs' && dcsWizardStep === 0 && 'Language for Bible repositories on Door43.'}
              {launcher?.tab === 'dcs' && dcsWizardStep === 1 && 'Pick a repository (public or your access).'}
              {launcher?.tab === 'dcs' && dcsWizardStep === 2 && dcsWizardPurpose === 'book' && 'Branch and book file, then open in the editor.'}
              {launcher?.tab === 'dcs' && dcsWizardStep === 2 && dcsWizardPurpose === 'project' && 'Confirm branch, then open the project workspace.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={launcher?.tab === 'device' ? 'default' : 'outline'}
              className="gap-1"
              disabled={!launcher}
              onClick={() => launcher && setLauncher({ ...launcher, tab: 'device' })}
            >
              <Monitor className="size-4" aria-hidden />
              Device
            </Button>
            <Button
              type="button"
              size="sm"
              variant={launcher?.tab === 'dcs' ? 'default' : 'outline'}
              className="gap-1"
              disabled={!launcher}
              onClick={() => launcher && setLauncher({ ...launcher, tab: 'dcs' })}
            >
              <Globe className="size-4" aria-hidden />
              Door43
            </Button>
          </div>

          {launcher?.tab === 'device' && launcher.kind === 'openProject' ? (
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" className="gap-2" disabled={folderBusy} onClick={() => void pickProjectFolder()}>
                {folderBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FolderOpen className="size-4" aria-hidden />}
                Choose project folder…
              </Button>
              {folderErr ? <p className="text-destructive text-sm">{folderErr}</p> : null}
            </div>
          ) : null}

          {launcher?.tab === 'device' && launcher.kind === 'loadBook' ? (
            <div className="flex flex-col gap-2">
              <input
                ref={loadBookFileRef}
                type="file"
                className="hidden"
                accept=".usfm,.sfm,.usj,.usx,.txt,.xml,.json"
                onChange={onLoadBookFile}
              />
              <Button type="button" className="gap-2" onClick={() => loadBookFileRef.current?.click()}>
                <Upload className="size-4" aria-hidden />
                Choose book file…
              </Button>
            </div>
          ) : null}

          {launcher?.tab === 'dcs' ? (
            <>
              <Stepper className="mb-2" currentIndex={dcsWizardStep} steps={dcsStepperSteps} />

              {dcsWizardStep > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground -mt-1 mb-2 self-start gap-1 px-0"
                  onClick={() => {
                    setDcsWizardStep((s) => {
                      const next = Math.max(0, s - 1);
                      if (s === 2 && next === 1) {
                        dcsRepoDetectSeqRef.current += 1;
                        setDcsLoading(false);
                      }
                      return next;
                    });
                  }}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Back
                </Button>
              ) : null}

              {dcsWizardStep === 0 ? (
                <div className="flex flex-col gap-3">
                  <Door43LanguagePicker
                    variant="panel"
                    idPrefix="launcher-dcs"
                    entries={langEntries}
                    valueLc={dcsLangLc}
                    onChangeLc={(lc) => {
                      setDcsLangLc(lc);
                      writeLastLang(lc);
                      setDcsRepos([]);
                      setDcsSelected(null);
                      setDcsBooks([]);
                      setDcsDetectedProject(null);
                    }}
                  />
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={!dcsLangLc.trim()}
                    onClick={() => {
                      if (!dcsLangLc.trim()) return;
                      setDcsWizardStep(1);
                    }}
                  >
                    Continue
                  </Button>
                </div>
              ) : null}

              {dcsWizardStep === 1 ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      type="button"
                      variant={dcsTab === 'public' ? 'default' : 'outline'}
                      className="gap-1"
                      onClick={() => {
                        setDcsTab('public');
                        setDcsRepos([]);
                      }}
                    >
                      <Globe className="size-4" aria-hidden />
                      Public
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant={dcsTab === 'mine' ? 'default' : 'outline'}
                      className="gap-1"
                      onClick={() => {
                        setDcsTab('mine');
                        setDcsRepos([]);
                        if (!credentials?.token) {
                          setLoginContextMessage('Sign in to see your repositories.');
                          setResumeMineReposAfterLogin(true);
                          setHeaderLoginOpen(true);
                        }
                      }}
                    >
                      <FolderOpen className="size-4" aria-hidden />
                      My access
                    </Button>
                  </div>
                  {dcsTab === 'mine' && !credentials?.token ? (
                    <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
                      <p className="text-muted-foreground text-sm">Sign in to list repositories you can access.</p>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          setLoginContextMessage('Sign in to see your repositories.');
                          setResumeMineReposAfterLogin(true);
                          setHeaderLoginOpen(true);
                        }}
                      >
                        <LogIn className="size-4" aria-hidden />
                        Sign in
                      </Button>
                    </div>
                  ) : null}
                  {dcsErr ? <p className="text-destructive text-sm">{dcsErr}</p> : null}
                  <div className="relative max-h-44 overflow-y-auto rounded border">
                    {dcsLoading ? (
                      <div className="space-y-2 p-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : (
                      dcsRepos.map((row) => (
                        <button
                          key={row.fullName}
                          type="button"
                          className={`hover:bg-accent block w-full px-2 py-1.5 text-left text-sm ${dcsSelected?.fullName === row.fullName ? 'bg-accent' : ''}`}
                          onClick={() => void onSelectDcsRepo(row)}
                        >
                          {row.fullName}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {dcsWizardStep === 2 && dcsSelected ? (
                <div className="space-y-4">
                  <div className="bg-muted/50 flex gap-2 rounded-lg border px-3 py-2.5 text-sm">
                    <FolderOpen className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Repository</span>
                      <p className="text-foreground mt-0.5 font-medium break-all">{dcsSelected.fullName}</p>
                      {dcsSelected.description?.trim() ? (
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{dcsSelected.description.trim()}</p>
                      ) : null}
                      {dcsWizardPurpose === 'book' ? (
                        <Button variant="link" asChild className="mt-1 h-auto px-0 py-0 text-xs">
                          <a
                            href={`https://${host}/${dcsSelected.owner ?? dcsSelected.fullName.split('/')[0]}/${dcsSelected.name}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View repository on Door43
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <details className="text-sm">
                    <summary className="text-muted-foreground cursor-pointer">Branch / ref</summary>
                    <div className="pt-2">
                      <Label>Branch / ref</Label>
                      <Input value={dcsRef} onChange={(e) => setDcsRef(e.target.value)} />
                    </div>
                  </details>
                  {dcsWizardPurpose === 'book' ? (
                    <BookCombobox
                      idPrefix="launcher-dcs-book"
                      books={dcsBooks}
                      valuePath={dcsBookPick}
                      onChangePath={setDcsBookPick}
                      disabled={dcsLoading}
                    />
                  ) : (
                    <div className="space-y-2 text-xs">
                      {dcsLoading && !dcsDetectedProject ? (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                          Detecting project format…
                        </p>
                      ) : null}
                      {dcsDetectedProject?.format === 'raw-usfm' ? (
                        <p className="text-destructive">
                          This repository has no manifest.yaml or metadata.json. Project import requires a Resource
                          Container or Scripture Burrito.
                        </p>
                      ) : null}
                      {dcsDetectedProject && dcsDetectedProject.format !== 'raw-usfm' ? (
                        <p className="text-muted-foreground">
                          Detected:{' '}
                          {dcsDetectedProject.format === 'resource-container'
                            ? 'Resource Container'
                            : 'Scripture Burrito'}
                        </p>
                      ) : null}
                      {dcsErr ? <p className="text-destructive text-sm">{dcsErr}</p> : null}
                    </div>
                  )}
                </div>
              ) : null}

              <DialogFooter className="flex-row flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => setLauncher(null)}>
                  Cancel
                </Button>
                {dcsWizardStep === 2 && dcsWizardPurpose === 'project' ? (
                  <Button
                    type="button"
                    className="shrink-0 gap-2"
                    disabled={
                      !dcsSelected ||
                      !dcsDetectedProject ||
                      dcsDetectedProject.format === 'raw-usfm' ||
                      dcsLoading
                    }
                    onClick={() => void openDcsRepoProject()}
                  >
                    {dcsLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
                    Open project
                  </Button>
                ) : null}
                {dcsWizardStep === 2 && dcsWizardPurpose === 'book' ? (
                  <Button
                    type="button"
                    className="shrink-0 gap-2"
                    disabled={dcsLoading || !dcsSelected || !dcsBookPick}
                    onClick={() => void openDcsBook()}
                  >
                    {dcsLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BookOpen className="size-4" aria-hidden />}
                    Open book
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : (
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setLauncher(null)}>
                Close
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={startProjOpen}
        onOpenChange={(o) => {
          setStartProjOpen(o);
          if (!o) {
            setStartProjStep(0);
            setStartProjSourceLang('');
            setStartProjId('');
            setStartProjName('');
            setStartProjLang('');
            setStartProjIdTouched(false);
            setStartProjErr(null);
          }
        }}
      >
        <DialogContent
          className={cn(
            'gap-5 p-6',
            startProjStep === 1
              ? 'flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl'
              : 'sm:max-w-lg',
          )}
          showCloseButton
        >
          <DialogHeader className={startProjStep === 1 ? 'shrink-0' : undefined}>
            <DialogTitle className="flex items-center gap-2">
              {startProjStep === 0 ? (
                <>
                  <FolderPlus className="text-primary size-5 shrink-0" aria-hidden />
                  Start project
                </>
              ) : (
                <>
                  <span
                    className="bg-primary/15 flex size-10 shrink-0 items-center justify-center rounded-lg"
                    title="Published Door43 catalog"
                  >
                    <Globe className="text-primary size-6" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      Reference language
                    </span>
                    <span className="text-muted-foreground text-xs font-normal leading-snug">
                      Door43 Bible & helps (optional)
                    </span>
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {startProjStep === 0 ? (
            <div className="space-y-4">
              <Door43LanguagePicker
                idPrefix="start-proj"
                entries={langEntries}
                valueLc={startProjLang}
                onChangeLc={setStartProjLang}
                hideLabel
              />

              <div className="grid grid-cols-[1fr_9rem] gap-3 border-t pt-4">
                <div className="relative">
                  <Label htmlFor="start-proj-name" className="sr-only">
                    Translation name
                  </Label>
                  <Pencil
                    className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    id="start-proj-name"
                    value={startProjName}
                    onChange={(e) => {
                      const name = e.target.value;
                      setStartProjName(name);
                      if (!startProjIdTouched) {
                        const words = name.trim().split(/\s+/).filter(Boolean);
                        const hasUpper = words.some((w) => /^[A-Z]/.test(w));
                        const hasLower = words.some((w) => /^[a-z]/.test(w));
                        const mixedCase = hasUpper && hasLower;
                        const derived = words
                          .filter((w) => !mixedCase || /^[A-Z]/.test(w))
                          .map((w) => w[0]!.toUpperCase())
                          .join('')
                          .slice(0, 8);
                        setStartProjId(derived);
                      }
                    }}
                    placeholder="Wena Taru Bible"
                    autoComplete="off"
                    className="pl-9"
                  />
                </div>

                <div className="relative">
                  <Label htmlFor="start-proj-id" className="sr-only">
                    Short ID (3–8 letters A–Z)
                  </Label>
                  <Hash
                    className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    id="start-proj-id"
                    value={startProjId}
                    onFocus={() => setStartProjIdTouched(true)}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setStartProjId(val);
                      if (!val) setStartProjIdTouched(false);
                    }}
                    placeholder="WTB"
                    maxLength={8}
                    autoComplete="off"
                    className="pl-8 font-mono uppercase"
                  />
                </div>
              </div>

              <p className="text-muted-foreground -mt-1 flex items-center gap-1 text-xs">
                <Hash className="size-3 shrink-0" aria-hidden />
                <span>3–8 A–Z · e.g. WTB, XYZ</span>
              </p>

              {startProjErr ? <p className="text-destructive text-sm">{startProjErr}</p> : null}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <Door43LanguagePicker
                key={`start-proj-src-${startProjStep}`}
                idPrefix="start-proj-src"
                entries={catalogLangEntries}
                valueLc={startProjSourceLang}
                onChangeLc={setStartProjSourceLang}
                hideLabel
                variant="panel"
                fillListHeight
                className="min-h-0 flex-1"
              />
              {startProjErr ? <p className="text-destructive shrink-0 text-sm">{startProjErr}</p> : null}
            </div>
          )}

          <DialogFooter className={startProjStep === 1 ? 'shrink-0' : undefined}>
            {startProjStep === 0 ? (
              <>
                <Button type="button" variant="secondary" onClick={() => setStartProjOpen(false)}>
                  <X className="size-4" aria-hidden />
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!startProjLang || !startProjId}
                  onClick={() => {
                    setStartProjSourceLang('');
                    setStartProjStep(1);
                  }}
                  className="gap-2"
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStartProjStep(0)}
                  className="gap-2"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={startProjBusy}
                  onClick={() => {
                    setStartProjSourceLang('');
                    void createLocalProject();
                  }}
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  disabled={startProjBusy}
                  onClick={() => void createLocalProject()}
                  className="gap-2"
                >
                  {startProjBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FolderPlus className="size-4" aria-hidden />
                  )}
                  Create project
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DcsLoginDialog
        open={headerLoginOpen}
        onOpenChange={setHeaderLoginOpen}
        defaultHost={host}
        contextMessage={loginContextMessage}
        onSuccess={() => {
          const next = loadDcsCredentials();
          setCredentials(next);
          if (resumeMineReposAfterLogin) {
            setResumeMineReposAfterLogin(false);
            if (dcsWizardEmbedded) setDcsWizardStep(1);
            void refreshDcsRepos(next);
          }
        }}
      />
    </div>
  );
}
