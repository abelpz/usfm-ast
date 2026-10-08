import { randomBytes } from 'crypto';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { BookIdMismatchError } from '../errors';
import { extractBookId } from '../normalize/extractBookId';
import { normalizeToUsfm } from '../normalize/normalizeToUsfm';
import { prependCoverPage } from '../normalize/prependCoverPage';
import { findPtxprint } from '../runner/findPtxprint';
import { runPtxprint } from '../runner/runPtxprint';
import { scaffoldSingleBookProject } from '../scaffold/scaffoldProject';
import type { RenderOptions, RenderResult, ScriptureInput } from '../types';
import { DEFAULT_CONFIG_ID } from '../types';
import { withResolvedBodyFont } from '../withResolvedBodyFont';

function makeProjectId(prefix: string): string {
  const r = randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}${r}`;
}

/**
 * Typeset two scripture texts side-by-side (diglot / parallel columns) via PTXprint.
 *
 * Both inputs **must** share the same book code (`\id`). The left text occupies
 * the left column and the right text occupies the right column on each page.
 *
 * @param left  - Primary (left-column) scripture — USFM string or `ScriptureInput`.
 * @param right - Secondary (right-column) scripture — USFM string or `ScriptureInput`.
 * @param opts  - Rendering options applied to both columns.
 * @returns `{ pdf, log, bookCode, tempDir }`.
 *
 * @throws {BookIdMismatchError}     When left and right have different `\id` book codes.
 * @throws {PtxprintNotFoundError}   When `ptxprint` is not on PATH and `PTXPRINT_BIN` is unset.
 * @throws {PtxprintExitError}       When PTXprint exits with a non-zero code or the PDF is missing.
 * @throws {ScriptureNormalizeError} When either input cannot be converted to USFM.
 *
 * @example
 * ```ts
 * const { pdf } = await diglotToPdf(
 *   { format: 'usfm', text: spanishJohn },
 *   { format: 'usfm', text: englishJohn },
 *   { paperSize: 'A5' },
 * );
 * ```
 */
export async function diglotToPdf(
  left: ScriptureInput | string,
  right: ScriptureInput | string,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const usfmL = normalizeToUsfm(left);
  const usfmR = normalizeToUsfm(right);
  const bookL = extractBookId(usfmL);
  const bookR = extractBookId(usfmR);
  if (bookL !== bookR) {
    throw new BookIdMismatchError(
      `Diglot requires the same book in both texts (left \\id ${bookL}, right \\id ${bookR}).`,
    );
  }

  const workspaceTempDir = await mkdtemp(join(tmpdir(), 'ptxdrv-'));
  const projectsRoot = workspaceTempDir;
  const leftId = makeProjectId('L');
  const rightId = makeProjectId('R');

  const render = withResolvedBodyFont(opts);

  await scaffoldSingleBookProject({
    projectsRoot,
    projectId: leftId,
    bookCode: bookL,
    usfmText: usfmL,
    langIso: opts.langIso ?? 'en',
    configId: DEFAULT_CONFIG_ID,
    render,
    diglotSecondaryProjectId: rightId,
  });

  await scaffoldSingleBookProject({
    projectsRoot,
    projectId: rightId,
    bookCode: bookR,
    usfmText: usfmR,
    langIso: opts.langIso ?? 'en',
    configId: DEFAULT_CONFIG_ID,
    render,
  });

  const bin = findPtxprint({ explicitPath: opts.ptxprintPath });
  let { pdf, log } = await runPtxprint({
    bin,
    projectsRoot,
    projectId: leftId,
    bookCode: bookL,
    configId: DEFAULT_CONFIG_ID,
    workspaceTempDir,
    pagesPerSpread:  opts.pagesPerSpread,
    fontPaths:       opts.fontPaths,
    pdfVersion:      opts.pdfVersion,
    xetexTimeoutSec: opts.xetexTimeoutSec,
    xetexRuns:       opts.xetexRuns,
    quiet:           opts.quiet,
    noInternet:      opts.noInternet,
    ptxDefine:       opts.ptxDefine,
    debugMode:       opts.debugMode,
    logLevel:        opts.logLevel,
    logFile:         opts.logFile,
    macrosDir:       opts.macrosDir,
    extras:          opts.extras,
    onLog:           opts.onLog,
    signal:          opts.signal,
    timeoutMs:       opts.timeoutMs,
    keepTempDir:     opts.keepTempDir,
  });

  if (opts.coverImagePath != null) {
    pdf = Buffer.from(
      await prependCoverPage(pdf, opts.coverImagePath, opts.pagesPerSpread, opts.backCoverImagePath),
    );
  }

  return {
    pdf,
    log,
    bookCode: bookL,
    tempDir: workspaceTempDir,
  };
}
