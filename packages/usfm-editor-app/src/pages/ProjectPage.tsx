import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { loadDcsProjectDescriptor, type DetectedDcsProject } from '@/lib/dcs-format-detect';
import { loadDcsCredentials } from '@/lib/dcs-storage';
import {
  projectSourceSummaryFromRc,
  projectSourceSummaryFromSb,
  summarizeEditorCanonicalProject,
  type RepoProjectDescriptor,
} from '@usfm-tools/project-formats';
import type { EnhancedProjectSummary, ProjectSourceSummary } from '@usfm-tools/types';
import { pushEnhancedLayoutToRemote } from '@/lib/dcs-bootstrap-enhanced-layout';
import { ArrowLeft, BookMarked, Layers, ListTree, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

function toDescriptor(project: DetectedDcsProject): RepoProjectDescriptor {
  if (project.format === 'scripture-burrito') return { format: 'scripture-burrito', meta: project.meta };
  if (project.format === 'resource-container') return { format: 'resource-container', manifest: project.manifest };
  return { format: 'raw-usfm', files: project.files };
}

function provenanceFor(project: DetectedDcsProject): ProjectSourceSummary | null {
  if (project.format === 'scripture-burrito') return projectSourceSummaryFromSb(project.meta);
  if (project.format === 'resource-container') return projectSourceSummaryFromRc(project.manifest);
  return null;
}

export function ProjectPage() {
  const [sp] = useSearchParams();
  const owner = (sp.get('owner') ?? '').trim();
  const repo = (sp.get('repo') ?? '').trim();
  const ref = (sp.get('ref') ?? 'main').trim();
  const host = (sp.get('host') ?? 'git.door43.org').trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [project, setProject] = useState<DetectedDcsProject | null>(null);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [bootstrapErr, setBootstrapErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!owner || !repo) {
      setErr('Missing owner or repo in URL. Open the dashboard from the home page after selecting a repository.');
      setLoading(false);
      return;
    }
    const creds = loadDcsCredentials();
    const token = creds?.token;
    setLoading(true);
    setErr(null);
    try {
      const p = await loadDcsProjectDescriptor({
        host: host || undefined,
        token: token || undefined,
        owner,
        repo,
        ref: ref || 'main',
      });
      setProject({ ...p, ref: ref || 'main' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [host, owner, repo, ref]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary: EnhancedProjectSummary | null = useMemo(() => {
    if (!project) return null;
    return summarizeEditorCanonicalProject(toDescriptor(project), project.enhanced);
  }, [project]);

  const canBootstrap =
    project &&
    project.format !== 'raw-usfm' &&
    !project.enhanced &&
    loadDcsCredentials()?.token;

  const prov = useMemo(() => (project ? provenanceFor(project) : null), [project]);

  const title = `${owner}/${repo}`;

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="border-border flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link to="/">
            <ArrowLeft className="size-4" />
            Home
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">Project</h1>
          <p className="text-muted-foreground truncate text-xs">{title}</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : err ? (
          <p className="text-destructive text-sm">{err}</p>
        ) : summary ? (
          <>
            <section className="border-border rounded-lg border p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <BookMarked className="size-4" />
                Overview
              </h2>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Format</dt>
                  <dd>{summary.format}</dd>
                </div>
                {summary.title ? (
                  <div>
                    <dt className="text-muted-foreground">Title</dt>
                    <dd>{summary.title}</dd>
                  </div>
                ) : null}
                {summary.language ? (
                  <div>
                    <dt className="text-muted-foreground">Language</dt>
                    <dd>{summary.language}</dd>
                  </div>
                ) : null}
                {summary.identifier ? (
                  <div>
                    <dt className="text-muted-foreground">Identifier</dt>
                    <dd>{summary.identifier}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">Branch</dt>
                  <dd>{ref}</dd>
                </div>
                {summary.remoteEnhancedLayout !== undefined ? (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Editor layout on branch</dt>
                    <dd>
                      {summary.remoteEnhancedLayout ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Standard folders present</span>
                      ) : (
                        <span className="text-amber-800 dark:text-amber-200">
                          Standard folders not uploaded yet (same layout as &quot;new project&quot; on Home)
                        </span>
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className="border-border rounded-lg border p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ListTree className="size-4" />
                Books ({summary.books.length})
              </h2>
              {summary.books.length === 0 ? (
                <p className="text-muted-foreground text-sm">No USFM books detected yet.</p>
              ) : (
                <ul className="max-h-56 divide-y overflow-y-auto text-sm">
                  {summary.books.map((b) => (
                    <li key={b.code} className="flex justify-between gap-2 py-1">
                      <span className="font-medium">{b.code}</span>
                      <span className="text-muted-foreground truncate">{b.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border-border rounded-lg border p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Layers className="size-4" />
                Alignments & paths
              </h2>
              {canBootstrap ? (
                <div className="border-border bg-muted/30 mb-4 space-y-2 rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground">
                    Imported repos use the same editor layout as projects you create locally. Add the standard{' '}
                    <code className="text-xs">alignments/</code>, <code className="text-xs">checking/</code>, and manifest
                    hooks to this branch so they stay in sync.
                  </p>
                  {bootstrapErr ? <p className="text-destructive text-xs">{bootstrapErr}</p> : null}
                  <Button
                    type="button"
                    size="sm"
                    disabled={bootstrapBusy || !project}
                    onClick={() => {
                      if (!project) return;
                      const creds = loadDcsCredentials();
                      const token = creds?.token;
                      if (!token) return;
                      setBootstrapBusy(true);
                      setBootstrapErr(null);
                      void pushEnhancedLayoutToRemote({
                        host: host || undefined,
                        token,
                        owner,
                        repo,
                        ref: ref || 'main',
                        project,
                      })
                        .then(() => load())
                        .catch((e) => {
                          setBootstrapErr(e instanceof Error ? e.message : String(e));
                        })
                        .finally(() => {
                          setBootstrapBusy(false);
                        });
                    }}
                  >
                    {bootstrapBusy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      'Add standard layout to repository'
                    )}
                  </Button>
                </div>
              ) : null}
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Alignment sources</dt>
                  <dd>
                    {summary.alignmentSources.length === 0 ? (
                      <span className="text-muted-foreground">None declared</span>
                    ) : (
                      <ul className="list-inside list-disc">
                        {summary.alignmentSources.map((s) => (
                          <li key={s.identifier}>
                            <code>{s.path}</code> ({s.identifier})
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                {summary.activeAlignmentByBook && Object.keys(summary.activeAlignmentByBook).length > 0 ? (
                  <div>
                    <dt className="text-muted-foreground">Active alignment by book</dt>
                    <dd>
                      <ul className="text-xs">
                        {Object.entries(summary.activeAlignmentByBook).map(([book, lang]) => (
                          <li key={book}>
                            {book}: <code>{lang}</code>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">Checkings</dt>
                  <dd>{summary.checkingsPath ?? <span className="text-muted-foreground">Not configured</span>}</dd>
                </div>
                {summary.stagesFile ? (
                  <div>
                    <dt className="text-muted-foreground">Stages file</dt>
                    <dd>
                      <code>{summary.stagesFile}</code>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">Resources</dt>
                  <dd>{summary.resourcesPath ?? <span className="text-muted-foreground">Not configured</span>}</dd>
                </div>
              </dl>
            </section>

            {prov && Object.keys(prov.byBook).length > 0 ? (
              <section className="border-border rounded-lg border p-4">
                <h2 className="mb-2 text-sm font-semibold">Per-book source (x-source / x_source)</h2>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                  {Object.entries(prov.byBook).map(([book, rows]) => (
                    <li key={book}>
                      <span className="font-medium">{book}</span>
                      <ul className="text-muted-foreground ml-3 list-inside list-disc">
                        {rows.map((r) => (
                          <li key={`${book}-${r.identifier}-${r.version}`}>
                            {r.identifier} {r.language} v{r.version}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
