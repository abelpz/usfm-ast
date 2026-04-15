import type { ChecklistItem, ChecklistTemplate, CheckingSession, ReviewStage } from './checking';

/** Read-only context passed to checking extensions */
export interface CheckingExtensionContext {
  scopeBooks: string[];
  readFile(path: string): Promise<string | null>;
  manifestSummary: { format: 'sb' | 'rc' | 'unknown'; identifier?: string };
  /** Optional hook for TW-like resources (implemented by host) */
  getTranslationWords?(books: string[]): Promise<{ id: string; term: string; original: string; definition: string }[]>;
}

export interface CheckingExtension {
  id: string;
  name: string;
  description: string;
  generateStages?(context: CheckingExtensionContext): ReviewStage[];
  generateChecklists?(stageId: string, context: CheckingExtensionContext): ChecklistTemplate[];
  generateItems?(templateId: string, context: CheckingExtensionContext): Promise<ChecklistItem[]> | ChecklistItem[];
  onSessionStart?(session: CheckingSession, context: CheckingExtensionContext): void;
  onStageComplete?(stageId: string, context: CheckingExtensionContext): void;
  onItemStatusChange?(item: ChecklistItem, context: CheckingExtensionContext): void;
}
