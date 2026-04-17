/**
 * Initial files for a new **enhanced** Scripture Burrito / RC repo (directory layout + manifests).
 * See `docs/30-project-format.md`. Consumers upload via DCS Contents API after creating a repository.
 */

import yaml from 'js-yaml';

/** Default `checking/stages.json` for new projects (SB or RC). */
export const DEFAULT_STAGES = `{
  "stages": [
    { "id": "partner-review", "label": "Partner Review", "description": "Peer review", "order": 1 }
  ]
}
`;

const ALIGNMENTS_MANIFEST = (sources: unknown[]) =>
  `${JSON.stringify({ version: '1', sources }, null, 2)}\n`;

const CHECKING_ROOT_MANIFEST = `${JSON.stringify(
  { version: '1', schemaVersion: '1', title: 'Translation checking' },
  null,
  2,
)}\n`;

const GITATTRIBUTES = `checking/*.json merge=union
`;

function minimalUsfm(bookCode: string, languageTag: string): string {
  const bk = bookCode.toUpperCase();
  return `\\id ${bk} ${languageTag.toUpperCase().slice(0, 3) || 'ENG'}
\\c 1
\\p
\\v 1 
`;
}

/** Relative path → UTF-8 file contents (no leading `./`). */
export function enhancedProjectInitialFiles(options: {
  /** BCP-47 language tag for the translation */
  languageTag: string;
  /** Human-readable project title */
  title: string;
  /** USFM book codes to create as empty chapter shells (e.g. TIT) */
  bookCodes?: string[];
  /** Optional first alignment source (empty directory created under alignments/) */
  alignmentSource?: {
    id: string;
    directory: string;
    language?: string;
    identifier?: string;
    version?: string;
  };
}): Record<string, string> {
  const { languageTag, title, bookCodes = [], alignmentSource } = options;
  const books = bookCodes.map((c) => c.toUpperCase());

  const alignmentSources = alignmentSource
    ? [
        {
          id: alignmentSource.id,
          language: alignmentSource.language ?? alignmentSource.id,
          identifier: alignmentSource.identifier ?? alignmentSource.id,
          version: alignmentSource.version ?? '0.0.1',
          directory: alignmentSource.directory,
        },
      ]
    : [];

  const ingredients: Record<string, unknown> = {};
  for (const bk of books) {
    const rel = `ingredients/${bk}.usfm`;
    ingredients[rel] = {
      mimeType: 'text/x-usfm',
      scope: { [bk]: [] },
    };
    const chkPath = `checking/${bk}.checking.json`;
    ingredients[chkPath] = {
      mimeType: 'application/json',
      role: 'x-checking',
      scope: { [bk]: [] },
    };
  }

  if (alignmentSource) {
    const srcDir = alignmentSource.directory;
    for (const bk of books) {
      const alignPath = `alignments/${srcDir}/${bk}.alignment.json`;
      ingredients[alignPath] = {
        mimeType: 'application/json',
        role: 'x-alignment',
        scope: { [bk]: [] },
      };
    }
  }

  ingredients['alignments/manifest.json'] = {
    mimeType: 'application/json',
    role: 'x-alignment-manifest',
  };
  ingredients['checking/manifest.json'] = {
    mimeType: 'application/json',
    role: 'x-checking-manifest',
  };

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
    ingredients,
    'x-checkingConfig': {
      path: 'checking/',
      stagesFile: 'checking/stages.json',
    },
  };

  const out: Record<string, string> = {
    'metadata.json': `${JSON.stringify(metadata, null, 2)}\n`,
    'alignments/manifest.json': ALIGNMENTS_MANIFEST(alignmentSources),
    'checking/manifest.json': CHECKING_ROOT_MANIFEST,
    '.gitattributes': GITATTRIBUTES,
    'ingredients/README.md':
      '# ingredients\n\nUSFM scripture text. Inline `\\\\zaln-*` milestones are optional when using external alignments.\n',
    'alignments/README.md':
      '# alignments\n\nPer-source alignment JSON: `{sourceId}/{BOOK}.alignment.json`. See project docs.\n',
    'checking/README.md':
      '# checking\n\nAppend-only checking records (`{BOOK}.checking.json`) and `manifest.json`.\n',
    'checking/stages.json': DEFAULT_STAGES.trim() + '\n',
    'resources/README.md': '# resources\n\nOptional bundled translation helps cache (TN, TW, …).\n',
    'extensions/checking/README.md': '# checking extensions\n\nOptional workflow extensions for your organization.\n',
  };

  const srcDir = alignmentSource?.directory;
  for (const bk of books) {
    out[`ingredients/${bk}.usfm`] = minimalUsfm(bk, languageTag);
    out[`checking/${bk}.checking.json`] = `${JSON.stringify(
      {
        meta: { book: bk, schemaVersion: '1' },
        entries: [],
      },
      null,
      2,
    )}\n`;
    if (alignmentSource && srcDir) {
      out[`alignments/${srcDir}/${bk}.alignment.json`] = `${JSON.stringify(
        {
          format: 'usfm-alignment',
          version: '1.0',
          translation: { id: identifierFromTitle(title), version: '0.0.1' },
          source: {
            id: alignmentSource.identifier ?? alignmentSource.id,
            version: alignmentSource.version ?? '0.0.1',
          },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          verses: {},
        },
        null,
        2,
      )}\n`;
    }
  }

  return out;
}

function identifierFromTitle(title: string): string {
  const s = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 32) || 'project';
}

/**
 * Default root `README.md` for a new Resource Container project or when a Door43 repo has none.
 */
export function defaultRcProjectReadme(options: {
  title: string;
  identifier: string;
  languageTag: string;
}): string {
  const { title, identifier, languageTag } = options;
  return `# ${title}

- **Identifier:** \`${identifier}\`
- **Language (BCP-47):** \`${languageTag}\`

USFM translation project. Add books and manage releases from the project dashboard in the editor.
`;
}

/**
 * Default **LICENSE** text: Creative Commons Attribution-ShareAlike 4.0 International,
 * aligned with common unfoldingWord / Door43 scripture resources.
 * Full legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode
 */
export const CC_BY_SA_4_LICENSE_TEXT = `Creative Commons Attribution-ShareAlike 4.0 International

Copyright (C) The Licensor (see repository contributors).

This work is licensed under the Creative Commons Attribution-ShareAlike 4.0 International License.

You are free to:
  Share — copy and redistribute the material in any medium or format
  Adapt — remix, transform, and build upon the material for any purpose, even commercially

Under the following terms:
  Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
  ShareAlike — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

No additional restrictions — You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.

Full license text: https://creativecommons.org/licenses/by-sa/4.0/legalcode
`;

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
      checking: {
        schema_version: '1',
        path: './checking/',
      },
      resources: {
        path: 'resources/',
      },
    },
  };

  return {
    'manifest.yaml': `${yaml.dump(manifest, { lineWidth: 120, noRefs: true, sortKeys: false }).trimEnd()}\n`,
    'README.md': defaultRcProjectReadme({ title, identifier, languageTag }),
    LICENSE: CC_BY_SA_4_LICENSE_TEXT,
    'alignments/manifest.json': ALIGNMENTS_MANIFEST([]),
    'checking/manifest.json': CHECKING_ROOT_MANIFEST,
    'checking/stages.json': DEFAULT_STAGES.trim() + '\n',
    '.gitattributes': GITATTRIBUTES,
    'alignments/README.md':
      '# alignments\n\nOptional per-source alignment JSON (`{sourceId}/{BOOK}.alignment.json`). See project docs.\n',
    'checking/README.md':
      '# checking\n\nAppend-only checking JSON per book. See project docs.\n',
    'resources/README.md': '# resources\n\nOptional bundled translation helps cache (TN, TW, …).\n',
  };
}

/**
 * Standard `alignments/`, `checking/`, `resources/` files (and `.gitattributes`) without `manifest.yaml` / `metadata.json`.
 * Use when upgrading an existing Door43 repo to match projects created from the home page.
 */
export function enhancedLayoutSupportFiles(): Record<string, string> {
  return {
    'alignments/manifest.json': ALIGNMENTS_MANIFEST([]),
    'checking/manifest.json': CHECKING_ROOT_MANIFEST,
    'checking/stages.json': DEFAULT_STAGES.trim() + '\n',
    '.gitattributes': GITATTRIBUTES,
    'alignments/README.md':
      '# alignments\n\nOptional per-source alignment JSON (`{sourceId}/{BOOK}.alignment.json`). See project docs.\n',
    'checking/README.md':
      '# checking\n\nAppend-only checking JSON per book. See project docs.\n',
    'resources/README.md': '# resources\n\nOptional bundled translation helps cache (TN, TW, …).\n',
  };
}
