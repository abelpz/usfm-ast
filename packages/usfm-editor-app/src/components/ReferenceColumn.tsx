import type { ScriptureSession, SourceTextSession } from '@usfm-tools/editor';
import { DcsSourceTextProvider, type DcsSourceTextOptions } from '@usfm-tools/editor-adapters';
import type { HelpEntry, HelpLink } from '@usfm-tools/types';
import { Book, Languages, LifeBuoy, Loader2, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HelpArticleOverlay } from '@/components/reference/HelpArticleOverlay';
import { HelpsTab } from '@/components/reference/HelpsTab';
import { SourcePanel } from '@/components/SourcePanel';
import { Tip } from '@/components/Tip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  useAnnotatedVerse,
  useHelpsDecorations,
  useHelpsForContentPage,
  type HelpsContentPage,
} from '@/hooks/useAnnotatedSource';
import { useArticleTitles, extractMarkdownH1 } from '@/hooks/useArticleTitles';
import { useHelpsDiscovery } from '@/hooks/useHelpsDiscovery';
import { useHelpsTsvLoader } from '@/hooks/useHelpsTsvLoader';
import { fetchHelpArticleMarkdown } from '@/lib/fetch-help-article';
import {
  DEFAULT_HELPS_CONFIG,
  type HelpsResourceConfig,
} from '@/lib/helps-config-storage';
import {
  DEFAULT_CATALOG_TOPIC,
  fetchCatalogLanguages,
  searchCatalogSources,
  type CatalogEntry,
  type Door43LanguageOption,
} from '@/dcs-client';
import { cn } from '@/lib/utils';

type DcsAuth = { host: string; token?: string } | null;

type Props = {
  session: ScriptureSession;
  onSourceSession?: (source: SourceTextSession | null) => void;
  prefillSourceUsfm?: string;
  targetSession: ScriptureSession | null;
  dcsAuth: DcsAuth;
  /** From translate wizard — enables tc-ready catalog discovery for TN/TWL. */
  sourceLanguage?: string;
  /** Book code when reference USFM not loaded yet (e.g. from launch meta). */
  launchBookCode?: string;
  /** Called when the user picks or clears the source reference language. */
  onSourceLanguageChange?: (lc: string | null) => void;
};

type ColumnTab = 'source' | 'helps';

function newSourceSlotId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `src-${crypto.randomUUID()}`
    : `src-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type SourceSlotState = { id: string; label: string; session: SourceTextSession | null };

/**
 * Reference sidebar: Source / Helps tabs, catalog-driven TN/TWL, annotated verse tokens, article overlay.
 */
export function ReferenceColumn({
  session,
  onSourceSession,
  prefillSourceUsfm,
  targetSession,
  dcsAuth,
  sourceLanguage,
  launchBookCode,
  onSourceLanguageChange,
}: Props) {
  const [sourceSlots, setSourceSlots] = useState<SourceSlotState[]>(() => [
    { id: newSourceSlotId(), label: 'Source', session: null },
  ]);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [openDrawerForSlotId, setOpenDrawerForSlotId] = useState<string | null>(null);
  const slotEmitters = useRef(new Map<string, (s: SourceTextSession | null) => void>());
  /** Pending DcsSourceTextProvider loads keyed by slot id — populated during catalog auto-load. */
  const pendingLoads = useRef(new Map<string, DcsSourceTextOptions>());

  const getSlotSessionEmitter = useCallback((slotId: string) => {
    let fn = slotEmitters.current.get(slotId);
    if (!fn) {
      fn = (s: SourceTextSession | null) => {
        setSourceSlots((prev) =>
          prev.map((sl) => {
            if (sl.id !== slotId) return sl;
            // Prefer the short label we set during catalog auto-load (abbreviation),
            // only fall back to provider displayName for manually-loaded sources
            // where sl.label is the default placeholder "Source N".
            const providerName = s?.getProvider()?.displayName?.trim();
            const isPlaceholder = /^Source(\s+\d+)?$/.test(sl.label);
            const label = s
              ? (isPlaceholder && providerName ? providerName : sl.label)
              : sl.label;
            return { ...sl, session: s, label };
          }),
        );
        // Trigger any pending catalog load for this slot.
        // Subscribe to onLoad BEFORE calling load() to guarantee setRev fires even
        // when the fetch resolves as a cached microtask (before the sourceSlots effect
        // can subscribe in the next render cycle).
        if (s && pendingLoads.current.has(slotId)) {
          const opts = pendingLoads.current.get(slotId)!;
          pendingLoads.current.delete(slotId);
          const unsub = s.onLoad(() => {
            unsub();
            setRev((r) => r + 1);
          });
          void s.load(new DcsSourceTextProvider(opts));
        }
      };
      slotEmitters.current.set(slotId, fn);
    }
    return fn;
  }, []);

  const activeSourceSession = sourceSlots[activeSourceIndex]?.session ?? null;

  const [columnTab, setColumnTab] = useState<ColumnTab>('source');
  const [rev, setRev] = useState(0);
  const [tokenFilter, setTokenFilter] = useState<HelpEntry[] | null>(null);

  const [articleOpen, setArticleOpen] = useState(false);
  const [articleTitle, setArticleTitle] = useState('');
  const [articleBody, setArticleBody] = useState<string | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);

  // ── Language picker ────────────────────────────────────────────────────────
  /**
   * User-selected source language; overrides auto-detected language for catalog discovery.
   * Initialized from the `sourceLanguage` prop so a persisted preference auto-loads on mount.
   */
  const [manualSourceLang, setManualSourceLang] = useState<string | null>(
    () => sourceLanguage?.trim() || null,
  );
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [langList, setLangList] = useState<Door43LanguageOption[]>([]);
  const [langQuery, setLangQuery] = useState('');
  const [langLoading, setLangLoading] = useState(false);
  const [langError, setLangError] = useState<string | null>(null);

  const [scriptureLoading, setScriptureLoading] = useState(false);

  // ── Derived state ─────────────────────────────────────────────────────────

  useEffect(() => {
    onSourceSession?.(activeSourceSession);
  }, [activeSourceSession, onSourceSession]);

  useEffect(() => {
    if (!targetSession) return;
    let raf = 0;
    const unsub = targetSession.onChange(() => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setRev((r) => r + 1); });
    });
    return () => { unsub(); cancelAnimationFrame(raf); };
  }, [targetSession]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const sl of sourceSlots) {
      if (sl.session) unsubs.push(sl.session.onLoad(() => setRev((r) => r + 1)));
    }
    return () => unsubs.forEach((u) => u());
  }, [sourceSlots]);

  const bookFromRef = activeSourceSession?.isLoaded()
    ? activeSourceSession.store.getBookCode().trim().toUpperCase()
    : null;
  const bookCode = bookFromRef ?? launchBookCode?.trim().toUpperCase() ?? null;

  // Manual pick > auto-detected from loaded source > launch prop (target lang — lowest priority)
  const detectedSourceLang = activeSourceSession?.getProvider()?.langCode;
  const effectiveLang = manualSourceLang ?? detectedSourceLang ?? sourceLanguage?.trim();

  const catalogHost = dcsAuth?.host?.trim() || DEFAULT_HELPS_CONFIG.host;
  const discovery = useHelpsDiscovery({
    host: catalogHost,
    sourceLanguage: effectiveLang,
    bookCode,
    autoDiscover: Boolean(effectiveLang && bookCode),
  });

  const effectiveConfig: HelpsResourceConfig = useMemo(
    () => discovery.config ?? { ...DEFAULT_HELPS_CONFIG, enabled: false },
    [discovery.config],
  );

  const { twl, tn, loading: tsvLoading, error: tsvError } = useHelpsTsvLoader(
    effectiveConfig,
    bookCode,
    dcsAuth,
  );

  const verseModel = useAnnotatedVerse(targetSession, activeSourceSession, twl, tn, rev);
  const helpsPageRef = useRef<HelpsContentPage | null>(null);
  const helpsPage = useMemo((): HelpsContentPage | null => {
    if (!targetSession) { helpsPageRef.current = null; return null; }
    const cp = targetSession.getContentPage();
    let next: HelpsContentPage | null;
    if (cp.kind === 'introduction' || cp.kind === 'identification') next = { kind: 'introduction' };
    else if (cp.kind === 'chapter') next = { kind: 'chapter', chapter: cp.chapter };
    else next = null;
    const prev = helpsPageRef.current;
    if (
      prev !== null && next !== null &&
      prev.kind === next.kind &&
      (prev.kind !== 'chapter' || (next as { kind: 'chapter'; chapter: number }).chapter === (prev as { kind: 'chapter'; chapter: number }).chapter)
    ) return prev;
    helpsPageRef.current = next;
    return next;
  }, [targetSession, rev]);
  const chapterHelps = useHelpsForContentPage(twl, tn, helpsPage);

  useHelpsDecorations(activeSourceSession, twl, tn, rev);

  const { getTitle, getEntryTitleFromRc } = useArticleTitles(chapterHelps, effectiveConfig, dcsAuth?.token);

  const onHelpsTokenClick = useCallback((entries: HelpEntry[]) => {
    setTokenFilter(entries);
    setColumnTab('helps');
  }, []);

  /** Leaving Helps clears token filter so returning always shows the full chapter list. */
  useEffect(() => {
    if (columnTab !== 'helps') setTokenFilter(null);
  }, [columnTab]);

  useEffect(() => {
    const s = activeSourceSession;
    if (!s) return;
    s.setOnHelpsTokenClick(onHelpsTokenClick);
    return () => {
      s.setOnHelpsTokenClick(null);
    };
  }, [activeSourceSession, onHelpsTokenClick]);

  useEffect(() => {
    setTokenFilter(null);
  }, [verseModel?.chapter, verseModel?.verse]);

  const onOpenLink = useCallback(
    async (link: HelpLink) => {
      if (link.type !== 'tw' && link.type !== 'ta') return;
      const cachedTitle = getTitle(link.type, link.id);
      setArticleTitle(cachedTitle ?? (link.displayText || link.id));
      setArticleOpen(true);
      setArticleLoading(true);
      setArticleError(null);
      setArticleBody(null);
      try {
        const contentId = link.type === 'ta' ? `${link.id}/01` : link.id;
        const md = await fetchHelpArticleMarkdown({
          kind: link.type,
          articleId: contentId,
          config: effectiveConfig,
          token: dcsAuth?.token,
        });
        if (link.type === 'tw') {
          const h1 = extractMarkdownH1(md);
          if (h1) setArticleTitle(h1);
        }
        setArticleBody(md);
      } catch (e) {
        setArticleError(e instanceof Error ? e.message : String(e));
      } finally {
        setArticleLoading(false);
      }
    },
    [effectiveConfig, dcsAuth?.token, getTitle, getEntryTitleFromRc],
  );

  const displayedHelps = tokenFilter ?? chapterHelps;
  const filterActive = Boolean(tokenFilter);

  const addSourceTab = useCallback(() => {
    const id = newSourceSlotId();
    setSourceSlots((prev) => {
      const next = [...prev, { id, label: `Source ${prev.length + 1}`, session: null }];
      setActiveSourceIndex(next.length - 1);
      return next;
    });
    setOpenDrawerForSlotId(id);
  }, []);

  // ── Language picker handlers ───────────────────────────────────────────────

  /** Load available source languages from catalog when picker opens. */
  useEffect(() => {
    if (!langPickerOpen || langList.length > 0) return;
    setLangLoading(true);
    setLangError(null);
    void fetchCatalogLanguages(catalogHost, DEFAULT_CATALOG_TOPIC, 'Aligned Bible,Bible')
      .then((list) => setLangList(list))
      .catch((e) => setLangError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLangLoading(false));
  }, [langPickerOpen, catalogHost, langList.length]);

  const filteredLangs = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return langList;
    return langList.filter(
      (l) =>
        l.lc.toLowerCase().includes(q) ||
        l.ln.toLowerCase().includes(q) ||
        (l.ang ?? '').toLowerCase().includes(q),
    );
  }, [langList, langQuery]);

  const handleLangPick = useCallback((lang: Door43LanguageOption) => {
    setManualSourceLang(lang.lc);
    onSourceLanguageChange?.(lang.lc);
    setLangPickerOpen(false);
    setLangQuery('');
  }, [onSourceLanguageChange]);

  const onClearFilter = useCallback(() => setTokenFilter(null), []);
  const onCloseArticle = useCallback(() => setArticleOpen(false), []);

  /**
   * When a source language is set and we know the current book, search the catalog for
   * all matching Bible resources and load each one into its own source slot via
   * DcsSourceTextProvider (no raw-fetch, no full DOM remount).
   */
  useEffect(() => {
    if (!manualSourceLang || !bookCode) return;
    let cancelled = false;
    setScriptureLoading(true);

    void (async () => {
      try {
        const entries = await searchCatalogSources({
          host: catalogHost,
          lang: manualSourceLang,
          subject: 'Aligned Bible,Bible',
          topic: DEFAULT_CATALOG_TOPIC,
          limit: 20,
          maxPages: 1,
        });
        if (cancelled) return;

        const bookLower = bookCode.toLowerCase();
        type MatchedEntry = { entry: CatalogEntry; filePath: string };
        const matched: MatchedEntry[] = [];
        for (const entry of entries) {
          const ingredient = entry.ingredients.find(
            (i) => i.identifier?.toLowerCase() === bookLower,
          );
          if (ingredient) {
            matched.push({ entry, filePath: ingredient.path.replace(/^\.\//, '') });
          }
        }

        if (!matched.length || cancelled) return;

        // Build one source slot per matching Bible resource
        const newSlots: SourceSlotState[] = matched.map(({ entry }) => ({
          id: newSourceSlotId(),
          label: entry.abbreviation || entry.title || entry.repoName,
          session: null,
        }));
        setSourceSlots(newSlots);
        setActiveSourceIndex(0);
        // Clear old emitter cache so new slot ids get fresh emitters
        slotEmitters.current.clear();
        pendingLoads.current.clear();

        const host = `https://${catalogHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
        for (let i = 0; i < matched.length; i++) {
          const { entry, filePath } = matched[i]!;
          const slotId = newSlots[i]!.id;
          pendingLoads.current.set(slotId, {
            baseUrl: host,
            owner: entry.ownerLogin,
            repo: entry.repoName,
            filePath,
            ref: entry.releaseTag,
          });
        }
      } catch {
        // Non-critical — user can still open a source manually
      } finally {
        if (!cancelled) setScriptureLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [manualSourceLang, bookCode, catalogHost]);

  const currentLangLabel = useMemo(() => {
    if (!manualSourceLang) return null;
    const e = langList.find((l) => l.lc === manualSourceLang);
    return e ? `${e.ln} (${e.lc})` : manualSourceLang;
  }, [manualSourceLang, langList]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2">
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant={columnTab === 'source' ? 'secondary' : 'ghost'}
          className="size-8 shrink-0"
          aria-label="Source"
          title="Source — reference text"
          onClick={() => setColumnTab('source')}
        >
          <Book className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={columnTab === 'helps' ? 'secondary' : 'ghost'}
          className="size-8 shrink-0"
          aria-label="Helps"
          title="Helps — translation notes"
          onClick={() => setColumnTab('helps')}
        >
          <LifeBuoy className="size-4" aria-hidden />
        </Button>

        {/* Language picker */}
        <Popover open={langPickerOpen} onOpenChange={setLangPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-auto size-8 shrink-0"
              aria-label="Pick source language"
              title={currentLangLabel ? `Source: ${currentLangLabel}` : 'Pick source language'}
            >
              {scriptureLoading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Languages className="size-4" aria-hidden />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <div className="flex flex-col gap-0">
              <div className="border-b p-2">
                <Input
                  value={langQuery}
                  onChange={(e) => setLangQuery(e.target.value)}
                  placeholder="Search language…"
                  className="h-7 text-xs"
                  autoFocus
                />
              </div>
              {manualSourceLang && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 border-b px-3 py-1.5 text-xs"
                  onClick={() => { setManualSourceLang(null); onSourceLanguageChange?.(null); setLangPickerOpen(false); }}
                >
                  <X className="size-3" aria-hidden />
                  Clear: {currentLangLabel}
                </button>
              )}
              <div className="max-h-52 overflow-y-auto">
                {langLoading ? (
                  <p className="text-muted-foreground px-3 py-4 text-center text-xs">
                    <Loader2 className="mx-auto mb-1 size-4 animate-spin" aria-hidden />
                    Loading languages…
                  </p>
                ) : langError ? (
                  <p className="text-destructive px-3 py-2 text-xs">{langError}</p>
                ) : filteredLangs.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-2 text-xs">No languages found.</p>
                ) : (
                  filteredLangs.map((l) => (
                    <button
                      key={l.lc}
                      type="button"
                      onClick={() => handleLangPick(l)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent',
                        l.lc === manualSourceLang && 'bg-primary/10 font-medium text-primary',
                      )}
                    >
                      <span className="font-mono text-muted-foreground w-10 shrink-0">{l.lc}</span>
                      <span className="truncate">{l.ln}{l.ang && l.ang !== l.ln ? ` · ${l.ang}` : ''}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ── Status messages ─────────────────────────────────────────────── */}
      {discovery.loading ? (
        <p className="text-muted-foreground text-xs">Discovering translation helps…</p>
      ) : null}
      {discovery.error ? <p className="text-destructive text-xs">{discovery.error}</p> : null}
      {effectiveConfig.enabled && tsvLoading ? (
        <p className="text-muted-foreground text-xs">Loading TWL/TN…</p>
      ) : null}
      {effectiveConfig.enabled && tsvError ? <p className="text-destructive text-xs">{tsvError}</p> : null}

      {/* ── Main panel card ─────────────────────────────────────────────── */}
      <div className="border-border bg-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border">

        {/* Source tab */}
        <div
          className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2', columnTab !== 'source' && 'hidden')}
          aria-hidden={columnTab !== 'source'}
        >
          {!verseModel && !activeSourceSession?.isLoaded() ? (
            <p className="text-muted-foreground shrink-0 text-xs">
              Open reference text to see scripture with translation helps underlined in the text.
            </p>
          ) : null}
          {/* Source slot tabs */}
          <div className="flex min-h-0 shrink-0 flex-wrap items-center gap-1 border-b border-border pb-2">
            {sourceSlots.map((slot, idx) => (
              <Button
                key={slot.id}
                type="button"
                size="sm"
                variant={idx === activeSourceIndex ? 'secondary' : 'ghost'}
                className="max-w-[140px] shrink-0 truncate"
                title={slot.label}
                onClick={() => setActiveSourceIndex(idx)}
              >
                {slot.label}
              </Button>
            ))}
            <Tip label="Add source">
              <Button type="button" size="icon" variant="outline" className="size-7 shrink-0" onClick={addSourceTab} aria-label="Add source">
                <Plus className="size-3.5" aria-hidden />
              </Button>
            </Tip>
          </div>

          {/* Source panels — no extra border wrapper */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {sourceSlots.map((slot, idx) => (
              <div
                key={slot.id}
                className={cn('absolute inset-0 flex min-h-0 flex-col', idx === activeSourceIndex ? 'z-10' : 'z-0')}
                style={{ display: idx === activeSourceIndex ? 'flex' : 'none' }}
                aria-hidden={idx !== activeSourceIndex}
              >
                <SourcePanel
                  session={session}
                  onSourceSession={getSlotSessionEmitter(slot.id)}
                  prefillSourceUsfm={idx === 0 ? prefillSourceUsfm : undefined}
                  openDrawerOnMount={openDrawerForSlotId === slot.id}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Helps tab */}
        <div
          className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2', columnTab !== 'helps' && 'hidden')}
          aria-hidden={columnTab !== 'helps'}
        >
          <HelpsTab
            entries={displayedHelps}
            onOpenLink={onOpenLink}
            onClearFilter={filterActive ? onClearFilter : undefined}
            filtered={filterActive}
            sourceStore={activeSourceSession?.isLoaded() ? activeSourceSession.store : null}
            getTitle={getTitle}
            getEntryTitleFromRc={getEntryTitleFromRc}
          />
        </div>
      </div>

      <HelpArticleOverlay
        open={articleOpen}
        onClose={onCloseArticle}
        title={articleTitle}
        body={articleBody}
        loading={articleLoading}
        error={articleError}
        getEntryTitleFromRc={getEntryTitleFromRc}
        onOpenResource={onOpenLink}
      />
    </div>
  );
}
