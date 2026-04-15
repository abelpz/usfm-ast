import type { CheckingExtension, ReviewStage } from '@usfm-tools/types';

/** Same ids as {@link CCR_V2_DEFAULT_STAGES} in `@usfm-tools/checking` (kept inline for bundler-friendly editor-app). */
const CCR_V2_STAGES: ReviewStage[] = [
  { id: 'borrador_tpl', label: 'Borrador TPL (First Draft)', order: 1 },
  { id: 'borrador_tps', label: 'Borrador TPS (Second Draft)', order: 2 },
  { id: 'ayudas', label: 'Ayudas (Translation Helps)', order: 3 },
  { id: 'afinacion', label: 'Afinación (Fine-tuning)', order: 4 },
  { id: 'armonizacion', label: 'Armonización (Harmonization)', order: 5 },
  { id: 'aprobacion', label: 'Aprobación (Approval)', order: 6 },
  { id: 'publicacion', label: 'Publicación (Publication)', order: 7 },
];

export const ccrV2CheckingExtension: CheckingExtension = {
  id: 'ccr-v2',
  name: 'CCR v2 workflow',
  description: 'Standard 7-phase CCR v2 translation checking stages (template for stages.json).',
  generateStages: () => CCR_V2_STAGES.map((s) => ({ ...s })),
};
