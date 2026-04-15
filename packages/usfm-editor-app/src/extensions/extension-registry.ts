import type { CheckingExtension } from '@usfm-tools/types';
import { ccrV2CheckingExtension } from './built-in/ccr-v2';

const builtIns: CheckingExtension[] = [ccrV2CheckingExtension];

export function listBuiltInCheckingExtensions(): readonly CheckingExtension[] {
  return builtIns;
}
