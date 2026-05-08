import type { ProjectLaunchConfig } from '@/lib/project-launch';
import type { ProjectMeta } from '@usfm-tools/types';
import { AlignLeft, Pencil } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';

const tools = new Map<string, BookTool>();

export type BookToolContext = {
  projectId: string;
  meta: ProjectMeta;
  book: { code: string; name: string };
  navigate: NavigateFunction;
  /**
   * Baseline local-book launch; merge `overrides` to open the editor with different flags
   * (e.g. {@link ProjectLaunchConfig.openAlignmentPanel}).
   */
  buildLaunch: (overrides?: Partial<ProjectLaunchConfig>) => ProjectLaunchConfig;
};

export type BookTool = {
  id: string;
  label: string;
  description?: string;
  /** Lower sorts first. */
  order?: number;
  icon: LucideIcon;
  run: (ctx: BookToolContext) => void;
};

/** Last call for a given `id` wins (allows hot-reload and layered registration). */
export function registerBookTool(tool: BookTool) {
  tools.set(tool.id, tool);
}

export function getBookTools(): BookTool[] {
  return [...tools.values()].sort((a, b) => {
    const oa = a.order ?? 100;
    const ob = b.order ?? 100;
    if (oa !== ob) return oa - ob;
    return a.label.localeCompare(b.label);
  });
}

export function registerDefaultBookTools() {
  registerBookTool({
    id: 'edit',
    order: 10,
    label: 'Edit',
    description: 'Translate and format USFM in the main editor.',
    icon: Pencil,
    run(ctx) {
      ctx.navigate(`/project/${encodeURIComponent(ctx.projectId)}/editor`, {
        state: ctx.buildLaunch(),
      });
    },
  });
  registerBookTool({
    id: 'align',
    order: 20,
    label: 'Align',
    description: 'Open word alignment against source text.',
    icon: AlignLeft,
    run(ctx) {
      ctx.navigate(`/project/${encodeURIComponent(ctx.projectId)}/editor`, {
        state: ctx.buildLaunch({ openAlignmentPanel: true }),
      });
    },
  });
}
