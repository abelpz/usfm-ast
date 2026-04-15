import type { ChecklistInstance, ChecklistItem, ChecklistTemplate } from '@usfm-tools/types';

/** Copy template items into a new checklist instance (pending). */
export function instantiateChecklistFromTemplate(options: {
  template: ChecklistTemplate;
  sessionId: string;
  stageId: string;
  instanceId?: string;
}): ChecklistInstance {
  const { template, sessionId, stageId } = options;
  const id = options.instanceId ?? template.id;
  const items: ChecklistItem[] = (template.templateItems ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    criteria: t.criteria,
    itemType: template.itemType,
    termRef: t.termRef,
    status: 'pending',
    assignees: [],
    comment: null,
  }));
  return {
    id,
    sessionId,
    stageId,
    label: template.label,
    templateId: template.id,
    created: new Date().toISOString(),
    items,
  };
}

/** One checklist item per verse in `verses` (same chapter). */
export function generateVerseCoverageItems(options: {
  bookCode: string;
  chapter: number;
  verses: number[];
  itemType?: ChecklistItem['itemType'];
}): ChecklistItem[] {
  const { chapter, verses, bookCode } = options;
  const itemType = options.itemType ?? 'scripture-range';
  return verses.map((verse) => ({
    id: `${bookCode.toLowerCase()}-${chapter}-${verse}`,
    label: `${bookCode.toUpperCase()} ${chapter}:${verse}`,
    itemType,
    ref: { start: { chapter, verse } },
    status: 'pending',
    assignees: [],
    comment: null,
  }));
}

export function mergeChecklistItems(target: ChecklistInstance, newItems: ChecklistItem[]): ChecklistInstance {
  const seen = new Set(target.items.map((i) => i.id));
  const merged = [...target.items];
  for (const it of newItems) {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      merged.push(it);
    }
  }
  return { ...target, items: merged };
}

export function updateItemStatus(
  instance: ChecklistInstance,
  itemId: string,
  patch: Partial<Pick<ChecklistItem, 'status' | 'completedBy' | 'completedAt' | 'comment' | 'assignees'>>,
): ChecklistInstance {
  return {
    ...instance,
    items: instance.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
  };
}
