import { copyFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

import { getParatextFilePrefix } from '../books/paratextNumber';
import type { RenderOptions } from '../types';

import { buildPtxprintCfg } from './ptxprintCfg';
import { buildSettingsXml } from './settingsXml';

/** Resolves package root (contains vendor/fonts) for dist/, src/, and various cwd. */
function driverPackageRoot(): string {
  const marker = join('vendor', 'fonts', 'SourceCodePro-Regular.ttf');
  const tryBase = (base: string): boolean =>
    existsSync(join(base, marker));
  const bases: string[] = [
    typeof __dirname !== 'undefined' ? join(__dirname, '..') : '',
    typeof __dirname !== 'undefined' ? join(__dirname, '..', '..') : '',
    join(process.cwd(), 'packages', 'ptxprint-driver'),
    join(process.cwd(), '..', 'ptxprint-driver'),
    process.cwd(),
  ].filter((s): s is string => s.length > 0);
  for (const base of bases) {
    if (tryBase(base)) {
      return base;
    }
  }
  return typeof __dirname !== 'undefined' ? join(__dirname, '..') : process.cwd();
}

/**
 * ptx2pdf `ptx-cropmarks.tex` hardcodes \\font\\idf@nt="Source Code Pro". PTXprint adds
 * `shared/fonts` to font search (see runjob.py). Ship OFL font so headless runs work without a GUI install.
 * DejaVu Serif (bitstream license, see vendor/fonts/DejaVu-LICENSE.txt) is the default body font: with
 * PTXprint may use a narrow fontconfig (e.g. no system font dirs). A TTF in `shared/fonts/`
 * keeps the default body face loadable. We no longer pass `--nofontcache` so PTXprint can
 * use system fonts when your TeX install supports it.
 */
async function copyBundledProjectFonts(projectDir: string): Promise<void> {
  const destDir = join(projectDir, 'shared', 'fonts');
  await mkdir(destDir, { recursive: true });
  const root = driverPackageRoot();
  const files: [string, string][] = [
    ['SourceCodePro-Regular.ttf', 'SourceCodePro-Regular.ttf'],
    ['DejaVuSerif.ttf', 'DejaVuSerif.ttf'],
  ];
  for (const [name, destName] of files) {
    const src = join(root, 'vendor', 'fonts', name);
    const dest = join(destDir, destName);
    try {
      await copyFile(src, dest);
    } catch {
      /* optional: missing in dev checkout without vendor font */
    }
  }
}


export interface BookEntry {
  bookCode: string;
  usfmText: string;
}

export interface ScaffoldSingleBookArgs {
  projectsRoot: string;
  projectId: string;
  bookCode: string;
  usfmText: string;
  langIso: string;
  configId: string;
  render: RenderOptions;
  diglotSecondaryProjectId?: string;
}

export interface ScaffoldMultiBookArgs {
  projectsRoot: string;
  projectId: string;
  books: BookEntry[];
  langIso: string;
  configId: string;
  render: RenderOptions;
}

/** Create a Paratext-shaped project folder for one or more books under `projectsRoot`. */
export async function scaffoldProject(args: ScaffoldMultiBookArgs): Promise<string> {
  const { projectsRoot, projectId, books, langIso, configId, render } = args;

  const projectDir = join(projectsRoot, projectId);
  await mkdir(projectDir, { recursive: true });

  const postPart = `${projectId}.usfm`;

  for (const { bookCode, usfmText } of books) {
    const prefix = getParatextFilePrefix(bookCode);
    const usfmName = `${prefix}${bookCode}${postPart}`;
    await writeFile(join(projectDir, usfmName), usfmText, 'utf8');
  }

  await writeFile(
    join(projectDir, 'Settings.xml'),
    buildSettingsXml({ langIso, fileNamePostPart: postPart }),
    'utf8',
  );

  const cfgDir = join(projectDir, 'shared', 'ptxprint', configId);
  await mkdir(cfgDir, { recursive: true });

  const cfg = buildPtxprintCfg({
    projectId,
    bookCodes: books.map((b) => b.bookCode),
    render,
  });

  await writeFile(join(cfgDir, 'ptxprint.cfg'), cfg, 'utf8');

  await copyBundledProjectFonts(projectDir);

  return projectDir;
}

/** Create one Paratext-shaped project folder under `projectsRoot` (single-book convenience wrapper). */
export async function scaffoldSingleBookProject(args: ScaffoldSingleBookArgs): Promise<string> {
  const {
    projectsRoot,
    projectId,
    bookCode,
    usfmText,
    langIso,
    configId,
    render,
    diglotSecondaryProjectId,
  } = args;

  const projectDir = join(projectsRoot, projectId);
  await mkdir(projectDir, { recursive: true });

  const postPart = `${projectId}.usfm`;
  const prefix = getParatextFilePrefix(bookCode);
  const usfmName = `${prefix}${bookCode}${postPart}`;
  await writeFile(join(projectDir, usfmName), usfmText, 'utf8');

  await writeFile(
    join(projectDir, 'Settings.xml'),
    buildSettingsXml({ langIso, fileNamePostPart: postPart }),
    'utf8',
  );

  const cfgDir = join(projectDir, 'shared', 'ptxprint', configId);
  await mkdir(cfgDir, { recursive: true });

  const cfg = buildPtxprintCfg({
    projectId,
    bookCode,
    render,
    diglot:
      diglotSecondaryProjectId !== undefined
        ? { secondaryProjectId: diglotSecondaryProjectId, secondaryConfigId: configId }
        : undefined,
  });

  await writeFile(join(cfgDir, 'ptxprint.cfg'), cfg, 'utf8');

  await copyBundledProjectFonts(projectDir);

  return projectDir;
}
