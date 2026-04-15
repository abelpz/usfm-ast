import type { ReviewStage, ReviewStageWorkflow } from '@usfm-tools/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Default CCR v2–style stages (teams may replace `stages.json` entirely). */
export const CCR_V2_DEFAULT_STAGES: ReviewStage[] = [
  { id: 'borrador_tpl', label: 'Borrador TPL (First Draft)', order: 1 },
  { id: 'borrador_tps', label: 'Borrador TPS (Second Draft)', order: 2 },
  { id: 'ayudas', label: 'Ayudas (Translation Helps)', order: 3 },
  { id: 'afinacion', label: 'Afinación (Fine-tuning)', order: 4 },
  { id: 'armonizacion', label: 'Armonización (Harmonization)', order: 5 },
  { id: 'aprobacion', label: 'Aprobación (Approval)', order: 6 },
  { id: 'publicacion', label: 'Publicación (Publication)', order: 7 },
];

export function parseReviewStageWorkflow(json: unknown): ReviewStageWorkflow {
  if (!isRecord(json) || !Array.isArray(json.stages)) {
    throw new Error('stages.json: root must be { stages: [...] }');
  }
  const stages: ReviewStage[] = [];
  for (const raw of json.stages) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    const order = typeof raw.order === 'number' ? raw.order : NaN;
    if (!id || !label || !Number.isFinite(order)) continue;
    const description = typeof raw.description === 'string' ? raw.description : undefined;
    const defaultChecklists = Array.isArray(raw.defaultChecklists)
      ? (raw.defaultChecklists as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined;
    stages.push({ id, label, description, order, defaultChecklists });
  }
  if (!stages.length) throw new Error('stages.json: no valid stages');
  stages.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { stages };
}

export function getStageById(workflow: ReviewStageWorkflow, id: string): ReviewStage | undefined {
  return workflow.stages.find((s) => s.id === id);
}
