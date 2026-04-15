import { BookCombobox } from '@/components/BookCombobox';
import { DcsLoginDialog } from '@/components/DcsLoginDialog';
import { Tip } from '@/components/Tip';
import { Door43LanguagePicker } from '@/components/Door43LanguagePicker';
import { TranslateCatalogSourceList } from '@/components/TranslateCatalogSourceList';
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
import {
  createOrUpdateRepoFile,
  createUserRepo,
  fetchAuthenticatedUser,
  fetchCatalogSourceEntry,
  getFileContent,
  type CatalogEntry,
  type Door43RepoRow,
  type Door43UserInfo,
} from '@/dcs-client';
import { booksFromDetectedProject, loadDcsProjectDescriptor } from '@/lib/dcs-format-detect';
import {
  enhancedProjectInitialFiles,
  listRCBooks,
  listSBBooks,
  parseResourceContainer,
  parseScriptureBurrito,
  scaffoldRcProject,
} from '@usfm-tools/project-formats';
import { getCatalogLanguages, getLangnames, type DcsLangnameEntry } from '@/lib/dcs-langnames-cache';
import {
  fetchCatalogSourcesWizardCached,
  peekCatalogSourcesWizardCache,
  peekReposSearchWizardCache,
  searchReposForScriptureLanguageWizardCached,
} from '@/lib/dcs-wizard-query-cache';
import { groupedBookSelectItems } from '@/lib/book-code-groups';
import { cn } from '@/lib/utils';
import { DCS_CREDS_KEY, loadDcsCredentials, type DcsStoredCredentials } from '@/lib/dcs-storage';
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
  FileText,
  FolderPlus,
  FolderOpen,
  Globe,
  Loader2,
  LogIn,
  Monitor,
  Plus,
  Search,
  Sparkles,
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

/** File name from `translatePendingMeta.recentName` after device file pick. */
function translateDeviceSourceFileName(recentName: string | undefined): string {
  if (!recentName) return '';
  if (recentName.startsWith('Translate from ')) return recentName.slice('Translate from '.length);
  if (recentName.startsWith('Over source: ')) return recentName.slice('Over source: '.length);
  return recentName;
}

function sessionUserIdKey(host: string): string {
  return `usfm-editor-dcs-uid:${host}`;
}

function catalogEntryKey(e: CatalogEntry): string {
  return `${e.fullName}@${e.releaseTag}`;
}

/** Scripture USFM ingredients from a published catalog entry (release-tagged). */
function booksFromCatalogEntry(entry: CatalogEntry): { code: string; name: string; path: string }[] {
  const books: { code: string; name: string; path: string }[] = [];
  for (const ing of entry.ingredients) {
    if (!/\.(usfm|sfm)$/i.test(ing.path)) continue;
    const path = ing.path.replace(/^\.\//, '');
    const code = ing.identifier.toUpperCase();
    books.push({ code, name: ing.title?.trim() || code, path });
  }
  return books;
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

  const [translateOpen, setTranslateOpen] = useState(false);
  /**
   * Device: 0 source type, 1 file, 2 configure + open.
   * DCS: 0 source type, 1 language, 2 published edition, 3 configure + open.
   */
  const [translateWizardStep, setTranslateWizardStep] = useState(0);
  const [translateSourceTab, setTranslateSourceTab] = useState<'device' | 'dcs'>('device');
  const [translateFillMode, setTranslateFillMode] = useState<'blank_reference' | 'over_source'>('blank_reference');
  const [translatePendingUsfm, setTranslatePendingUsfm] = useState<string | null>(null);
  const [translatePendingMeta, setTranslatePendingMeta] = useState<{
    recentName: string;
    bookCode?: string;
    dcs?: RecentProjectEntry['dcs'];
  } | null>(null);
  const translateFileRef = useRef<HTMLInputElement>(null);

  const [trDcsLangLc, setTrDcsLangLc] = useState(readLastLang);
  const [trDcsLoading, setTrDcsLoading] = useState(false);
  const [catalogLangEntries, setCatalogLangEntries] = useState<DcsLangnameEntry[]>([]);
  const [trCatalogSources, setTrCatalogSources] = useState<CatalogEntry[]>([]);
  const [trCatalogSelected, setTrCatalogSelected] = useState<CatalogEntry | null>(null);
  const [trCatalogBooks, setTrCatalogBooks] = useState<{ code: string; name: string; path: string }[]>([]);
  const [trCatalogBookPick, setTrCatalogBookPick] = useState<string | null>(null);
  const [trDcsErr, setTrDcsErr] = useState<string | null>(null);

  const [continueOpen, setContinueOpen] = useState(false);
  const continueFileRef = useRef<HTMLInputElement>(null);

  const [dcsOpen, setDcsOpen] = useState(false);
  /** 0 = language, 1 = repos, 2 = book + open */
  const [dcsWizardStep, setDcsWizardStep] = useState(0);
  const [dcsTab, setDcsTab] = useState<'mine' | 'public'>('public');
  const [dcsLangLc, setDcsLangLc] = useState(readLastLang);
  const [langEntries, setLangEntries] = useState<DcsLangnameEntry[]>([]);
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
  const [dcsBookPick, setDcsBookPick] = useState<string | null>(null);
  const [dcsErr, setDcsErr] = useState<string | null>(null);

  const [enhOpen, setEnhOpen] = useState(false);
  const [enhRepo, setEnhRepo] = useState('');
  const [enhLang, setEnhLang] = useState('es');
  const [enhTitle, setEnhTitle] = useState('');
  const [enhBusy, setEnhBusy] = useState(false);
  const [enhErr, setEnhErr] = useState<string | null>(null);

  const [startProjOpen, setStartProjOpen] = useState(false);
  const [startProjId, setStartProjId] = useState('');
  const [startProjName, setStartProjName] = useState('');
  const [startProjLang, setStartProjLang] = useState('');
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

  const resetTranslateWizardState = useCallback(() => {
    setTranslateWizardStep(0);
    setTranslateSourceTab('device');
    setTranslateFillMode('blank_reference');
    setTranslatePendingUsfm(null);
    setTranslatePendingMeta(null);
    setTrDcsErr(null);
    setTrDcsLoading(false);
    setTrCatalogSources([]);
    setTrCatalogSelected(null);
    setTrCatalogBooks([]);
    setTrCatalogBookPick(null);
    setTrDcsLangLc(readLastLang());
  }, []);

  const resetDcsOpenWizardState = useCallback(() => {
    setDcsWizardStep(0);
    setDcsTab('public');
    setDcsLangLc(readLastLang());
    setDcsRepos([]);
    setDcsSelected(null);
    setDcsRef('main');
    setDcsBooks([]);
    setDcsBookPick(null);
    setDcsErr(null);
    setDcsLoading(false);
  }, []);

  useEffect(() => {
    if (!translateOpen) resetTranslateWizardState();
  }, [translateOpen, resetTranslateWizardState]);

  useEffect(() => {
    if (!dcsOpen) resetDcsOpenWizardState();
  }, [dcsOpen, resetDcsOpenWizardState]);

  const bookGroups = useMemo(() => groupedBookSelectItems(), []);

  const translateStepperConfig = useMemo(() => {
    if (translateSourceTab === 'dcs') {
      return {
        steps: [
          { id: 'tr0', label: 'Source' },
          { id: 'tr1', label: 'Language' },
          { id: 'tr2', label: 'Edition' },
          { id: 'tr3', label: 'Open' },
        ],
        currentIndex: translateWizardStep,
      };
    }
    return {
      steps: [
        { id: 'tr0', label: 'Source' },
        { id: 'tr1', label: 'File' },
        { id: 'tr2', label: 'Open' },
      ],
      currentIndex: Math.min(translateWizardStep, 2),
    };
  }, [translateSourceTab, translateWizardStep]);

  const trSelectedLangLabel = useMemo(() => {
    const lc = trDcsLangLc.trim();
    if (!lc) return '';
    const e = catalogLangEntries.find((x) => x.lc === lc);
    return e ? `${e.ln} (${e.lc})` : lc;
  }, [trDcsLangLc, catalogLangEntries]);

  const translateConfigureStep =
    translateSourceTab === 'device' ? translateWizardStep === 2 : translateWizardStep === 3;

  async function onLogoutHome() {
    try {
      localStorage.removeItem(DCS_CREDS_KEY);
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

  useEffect(() => {
    if (!translateOpen || translateWizardStep !== 2 || translateSourceTab !== 'dcs') return;
    const lang = trDcsLangLc.trim();
    if (!lang) {
      setTrCatalogSources([]);
      return;
    }
    let cancelled = false;
    setTrDcsErr(null);

    const cached = peekCatalogSourcesWizardCache(host, lang);
    if (cached) {
      setTrCatalogSources(cached);
      setTrDcsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setTrDcsLoading(true);
    setTrCatalogSources([]);
    void fetchCatalogSourcesWizardCached({ host, lang })
      .then((rows) => {
        if (!cancelled) setTrCatalogSources(rows);
      })
      .catch((e) => {
        if (!cancelled) setTrDcsErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setTrDcsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [translateOpen, translateWizardStep, translateSourceTab, trDcsLangLc, host]);

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
      projectMeta: { name: recent.name, bookCode: pair[0]!, source: 'blank', recentId: recent.id },
    });
    setBlankOpen(false);
  }

  const launchTranslateFromSource = useCallback(
    (
      sourceUsfm: string,
      meta: {
        recentName: string;
        bookCode?: string;
        dcs?: RecentProjectEntry['dcs'];
        overSource: boolean;
        /** Door43 language (e.g. es-419) for catalog helps discovery; omit for device file flow. */
        sourceLanguage?: string;
      },
    ) => {
      const code = meta.bookCode ?? extractBookCodeFromUsfm(sourceUsfm) ?? 'UNK';
      const recent = addRecentProject({
        name: meta.recentName,
        bookCode: code,
        source: 'translate',
        dcs: meta.dcs,
        translateOverSource: meta.overSource,
      });
      const lang = meta.sourceLanguage?.trim();
      if (meta.overSource) {
        goEditor({
          initialUsfm: sourceUsfm,
          skipPersistedDcsInitialFetch: true,
          openReferencePanel: false,
          sourceLanguage: lang,
          projectMeta: { name: recent.name, bookCode: code, source: 'translate', recentId: recent.id },
        });
      } else {
        goEditor({
          initialUsfm: blankTranslationFromSourceUsfm(sourceUsfm),
          sourceReferenceUsfm: sourceUsfm,
          openReferencePanel: true,
          skipPersistedDcsInitialFetch: true,
          sourceLanguage: lang,
          projectMeta: { name: recent.name, bookCode: code, source: 'translate', recentId: recent.id },
        });
      }
      setTranslateOpen(false);
    },
    [goEditor],
  );

  async function onTranslateFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      setTranslatePendingUsfm(text);
      setTranslatePendingMeta({
        recentName: translateFillMode === 'over_source' ? `Over source: ${f.name}` : `Translate from ${f.name}`,
      });
      setTranslateWizardStep(2);
    } catch {
      /* ignore */
    }
  }

  function finishTranslateFromPending() {
    if (!translatePendingUsfm) return;
    const over = translateFillMode === 'over_source';
    launchTranslateFromSource(translatePendingUsfm, {
      recentName: translatePendingMeta?.recentName ?? 'Translate',
      bookCode: translatePendingMeta?.bookCode,
      dcs: translatePendingMeta?.dcs,
      overSource: over,
    });
  }

  async function onSelectCatalogEntry(entry: CatalogEntry) {
    setTrCatalogSelected(entry);
    setTrDcsErr(null);
    let books = booksFromCatalogEntry(entry);
    if (books.length === 0) {
      setTrDcsLoading(true);
      try {
        const hydrated = await fetchCatalogSourceEntry({
          host,
          owner: entry.ownerLogin,
          repo: entry.repoName,
          tag: entry.releaseTag,
        });
        if (hydrated) {
          setTrCatalogSelected(hydrated);
          books = booksFromCatalogEntry(hydrated);
        }
        if (books.length === 0) {
          setTrDcsErr('This release has no USFM books listed in the catalog. Try another version or repository.');
        }
      } catch (e) {
        setTrDcsErr(e instanceof Error ? e.message : String(e));
      } finally {
        setTrDcsLoading(false);
      }
    }
    setTrCatalogBooks(books);
    setTrCatalogBookPick(books.length === 1 ? books[0]!.path : null);
    if (translateOpen && translateWizardStep === 2 && translateSourceTab === 'dcs') {
      setTranslateWizardStep(3);
    }
  }

  async function openCatalogTranslateSource() {
    if (!trCatalogSelected) return;
    const book = trCatalogBooks.find((b) => b.path === trCatalogBookPick);
    if (!book) {
      setTrDcsErr('Select a book.');
      return;
    }
    const ref = trCatalogSelected.releaseTag;
    const over = translateFillMode === 'over_source';
    setTrDcsLoading(true);
    setTrDcsErr(null);
    try {
      const file = await getFileContent({
        host,
        token,
        owner: trCatalogSelected.ownerLogin,
        repo: trCatalogSelected.repoName,
        path: book.path,
        ref,
      });
      launchTranslateFromSource(file.content, {
        recentName: `${trCatalogSelected.title} — ${book.code} (${ref})`,
        bookCode: book.code,
        overSource: over,
        sourceLanguage: trDcsLangLc.trim(),
        dcs: {
          owner: trCatalogSelected.ownerLogin,
          repo: trCatalogSelected.repoName,
          ref,
          path: book.path,
          host,
        },
      });
    } catch (e) {
      setTrDcsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTrDcsLoading(false);
    }
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
      setContinueOpen(false);
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFolderBusy(false);
    }
  }

  async function onContinueFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    const text = await f.text();
    const code = extractBookCodeFromUsfm(text) ?? 'UNK';
    const recent = addRecentProject({ name: f.name, bookCode: code, source: 'continue' });
    goEditor({
      initialUsfm: text,
      skipPersistedDcsInitialFetch: true,
      projectMeta: { name: recent.name, bookCode: code, source: 'continue', recentId: recent.id },
    });
    setContinueOpen(false);
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
    if (!dcsOpen || dcsWizardStep !== 1) return;
    const lang = dcsLangLc.trim();
    if (!lang) return;
    if (dcsTab === 'mine' && !credentials?.token) return;
    void refreshDcsRepos(credentials);
  }, [dcsOpen, dcsWizardStep, dcsLangLc, dcsTab, credentials, refreshDcsRepos]);

  async function onSelectDcsRepo(row: Door43RepoRow) {
    setDcsSelected(row);
    setDcsErr(null);
    setDcsBooks([]);
    setDcsBookPick(null);
    const owner = row.owner ?? row.fullName.split('/')[0];
    const repo = row.name;
    const ref = row.defaultBranch ?? dcsRef;
    if (row.defaultBranch) setDcsRef(row.defaultBranch);
    try {
      const project = await loadDcsProjectDescriptor({
        host,
        token,
        owner: owner!,
        repo,
        ref,
      });
      const books = booksFromDetectedProject(project);
      setDcsBooks(books);
      if (books.length === 1) setDcsBookPick(books[0]!.path);
      if (dcsOpen && dcsWizardStep === 1) setDcsWizardStep(2);
    } catch (e) {
      setDcsErr(e instanceof Error ? e.message : String(e));
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
      const recent = addRecentProject({
        name: `${dcsSelected.fullName} — ${book.code}`,
        bookCode: book.code,
        source: 'dcs',
        dcs: { owner: owner!, repo, ref, path: book.path, host },
      });
      goEditor({
        initialUsfm: file.content,
        skipPersistedDcsInitialFetch: true,
        projectMeta: { name: recent.name, bookCode: book.code, source: 'dcs', recentId: recent.id },
      });
      setDcsOpen(false);
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
      });
      const fileMap = files as Record<string, string>;
      for (const [path, content] of Object.entries(fileMap)) {
        await storage.writeFile(id, path, content);
      }
      setStartProjOpen(false);
      setStartProjId('');
      setStartProjName('');
      setStartProjLang('');
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

  const createEnhancedProject = useCallback(async () => {
    if (!credentials?.token) {
      setLoginContextMessage('Sign in to create a repository on Door43.');
      setHeaderLoginOpen(true);
      return;
    }
    const repoName = enhRepo
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!repoName) {
      setEnhErr('Enter a valid repository name (letters, numbers, hyphens).');
      return;
    }
    const langTag = enhLang.trim() || 'en';
    const title = enhTitle.trim() || repoName;
    setEnhBusy(true);
    setEnhErr(null);
    try {
      const created = await createUserRepo({
        host,
        token: credentials.token,
        name: repoName,
        description: `Enhanced translation project: ${title}`,
        private: false,
        autoInit: true,
      });
      const defaultRef = created.defaultBranch ?? 'main';
      const files = enhancedProjectInitialFiles({ languageTag: langTag, title });
      for (const [path, content] of Object.entries(files)) {
        await createOrUpdateRepoFile({
          host,
          token: credentials.token,
          owner: credentials.username,
          repo: repoName,
          path,
          content,
          message: `Initialize enhanced project: ${path}`,
          branch: defaultRef,
        });
      }
      setEnhOpen(false);
      setEnhRepo('');
      setEnhTitle('');
      navigate(
        `/dcs-project?${new URLSearchParams({
          owner: credentials.username,
          repo: repoName,
          ref: defaultRef,
          host,
        }).toString()}`,
      );
    } catch (e) {
      setEnhErr(e instanceof Error ? e.message : String(e));
    } finally {
      setEnhBusy(false);
    }
  }, [credentials, enhLang, enhRepo, enhTitle, host, navigate]);

  async function reopenRecent(r: RecentProjectEntry) {
    if (r.source === 'dcs' && r.dcs) {
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
        projectMeta: { name: r.name, bookCode: r.bookCode, source: 'blank', recentId: r.id },
      });
      return;
    }
    if (r.source === 'translate' && r.dcs) {
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
    alert('Re-open this project by choosing the file again from “Continue project”.');
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="border-border flex items-center justify-between gap-4 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <BookOpen className="text-primary size-8" aria-hidden />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Scripture Editor</h1>
            <p className="text-muted-foreground text-sm">Start or open a translation project</p>
          </div>
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
          <Button asChild variant="outline" size="sm">
            <Link to="/editor">Quick editor</Link>
          </Button>
        </div>
      </header>
      {dcsLoading ? (
        <div className="bg-primary/80 fixed left-0 right-0 top-0 z-40 h-1 animate-pulse" aria-busy="true" />
      ) : null}

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => setBlankOpen(true)}
            className="border-primary/30 bg-card hover:bg-accent/50 flex flex-col items-start gap-2 rounded-xl border-2 p-6 text-left shadow-sm transition-colors sm:col-span-1"
          >
            <Plus className="text-primary size-7" />
            <span className="text-lg font-semibold">New blank book</span>
            <span className="text-muted-foreground text-sm">Pick a USFM book code and open chapter 1 with minimal headers.</span>
          </button>

          <button
            type="button"
            onClick={() => setTranslateOpen(true)}
            className="border-primary/30 bg-card hover:bg-accent/50 flex flex-col items-start gap-2 rounded-xl border-2 p-6 text-left shadow-sm transition-colors sm:col-span-1"
          >
            <Globe className="text-primary size-7" />
            <span className="text-lg font-semibold">Translate from source</span>
            <span className="text-muted-foreground text-sm">
              From your device or published Bible sources on Door43. Guided steps.
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setStartProjErr(null);
              setStartProjOpen(true);
            }}
            className="border-primary/30 bg-card hover:bg-accent/50 flex flex-col items-start gap-2 rounded-xl border-2 p-6 text-left shadow-sm transition-colors sm:col-span-1 lg:col-span-1"
          >
            <FolderPlus className="text-primary size-7" />
            <span className="text-lg font-semibold">Start project</span>
            <span className="text-muted-foreground text-sm">
              Create a local translation project (Resource Container). Pick a language and add books as you go.
            </span>
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setContinueOpen(true)}
            className="border-border bg-card hover:bg-accent/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left text-sm shadow-sm transition-colors"
          >
            <FolderOpen className="text-primary size-5" />
            <span className="font-semibold">Continue project</span>
            <span className="text-muted-foreground text-xs">Open a file or Burrito / RC folder from disk.</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDcsOpen(true);
              setDcsWizardStep(0);
              setDcsSelected(null);
              setDcsBooks([]);
              setDcsRepos([]);
              setDcsErr(null);
            }}
            className="border-border bg-card hover:bg-accent/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left text-sm shadow-sm transition-colors"
          >
            <Search className="text-primary size-5" />
            <span className="font-semibold">Open from DCS</span>
            <span className="text-muted-foreground text-xs">Browse Door43 repositories by language (public or your access).</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEnhErr(null);
              setEnhOpen(true);
            }}
            className="border-border bg-card hover:bg-accent/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left text-sm shadow-sm transition-colors sm:col-span-2"
          >
            <Sparkles className="text-primary size-5" />
            <span className="font-semibold">Create enhanced project on DCS</span>
            <span className="text-muted-foreground text-xs">
              New Scripture Burrito repo with <code className="text-xs">checkings/</code>, <code className="text-xs">alignments/</code>, and
              extension hooks. Requires sign-in.
            </span>
          </button>
        </div>

        {localProjects.length > 0 ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Local projects</h2>
            <ul className="border-border divide-y rounded-lg border">
              {localProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Button variant="link" asChild className="h-auto min-w-0 truncate p-0 text-left font-medium">
                      <Link to={`/project/${encodeURIComponent(p.id)}`}>{p.name}</Link>
                    </Button>
                    <p className="text-muted-foreground text-xs">
                      <span className="font-mono">{p.id}</span> · {p.language} · updated {p.updated.slice(0, 10)}
                    </p>
                  </div>
                  <Tip label="Delete project" side="left">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive shrink-0"
                      onClick={() => void deleteLocalProject(p.id)}
                      aria-label="Delete project"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </Tip>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {recentList.length > 0 ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Recent projects</h2>
            <ul className="border-border divide-y rounded-lg border">
              {recentList.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    className="text-primary min-w-0 flex-1 truncate text-left text-sm underline-offset-4 hover:underline"
                    onClick={() => void reopenRecent(r)}
                  >
                    {r.name}
                  </button>
                  <Tip label="Remove from recents" side="left">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      onClick={() => {
                        removeRecentProject(r.id);
                        setRecentList(loadRecentProjects());
                      }}
                      aria-label="Remove from recents"
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  </Tip>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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

      <Dialog open={translateOpen} onOpenChange={setTranslateOpen}>
        <DialogContent
          className="flex max-h-[90vh] flex-col gap-4 overflow-hidden p-6 sm:max-w-xl"
          showCloseButton
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>Translate from source</DialogTitle>
            <DialogDescription>
              {translateWizardStep === 0 && 'Choose where the source text comes from.'}
              {translateWizardStep === 1 && translateSourceTab === 'device' && 'Choose a USFM file on this device.'}
              {translateWizardStep === 1 && translateSourceTab === 'dcs' && 'Choose the language of the published source.'}
              {translateWizardStep === 2 && translateSourceTab === 'dcs' && 'Choose a published Bible text for that language.'}
              {translateConfigureStep && 'Choose how the main editor should start, then open.'}
            </DialogDescription>
          </DialogHeader>

          <Stepper className="shrink-0" currentIndex={translateStepperConfig.currentIndex} steps={translateStepperConfig.steps} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {translateWizardStep === 0 ? (
            <div className="grid shrink-0 gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="border-border hover:bg-accent/50 flex flex-col items-center gap-2 rounded-xl border-2 p-6 text-center transition-colors"
                onClick={() => {
                  setTranslateSourceTab('device');
                  setTranslateWizardStep(1);
                }}
              >
                <Monitor className="text-primary size-10" aria-hidden />
                <span className="font-semibold">This device</span>
                <span className="text-muted-foreground text-xs">Source file on your computer</span>
              </button>
              <button
                type="button"
                className="border-border hover:bg-accent/50 flex flex-col items-center gap-2 rounded-xl border-2 p-6 text-center transition-colors"
                onClick={() => {
                  setTranslateSourceTab('dcs');
                  setTrCatalogSources([]);
                  setTrCatalogSelected(null);
                  setTranslateWizardStep(1);
                }}
              >
                <Globe className="text-primary size-10" aria-hidden />
                <span className="font-semibold">Door43</span>
                <span className="text-muted-foreground text-xs">Published Bible sources</span>
              </button>
            </div>
          ) : null}

          {translateWizardStep === 1 && translateSourceTab === 'device' ? (
            <div className="flex shrink-0 flex-col gap-3">
              <input
                ref={translateFileRef}
                type="file"
                className="hidden"
                accept=".usfm,.sfm,.usj,.usx,.txt,.xml,.json"
                onChange={onTranslateFile}
              />
              <Button type="button" className="gap-2" onClick={() => translateFileRef.current?.click()}>
                <Upload className="size-4" aria-hidden />
                Choose source file…
              </Button>
            </div>
          ) : null}

          {translateWizardStep === 1 && translateSourceTab === 'dcs' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              <Door43LanguagePicker
                hideLabel
                fillListHeight
                className="min-h-0 flex-1"
                idPrefix="tr-dcs"
                entries={catalogLangEntries}
                valueLc={trDcsLangLc}
                onChangeLc={(lc) => {
                  setTrDcsLangLc(lc);
                  writeLastLang(lc);
                  setTrCatalogSources([]);
                  setTrCatalogSelected(null);
                  setTrCatalogBooks([]);
                  setTrCatalogBookPick(null);
                  if (lc.trim()) {
                    setTranslateWizardStep(2);
                  }
                }}
              />
              <p className="text-muted-foreground shrink-0 text-xs leading-relaxed">
                Next, choose a published Bible edition from Door43 for this language.
              </p>
            </div>
          ) : null}

          {translateWizardStep === 2 && translateSourceTab === 'dcs' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              {trDcsErr ? <p className="text-destructive shrink-0 text-sm">{trDcsErr}</p> : null}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <p className="text-foreground mb-1.5 shrink-0 text-sm font-medium">
                  Published editions
                  {trSelectedLangLabel ? (
                    <span className="text-muted-foreground font-normal" title={`Language: ${trSelectedLangLabel}`}>
                      {' · '}
                      {trSelectedLangLabel}
                    </span>
                  ) : null}
                </p>
                <TranslateCatalogSourceList
                  fillHeight
                  entries={trCatalogSources}
                  loading={trDcsLoading}
                  rowKey={catalogEntryKey}
                  selectedKey={trCatalogSelected ? catalogEntryKey(trCatalogSelected) : null}
                  onSelect={onSelectCatalogEntry}
                />
              </div>
            </div>
          ) : null}

          {translateConfigureStep ? (
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-2',
                translateSourceTab === 'dcs' && trCatalogSelected ? 'overflow-hidden' : 'overflow-y-auto',
              )}
            >
              {translateSourceTab === 'device' || trCatalogSelected ? (
                <div
                  className={cn(
                    'text-muted-foreground flex shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-muted/15 px-2 py-0.5 text-[11px] leading-tight sm:text-xs',
                    translateSourceTab === 'device' ? '' : 'min-w-0',
                  )}
                  title={
                    translateSourceTab === 'device'
                      ? 'Source file'
                      : trCatalogSelected
                        ? `Language: ${trSelectedLangLabel ?? ''} · ${trCatalogSelected.title}`
                        : undefined
                  }
                >
                  {translateSourceTab === 'device' ? (
                    <>
                      <FileText className="size-3 shrink-0 opacity-70" aria-hidden />
                      <span className="min-w-0 truncate text-foreground">
                        {translateDeviceSourceFileName(translatePendingMeta?.recentName)}
                        {translatePendingUsfm
                          ? (() => {
                              const bc = extractBookCodeFromUsfm(translatePendingUsfm);
                              if (!bc) return null;
                              const row = USFM_BOOK_CODES.find(([c]) => c === bc);
                              const label = row ? `${row[1]} (${row[0]})` : bc;
                              return <span className="text-muted-foreground">{` · ${label}`}</span>;
                            })()
                          : null}
                      </span>
                    </>
                  ) : trCatalogSelected ? (
                    <>
                      <Globe className="size-3 shrink-0 opacity-70" aria-hidden />
                      <span className="min-w-0 truncate">
                        {trSelectedLangLabel ? (
                          <span className="font-medium text-foreground">{trSelectedLangLabel}</span>
                        ) : null}
                        {trSelectedLangLabel ? <span className="text-muted-foreground/80"> · </span> : null}
                        <span className="text-foreground/95">{trCatalogSelected.title}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          ({trCatalogSelected.abbreviation}) {trCatalogSelected.releaseTag}
                        </span>
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}

              {translateSourceTab === 'dcs' && trCatalogSelected ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                  <div className="text-foreground flex shrink-0 items-center gap-2 text-sm font-semibold">
                    <BookOpen className="size-4 shrink-0 opacity-80" aria-hidden />
                    Book
                  </div>
                  <BookCombobox
                    hideLabel
                    fillListHeight
                    className="min-h-0 flex-1"
                    idPrefix="tr-catalog"
                    books={trCatalogBooks}
                    valuePath={trCatalogBookPick}
                    onChangePath={setTrCatalogBookPick}
                    disabled={trDcsLoading}
                  />
                </div>
              ) : null}

              <div className="border-border/60 flex shrink-0 items-center justify-between gap-3 border-t pt-2">
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Sparkles className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  Autofill
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={translateFillMode === 'over_source'}
                  aria-label={
                    translateFillMode === 'over_source'
                      ? 'Autofill on: source in main editor'
                      : 'Autofill off: blank editor, source in reference panel'
                  }
                  title={
                    translateFillMode === 'over_source'
                      ? 'Source is opened in the main editor.'
                      : 'Main editor starts blank; source stays in the side reference panel.'
                  }
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                    translateFillMode === 'over_source' ? 'bg-primary/85' : 'bg-muted',
                  )}
                  onClick={() =>
                    setTranslateFillMode(translateFillMode === 'over_source' ? 'blank_reference' : 'over_source')
                  }
                >
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none block size-4 rounded-full bg-background shadow ring-1 ring-border/60 transition-transform',
                      translateFillMode === 'over_source' ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
            </div>
          ) : null}
          </div>

          <DialogFooter
            className={cn(
              'border-border mt-auto flex shrink-0 flex-row flex-wrap items-center gap-2 border-t pt-4 sm:gap-3',
              translateWizardStep > 0 ? 'justify-between' : 'justify-end',
            )}
          >
            {translateWizardStep > 0 ? (
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground -ml-2 gap-1 px-2"
                  onClick={() => {
                    setTranslateWizardStep((s) => Math.max(0, s - 1));
                    setTrDcsErr(null);
                  }}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Back
                </Button>
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="secondary" className="shrink-0" onClick={() => setTranslateOpen(false)}>
                Cancel
              </Button>
              {translateWizardStep === 1 && translateSourceTab === 'dcs' ? (
                <Button
                  type="button"
                  className="shrink-0 gap-2"
                  disabled={!trDcsLangLc.trim()}
                  onClick={() => setTranslateWizardStep(2)}
                >
                  Continue
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              ) : null}
              {translateConfigureStep ? (
                translateSourceTab === 'device' ? (
                  <Button
                    type="button"
                    className="shrink-0 gap-2"
                    disabled={!translatePendingUsfm}
                    onClick={() => finishTranslateFromPending()}
                  >
                    <BookOpen className="size-4" aria-hidden />
                    Open in editor
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="shrink-0 gap-2"
                    disabled={trDcsLoading || !trCatalogSelected || !trCatalogBookPick}
                    onClick={() => void openCatalogTranslateSource()}
                  >
                    {trDcsLoading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
                    <BookOpen className="size-4 shrink-0" aria-hidden />
                    Open in editor
                  </Button>
                )
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={continueOpen} onOpenChange={setContinueOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Continue project</DialogTitle>
            <DialogDescription>Open an existing file or a project folder (Scripture Burrito or Resource Container).</DialogDescription>
          </DialogHeader>
          <input ref={continueFileRef} type="file" className="hidden" accept=".usfm,.sfm,.usj,.usx,.txt,.xml,.json" onChange={onContinueFile} />
          <div className="flex flex-col gap-2">
            <Button type="button" className="gap-2" onClick={() => continueFileRef.current?.click()}>
              <Upload className="size-4" aria-hidden />
              Open file…
            </Button>
            <Button type="button" variant="outline" className="gap-2" disabled={folderBusy} onClick={() => void pickProjectFolder()}>
              {folderBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FolderOpen className="size-4" aria-hidden />}
              Open project folder…
            </Button>
            {folderErr ? <p className="text-destructive text-sm">{folderErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setContinueOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dcsOpen} onOpenChange={setDcsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Open from DCS</DialogTitle>
            <DialogDescription>
              {dcsWizardStep === 0 && 'Choose a language for Bible and aligned-Bible repositories.'}
              {dcsWizardStep === 1 && 'Pick public listings or your own access, then choose a repository.'}
              {dcsWizardStep === 2 && 'Choose branch and book, then open.'}
            </DialogDescription>
          </DialogHeader>

          <Stepper
            className="mb-2"
            currentIndex={dcsWizardStep}
            steps={[
              { id: 'd0', label: 'Language' },
              { id: 'd1', label: 'Repository' },
              { id: 'd2', label: 'Book' },
            ]}
          />

          {dcsWizardStep > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground -mt-1 mb-2 self-start gap-1 px-0"
              onClick={() => setDcsWizardStep((s) => Math.max(0, s - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Back
            </Button>
          ) : null}

          {dcsWizardStep === 0 ? (
            <div className="flex flex-col gap-3">
              <Door43LanguagePicker
                variant="panel"
                idPrefix="dcs-open"
                entries={langEntries}
                valueLc={dcsLangLc}
                onChangeLc={(lc) => {
                  setDcsLangLc(lc);
                  writeLastLang(lc);
                  setDcsRepos([]);
                  setDcsSelected(null);
                  setDcsBooks([]);
                }}
              />
              <p className="text-muted-foreground text-xs">Bible and aligned-Bible repositories on Door43.</p>
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
                  <Button variant="link" asChild className="mt-1 h-auto px-0 py-0 text-xs">
                    <Link
                      to={`/dcs-project?${new URLSearchParams({
                        owner: dcsSelected.owner ?? dcsSelected.fullName.split('/')[0]!,
                        repo: dcsSelected.name,
                        ref: dcsRef || dcsSelected.defaultBranch || 'main',
                        host,
                      }).toString()}`}
                    >
                      Project dashboard
                    </Link>
                  </Button>
                </div>
              </div>
              <details className="text-sm">
                <summary className="text-muted-foreground cursor-pointer">Advanced: branch / ref</summary>
                <div className="pt-2">
                  <Label>Branch / ref</Label>
                  <Input value={dcsRef} onChange={(e) => setDcsRef(e.target.value)} />
                </div>
              </details>
              <BookCombobox
                idPrefix="dcs-open"
                books={dcsBooks}
                valuePath={dcsBookPick}
                onChangePath={setDcsBookPick}
                disabled={dcsLoading}
              />
            </div>
          ) : null}

          <DialogFooter className="flex-row flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" className="shrink-0" onClick={() => setDcsOpen(false)}>
              Cancel
            </Button>
            {dcsWizardStep === 2 ? (
              <Button type="button" className="shrink-0 gap-2" disabled={dcsLoading || !dcsSelected || !dcsBookPick} onClick={() => void openDcsBook()}>
                {dcsLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BookOpen className="size-4" aria-hidden />}
                Open in editor
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={enhOpen}
        onOpenChange={(o) => {
          setEnhOpen(o);
          if (!o) setEnhErr(null);
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Create enhanced project</DialogTitle>
            <DialogDescription>
              Creates a new repository under your Door43 user with the enhanced directory layout (metadata, checkings, alignments placeholders).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="enh-repo">Repository name</Label>
              <Input
                id="enh-repo"
                value={enhRepo}
                onChange={(e) => setEnhRepo(e.target.value)}
                placeholder="my-translation-es"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="enh-lang">Target language tag (BCP-47)</Label>
              <Input id="enh-lang" value={enhLang} onChange={(e) => setEnhLang(e.target.value)} placeholder="es-419" />
            </div>
            <div>
              <Label htmlFor="enh-title">Project title</Label>
              <Input id="enh-title" value={enhTitle} onChange={(e) => setEnhTitle(e.target.value)} placeholder="My translation" />
            </div>
            {enhErr ? <p className="text-destructive text-sm">{enhErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEnhOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={enhBusy} onClick={() => void createEnhancedProject()}>
              {enhBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Create on Door43
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={startProjOpen}
        onOpenChange={(o) => {
          setStartProjOpen(o);
          if (!o) setStartProjErr(null);
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Start project</DialogTitle>
            <DialogDescription>
              Creates a local Resource Container project in this browser (IndexedDB). You can add books from the project dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="start-proj-id">Bible ID (3-8 letters)</Label>
              <Input
                id="start-proj-id"
                value={startProjId}
                onChange={(e) => setStartProjId(e.target.value.toUpperCase())}
                placeholder="RVR"
                maxLength={8}
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="start-proj-name">Project name</Label>
              <Input
                id="start-proj-name"
                value={startProjName}
                onChange={(e) => setStartProjName(e.target.value)}
                placeholder="Reina Valera"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="start-proj-lang">Target language (BCP-47)</Label>
              <Input
                id="start-proj-lang"
                value={startProjLang}
                onChange={(e) => setStartProjLang(e.target.value)}
                placeholder="es-419"
                autoComplete="off"
              />
            </div>
            {startProjErr ? <p className="text-destructive text-sm">{startProjErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setStartProjOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={startProjBusy} onClick={() => void createLocalProject()}>
              {startProjBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Create project
            </Button>
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
            if (dcsOpen) setDcsWizardStep(1);
            void refreshDcsRepos(next);
          }
        }}
      />
    </div>
  );
}
