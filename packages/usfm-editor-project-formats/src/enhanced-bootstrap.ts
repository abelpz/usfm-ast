/**
 * Merge Scripture Burrito / RC manifests so the repo declares the same enhanced layout
 * as projects scaffolded from the app (alignments/, checking/, resources/).
 */

import type { RcXExtensions } from '@usfm-tools/types';

import type { ResourceContainerManifest } from './resource-container';
import type { SBIngredient, ScriptureBurritoMeta } from './scripture-burrito';

/** RC: ensure `x_extensions` documents alignments + checking + resources paths. */
export function mergeResourceContainerForEnhancedLayout(m: ResourceContainerManifest): ResourceContainerManifest {
  const today = new Date().toISOString().slice(0, 10);
  const dc = m.dublin_core ? { ...m.dublin_core, modified: today } : m.dublin_core;
  const xe0 = m.x_extensions ?? {};
  const { checkings: _legacyCheckings, ...xeRest } = xe0;
  void _legacyCheckings;
  const checkingPath =
    xe0.checking?.path?.trim() ||
    xe0.checkings?.path?.trim() ||
    './checking/';
  const stagesFile =
    xe0.checking?.stagesFile?.trim() ||
    xe0.checkings?.stagesFile?.trim() ||
    './checking/stages.json';
  const xe: RcXExtensions = {
    ...xeRest,
    alignments: {
      active: xe0.alignments?.active ?? {},
      sources: xe0.alignments?.sources ?? [],
    },
    checking: {
      schema_version: xe0.checking?.schema_version ?? '1',
      path: checkingPath,
      stagesFile,
    },
    resources: {
      path: xe0.resources?.path ?? 'resources/',
    },
  };
  return { ...m, dublin_core: dc, x_extensions: xe };
}

/** SB: register manifest/stages ingredients and `x-checkingConfig` when missing. */
export function mergeScriptureBurritoForEnhancedLayout(meta: ScriptureBurritoMeta): ScriptureBurritoMeta {
  const ingredients: Record<string, SBIngredient> = { ...meta.ingredients };
  const ensure = (path: string, ing: SBIngredient) => {
    if (!ingredients[path]) ingredients[path] = ing;
  };
  ensure('alignments/manifest.json', {
    mimeType: 'application/json',
    role: 'x-alignment-manifest',
  });
  ensure('checking/manifest.json', {
    mimeType: 'application/json',
    role: 'x-checking-manifest',
  });
  ensure('checking/stages.json', {
    mimeType: 'application/json',
    role: 'x-checking-stages',
  });
  return {
    ...meta,
    ingredients,
    'x-checkingConfig': meta['x-checkingConfig'] ?? {
      path: 'checking/',
      stagesFile: 'checking/stages.json',
    },
  };
}
