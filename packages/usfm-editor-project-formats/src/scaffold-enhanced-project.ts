/**
 * Initial files for a new **enhanced** Scripture Burrito repo (directory layout + extension hooks).
 * Consumers upload these via DCS Contents API after creating an empty repository.
 */

import yaml from 'js-yaml';

/** Default `checkings/stages.json` for new projects (SB or RC). */
export const DEFAULT_STAGES = `{
  "stages": [
    { "id": "partner-review", "label": "Partner Review", "description": "Peer review", "order": 1 }
  ]
}
`;

/** Relative path → UTF-8 file contents (no leading `./`). */
export function enhancedProjectInitialFiles(options: {
  /** BCP-47 language tag for the translation */
  languageTag: string;
  /** Human-readable project title */
  title: string;
}): Record<string, string> {
  const { languageTag, title } = options;
  const metadata = {
    format: 'scripture burrito',
    meta: {
      version: '1.0.0',
      category: 'scripture',
      defaultLocale: 'en',
      dateCreated: new Date().toISOString().slice(0, 10),
    },
    identification: {
      name: { en: title },
    },
    languages: [{ tag: languageTag, name: { en: languageTag } }],
    type: {
      flavorType: {
        name: 'scriptureText',
        flavor: { name: 'translation', projectType: 'Bible' },
        currentScope: {},
      },
    },
    ingredients: {},
    'x-checkingConfig': {
      path: 'checkings/',
      stagesFile: 'checkings/stages.json',
    },
  };

  return {
    'metadata.json': `${JSON.stringify(metadata, null, 2)}\n`,
    'ingredients/README.md':
      '# ingredients\n\nAdd USFM files here (e.g. `GEN.usfm`). Register each file under `ingredients` in `metadata.json`.\n',
    'alignments/README.md':
      '# alignments\n\nOptional per-source-language alignment JSON (`{lang}/{BOOK}.alignment.json`). See project docs.\n',
    'checkings/README.md':
      '# checkings\n\nReview stages, sessions, checklists, comments, and decisions live under this folder.\n',
    'checkings/stages.json': DEFAULT_STAGES.trim() + '\n',
    'resources/README.md': '# resources\n\nOptional bundled translation helps cache (TN, TW, …).\n',
    'extensions/checking/README.md': '# checking extensions\n\nOptional JS/TS workflow extensions for your organization.\n',
  };
}

/**
 * Initial files for a new **Resource Container** project (manifest + enhanced layout folders).
 * Paths are relative (no leading `./`).
 */
export function scaffoldRcProject(options: {
  /** Short project identifier (e.g. 3-8 letters). */
  identifier: string;
  /** BCP-47 language tag. */
  languageTag: string;
  /** Human-readable title. */
  title: string;
}): Record<string, string> {
  const { identifier, languageTag, title } = options;
  const today = new Date().toISOString().slice(0, 10);
  const manifest = {
    dublin_core: {
      conformsto: 'rc0.2',
      type: 'bundle',
      format: 'text/usfm',
      identifier,
      title,
      language: {
        identifier: languageTag,
        title: languageTag,
        direction: 'ltr',
      },
      version: '0.0.1',
      issued: today,
      modified: today,
    },
    checking: {
      checking_entity: [] as string[],
      checking_level: '1',
    },
    projects: [] as unknown[],
    x_extensions: {
      alignments: {
        active: {} as Record<string, unknown>,
        sources: [] as unknown[],
      },
      checkings: {
        path: 'checkings/',
        stagesFile: 'checkings/stages.json',
      },
      resources: {
        path: 'resources/',
      },
    },
  };

  return {
    'manifest.yaml': `${yaml.dump(manifest, { lineWidth: 120, noRefs: true, sortKeys: false }).trimEnd()}\n`,
    'checkings/stages.json': DEFAULT_STAGES.trim() + '\n',
    'alignments/README.md':
      '# alignments\n\nOptional per-source-language alignment JSON (`{lang}/{BOOK}.alignment.json`). See project docs.\n',
    'checkings/README.md':
      '# checkings\n\nReview stages, sessions, checklists, comments, and decisions live under this folder.\n',
    'resources/README.md': '# resources\n\nOptional bundled translation helps cache (TN, TW, …).\n',
  };
}
