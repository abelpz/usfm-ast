import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { USFM_BOOK_CODES } from '@usfm-tools/editor';
import { inferBookCodeFromPath } from '@/lib/file-conflict-helpers';
import { blankUsfmForBook } from '@/lib/usfm-project';
import { getProjectStorage } from '@/lib/project-storage';
import { readConflictWorkspaceState, type ConflictWorkspacePayload } from '@/lib/conflict-workspace-state';
import { ConflictSolverPanel } from '@/components/ConflictSolverPanel';
import { ChapterConflictReviewPanel } from '@/components/ChapterConflictReviewPanel';
import { ConflictChapterNavigator } from '@/components/ConflictChapterNavigator';
import { ReferenceColumn } from '@/components/ReferenceColumn';
import { EditorPanel } from '@/components/EditorPanel';
import { loadDcsCredentials } from '@/lib/dcs-storage';
import type { FileConflict, ProjectMeta } from '@usfm-tools/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ScriptureSessionController } from '@/hooks/useScriptureSession';

function firstUsfmConflict(conflicts: FileConflict[]): FileConflict | null {
  return conflicts.find((c) => /\.(usfm|sfm)$/i.test(c.path)) ?? null;
}

function initialUsfmFromConflicts(conflicts: FileConflict[]): string | null {
  const c = firstUsfmConflict(conflicts);
  if (!c) return null;
  const pick = c.oursText?.trim() ? c.oursText : c.theirsText;
  return pick?.trim() ? pick : null;
}

function isUsfmConflict(c: FileConflict | null): c is FileConflict {
  return Boolean(c && /\.(usfm|sfm)$/i.test(c.path));
}

export function ConflictWorkspacePage() {
  const { id: projectId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const storage = useMemo(() => getProjectStorage(), []);
  const creds = useMemo(() => loadDcsCredentials(), []);

  const routePayload = useMemo(
    () => readConflictWorkspaceState(location.state),
    [location.state],
  );

  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [payload, setPayload] = useState<ConflictWorkspacePayload | null>(routePayload);
  const [fileConflicts, setFileConflicts] = useState<FileConflict[]>(
    routePayload?.kind === 'file' ? routePayload.conflicts : [],
  );
  const [loading, setLoading] = useState(true);
  const [referencePanel] = useState(true);
  const [activeConflictIndex, setActiveConflictIndex] = useState(0);
  const [activeUsfmChapter, setActiveUsfmChapter] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!projectId) return;
      setLoading(true);
      const m = await storage.getProject(projectId);
      if (cancelled) return;
      setMeta(m ?? null);

      // If route payload is absent, default to pending local sync conflicts.
      if (!routePayload && m?.pendingConflicts && m.pendingConflicts.length > 0) {
        const fallback: ConflictWorkspacePayload = {
          kind: 'file',
          origin: 'local-sync',
          projectId,
          conflicts: m.pendingConflicts,
          defaultOursLabel: 'Yours (local)',
          defaultTheirsLabel: 'From Door43',
        };
        setPayload(fallback);
        setFileConflicts(fallback.conflicts);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, routePayload, storage]);

  const returnTo = payload?.returnTo
    ?? (payload?.kind === 'chapter'
      ? `/project/${encodeURIComponent(projectId)}/editor`
      : `/project/${encodeURIComponent(projectId)}`);

  const conflictBookCode = useMemo(() => {
    if (payload?.kind !== 'file') return null;
    for (const c of fileConflicts) {
      const code = inferBookCodeFromPath(c.path);
      if (code) return code;
    }
    return null;
  }, [payload?.kind, fileConflicts]);

  const chapterLaunchBookCode =
    payload?.kind === 'chapter' ? payload.launchBookCode : null;
  const fallbackBookCode = conflictBookCode ?? chapterLaunchBookCode ?? null;
  const initialUsfm = useMemo(() => {
    if (payload?.kind === 'file') {
      const fromConflict = initialUsfmFromConflicts(fileConflicts);
      if (fromConflict) return fromConflict;
    }
    if (fallbackBookCode) {
      const row = USFM_BOOK_CODES.find(([c]) => c === fallbackBookCode);
      return blankUsfmForBook(fallbackBookCode, row?.[1] ?? fallbackBookCode);
    }
    return '\\id XXX\n';
  }, [payload?.kind, fileConflicts, fallbackBookCode]);

  const [ctrl, setCtrl] = useState<ScriptureSessionController | null>(null);

  const activeConflict = payload?.kind === 'file'
    ? fileConflicts[activeConflictIndex] ?? null
    : null;
  const activeConflictChapters = useMemo(() => {
    if (!isUsfmConflict(activeConflict)) return [];
    const unique = [...new Set(activeConflict.chapterIndices.filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);
    const positive = unique.filter((n) => n > 0);
    if (positive.length > 0) return positive;
    const sessionChapters = ctrl
      ? ctrl.session.getNavigableContentPages()
        .filter((p) => p.kind === 'chapter')
        .map((p) => p.chapter)
      : [];
    const firstContentChapter = sessionChapters.find((n) => n > 0) ?? 1;
    return unique.length > 0 ? [firstContentChapter] : [];
  }, [activeConflict, ctrl]);

  useEffect(() => {
    setActiveConflictIndex(0);
  }, [fileConflicts]);

  useEffect(() => {
    if (!isUsfmConflict(activeConflict)) {
      setActiveUsfmChapter(null);
      return;
    }
    const nextChapter = activeConflictChapters[0] ?? 1;
    setActiveUsfmChapter(nextChapter);
    ctrl?.session.navigateToChapter(nextChapter);
  }, [activeConflict, activeConflictChapters, ctrl]);

  const handleConflictChapterNavigate = (chapter: number) => {
    setActiveUsfmChapter(chapter);
  };

  const onResolveFileConflict = async (
    path: string,
    choice: 'ours' | 'theirs' | 'merged',
    mergedText?: string,
  ) => {
    const c = fileConflicts.find((x) => x.path === path);
    if (!c) return;
    const text =
      choice === 'merged' && mergedText !== undefined
        ? mergedText
        : choice === 'theirs'
          ? c.theirsText
          : c.oursText;

    if (text === '') await storage.deleteFile(projectId, path);
    else await storage.writeFile(projectId, path, text);

    const next = fileConflicts.filter((x) => x.path !== path);
    setFileConflicts(next);

    if (payload?.kind === 'file') {
      await storage.updateProject(projectId, {
        pendingConflicts: next.length > 0 ? next : undefined,
      });
      setMeta((m) =>
        m
          ? {
              ...m,
              pendingConflicts: next.length > 0 ? next : undefined,
            }
          : null,
      );
    }
  };

  const closeWorkspace = () => {
    navigate(returnTo, { replace: true });
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading conflict workspace…</div>;
  }

  if (!payload) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-muted-foreground">No active conflicts were found for this project.</p>
        <Button size="sm" onClick={() => navigate(`/project/${encodeURIComponent(projectId)}`)}>
          Back to project
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden antialiased">
      <div
        className="pointer-events-none absolute -left-[200vw] top-0 h-[80vh] w-[60vw] overflow-hidden opacity-0"
        aria-hidden
      >
        <EditorPanel
          initialUsfm={initialUsfm}
          collabActive={false}
          wsRelay=""
          dcsCreds={creds}
          dcsTarget={null}
          targetLanguage={meta?.language}
          onController={setCtrl}
          className="h-full w-full"
        />
      </div>

      <div className="border-border flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-1 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground shrink-0 underline-offset-4 hover:underline">
          Home
        </Link>
        <button
          type="button"
          onClick={closeWorkspace}
          className="text-muted-foreground hover:text-foreground shrink-0 underline-offset-4 hover:underline"
        >
          Back
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4 pt-4">
          {ctrl && payload.kind === 'file' && isUsfmConflict(activeConflict) ? (
            <ConflictChapterNavigator
              session={ctrl.session}
              conflictChapters={activeConflictChapters}
              onConflictChapterNavigate={handleConflictChapterNavigate}
            />
          ) : null}

          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden',
              referencePanel
                ? 'flex-col landscape:flex-row landscape:items-stretch'
                : 'flex-col',
            )}
          >
            {referencePanel ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {ctrl ? (
                  <ReferenceColumn
                    session={ctrl.session}
                    targetSession={ctrl.session}
                    dcsAuth={creds ? { host: creds.host, token: creds.token } : null}
                    sourceLanguage={payload.sourceLanguage ?? meta?.sourceRefLanguage ?? meta?.language}
                    launchBookCode={fallbackBookCode ?? undefined}
                    prefillSourceUsfm={payload.sourceReferenceUsfm}
                  />
                ) : (
                  <div className="border-border bg-muted/20 text-muted-foreground flex h-full min-h-0 items-center justify-center rounded-md border text-sm">
                    Loading source reference…
                  </div>
                )}
              </div>
            ) : null}

            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden',
                referencePanel && 'min-h-0 min-w-0 flex-1',
              )}
            >
              {payload.kind === 'file' ? (
                <ConflictSolverPanel
                  conflicts={fileConflicts}
                  onResolve={(path, choice, mergedText) => void onResolveFileConflict(path, choice, mergedText)}
                  onClose={closeWorkspace}
                  defaultOursLabel={payload.defaultOursLabel}
                  defaultTheirsLabel={payload.defaultTheirsLabel}
                  showCancelButton
                  activeIndex={activeConflictIndex}
                  onActiveIndexChange={setActiveConflictIndex}
                  activeUsfmChapter={activeUsfmChapter}
                  onActiveUsfmChapterChange={setActiveUsfmChapter}
                  className="border rounded-md"
                />
              ) : (
                <ChapterConflictReviewPanel
                  conflicts={payload.conflicts}
                  onClose={closeWorkspace}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
