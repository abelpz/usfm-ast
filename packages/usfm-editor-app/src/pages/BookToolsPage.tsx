import { Button } from '@/components/ui/button';
import { buildLocalProjectBookLaunch } from '@/lib/book-launch';
import { getBookTools, type BookToolContext } from '@/lib/book-tools-registry';
import { getProjectStorage } from '@/lib/project-storage';
import { cn } from '@/lib/utils';
import type { ProjectMeta } from '@usfm-tools/types';
import {
  listRCBooks,
  listSBBooks,
  parseResourceContainer,
  parseScriptureBurrito,
} from '@usfm-tools/project-formats';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

export function BookToolsPage() {
  const { id: projectId = '', bookCode: bookCodeParam = '' } = useParams<{ id: string; bookCode: string }>();
  const bookCode = useMemo(() => {
    try {
      return decodeURIComponent(bookCodeParam).trim();
    } catch {
      return bookCodeParam.trim();
    }
  }, [bookCodeParam]);

  const navigate = useNavigate();
  const storage = useMemo(() => getProjectStorage(), []);

  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [bookRow, setBookRow] = useState<{ code: string; name: string; path: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId.trim() || !bookCode) {
      setErr('Missing project or book.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const m = await storage.getProject(projectId.trim());
      if (!m) {
        setMeta(null);
        setBookRow(null);
        setErr('Project not found.');
        return;
      }
      setMeta(m);
      const yaml = await storage.readFile(projectId.trim(), 'manifest.yaml');
      let list: { code: string; name: string; path: string }[] = [];
      if (yaml) {
        const rc = parseResourceContainer(yaml);
        list = listRCBooks(rc);
      } else {
        const md = await storage.readFile(projectId.trim(), 'metadata.json');
        if (md) {
          try {
            const sb = parseScriptureBurrito(JSON.parse(md) as unknown);
            list = listSBBooks(sb);
          } catch {
            setErr('metadata.json could not be parsed.');
            return;
          }
        } else {
          setErr('manifest.yaml or metadata.json is required.');
          return;
        }
      }
      const upper = bookCode.toUpperCase();
      const b = list.find((x) => x.code.toUpperCase() === upper) ?? null;
      if (!b) {
        setBookRow(null);
        setErr(`Book “${bookCode}” is not in this project.`);
        return;
      }
      setBookRow(b);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bookCode, projectId, storage]);

  useEffect(() => {
    void load();
  }, [load]);

  const tools = useMemo(() => getBookTools(), []);

  const ctx: BookToolContext | null = useMemo(() => {
    if (!meta || !bookRow) return null;
    return {
      projectId: meta.id,
      meta,
      book: { code: bookRow.code, name: bookRow.name },
      navigate,
      buildLaunch: (overrides) => buildLocalProjectBookLaunch(meta, { code: bookRow.code, name: bookRow.name }, overrides),
    };
  }, [bookRow, meta, navigate]);

  if (loading) {
    return (
      <div className="bg-background text-foreground flex min-h-dvh items-center justify-center gap-2">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <span className="text-muted-foreground text-sm">Loading book…</span>
      </div>
    );
  }

  if (!ctx || err) {
    return (
      <div className="bg-background text-foreground flex min-h-dvh flex-col gap-4 p-6">
        <Button variant="ghost" size="sm" className="w-fit gap-1 px-0" asChild>
          <Link to={`/project/${encodeURIComponent(projectId)}`}>
            <ArrowLeft className="size-4" aria-hidden />
            Project
          </Link>
        </Button>
        <p className="text-destructive text-sm">{err ?? 'Book not found.'}</p>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
            <Link to={`/project/${encodeURIComponent(projectId)}`} aria-label="Back to project">
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {ctx.meta.name} — {ctx.book.name}
            </h1>
            <p className="text-muted-foreground font-mono text-xs">
              {ctx.book.code} · {ctx.meta.id}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 p-4">
        <h2 className="text-muted-foreground mb-4 text-sm font-medium">Tools for this book</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <li key={tool.id}>
                <button
                  type="button"
                  onClick={() => tool.run(ctx)}
                  className={cn(
                    'border-border bg-card hover:bg-accent/50 flex w-full flex-col items-start gap-1 rounded-lg border p-4 text-left shadow-sm transition-colors',
                  )}
                >
                  <div className="text-primary flex items-center gap-2">
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span className="text-foreground text-base font-semibold">{tool.label}</span>
                  </div>
                  {tool.description ? <p className="text-muted-foreground text-sm">{tool.description}</p> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
