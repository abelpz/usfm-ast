import { convertUSJDocumentToUSFM, usxXmlToUsfm } from '@usfm-tools/adapters';

import { ScriptureNormalizeError } from '../errors';
import type { ScriptureInput } from '../types';

function isScriptureInput(x: ScriptureInput | string): x is ScriptureInput {
  return typeof x === 'object' && x !== null && 'format' in x;
}

/** Normalize polymorphic input to a single USFM string (with trailing newline). */
export function normalizeToUsfm(input: ScriptureInput | string): string {
  try {
    let raw: string;
    if (!isScriptureInput(input)) {
      raw = input;
    } else if (input.format === 'usfm') {
      raw = input.text;
    } else if (input.format === 'usj') {
      raw = convertUSJDocumentToUSFM(input.usj as Parameters<typeof convertUSJDocumentToUSFM>[0]);
    } else if (input.format === 'usx') {
      raw = usxXmlToUsfm(input.xml);
    } else {
      throw new ScriptureNormalizeError('Unsupported scripture format');
    }

    let s = raw.replace(/^\uFEFF/, '');
    if (!s.endsWith('\n')) s += '\n';
    return s;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ScriptureNormalizeError(`Failed to normalize input to USFM: ${msg}`);
  }
}
