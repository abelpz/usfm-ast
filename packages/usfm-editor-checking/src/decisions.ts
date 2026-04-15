import type { CheckingDecision, CheckingDecisionsFile } from '@usfm-tools/types';

export function appendDecision(file: CheckingDecisionsFile, decision: CheckingDecision): CheckingDecisionsFile {
  return { ...file, decisions: [...file.decisions, decision] };
}
